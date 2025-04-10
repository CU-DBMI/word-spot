<template>
  <section>
    <div class="input">
      <h2>Text</h2>

      <AppTextbox
        ref="textElement"
        v-model="text"
        class="text-textbox"
        placeholder="Text to check"
      />

      <div class="controls">
        <AppButton v-if="exampleText.trim()" @click="text = exampleText">
          Example
        </AppButton>
        <AppUpload
          :drop-zone="textElement?.element"
          :accept="uploadMimeTypes"
          :tooltip="uploadTooltip"
          @files="(files) => (text = files[0]?.text ?? '')"
        />
      </div>

      <h2>Search</h2>

      <AppTextbox
        ref="searchElement"
        v-model="search"
        class="search-textbox"
        placeholder="Phrases to check for"
        v-tooltip="'Comma or newline-separated'"
      />

      <div class="controls">
        <AppButton v-if="exampleSearch.trim()" @click="search = exampleSearch">
          Example
        </AppButton>
        <AppUpload
          :drop-zone="searchElement?.element"
          :accept="uploadMimeTypes"
          :tooltip="uploadTooltip"
          @files="(files) => (search = files[0]?.text ?? '')"
        />
      </div>

      <label>
        Exactness
        <input
          v-model.number="exactness"
          type="range"
          :min="0"
          :max="1"
          :step="0.01"
        />
        {{ (100 * exactness).toFixed(0) }}%
      </label>
    </div>

    <div class="output">
      <h2>Summary</h2>

      <div ref="summaryElement" v-if="summary.total" class="summary">
        <span>Total Matches</span>
        <span>
          {{ summary.total.toLocaleString() }}
        </span>

        <template
          v-for="([search, matches], countIndex) in summary.counts"
          :key="countIndex"
        >
          <span>{{ search }}</span>
          <span>{{ matches.toLocaleString() }}</span>
        </template>
      </div>

      <p v-if="!debouncedText.length" class="placeholder">Enter some text</p>
      <p v-if="!debouncedSearch.length" class="placeholder">Enter a search</p>
      <p
        v-if="
          debouncedText.length &&
          debouncedSearch.length &&
          !summary.total &&
          !progress
        "
        class="placeholder"
      >
        No matches
      </p>
      <p v-if="progress" class="placeholder">
        Checking {{ (100 * progress).toFixed() }}%
      </p>

      <h2>Results</h2>

      <template v-if="withSlices.length">
        <p
          v-for="(paragraph, paragraphIndex) in withSlices"
          :key="paragraphIndex"
        >
          <span
            v-for="slice in paragraph"
            :key="slice.id"
            tabindex="0"
            :class="[
              slice.strength && 'highlight',
              slice.highlightIds.includes(selectedHighlight?.id ?? '') &&
                'highlight-hover',
            ]"
            :style="{ '--strength': slice.strength }"
            @mouseenter="(event) => select(slice, event)"
            @mouseleave="deselect"
            @focus="(event) => select(slice, event)"
            @blur="deselect"
          >
            {{ slice.original }}
          </span>
        </p>
      </template>

      <p v-if="!debouncedText.length" class="placeholder">Enter some text</p>
      <p v-if="progress" class="placeholder">
        Checking {{ (100 * progress).toFixed() }}%
      </p>
    </div>
  </section>
  <Teleport v-if="selectedHighlight" to="body">
    <div ref="tooltipElement" style="display: none; position: absolute">
      <div>"{{ selectedHighlight.text }}" matches...</div>
      <div class="indent">
        <div v-for="(match, key) in selectedHighlight.matches" :key="key">
          • "{{ match.search }}" ({{ (100 * match.score).toFixed(0) }}%)
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";
import { tippy } from "vue-tippy";
import { groupBy, map, max, orderBy, pick, uniq } from "lodash";
import type { Instance } from "tippy.js";
import { useDebounce, useLocalStorage } from "@vueuse/core";
import exampleSearch from "@/assets/example-search.txt?raw";
import exampleText from "@/assets/example-text.txt?raw";
import AppButton from "@/components/AppButton.vue";
import AppTextbox from "@/components/AppTextbox.vue";
import AppUpload from "@/components/AppUpload.vue";
import { useScrollable } from "@/util/composables";
import { pairs } from "@/util/misc";
import { getPool } from "@/util/pool";
import { splitWords } from "@/util/search";
import type { Match } from "@/util/search";
import * as SearchAPI from "@/util/search";
import SearchWorker from "@/util/search?worker";

/** upload settings */
const uploadMimeTypes = [
  ".txt",
  ".doc",
  ".docx",
  ".pdf",
  "text/plain",
  "application/pdf",
  "application/msword",
];
const uploadTooltip =
  "Load text, Word, or PDF file. Or drag & drop file onto textbox.";

/** elements */
const textElement = useTemplateRef("textElement");
const searchElement = useTemplateRef("searchElement");
const summaryElement = useTemplateRef("summaryElement");
const tooltipElement = useTemplateRef("tooltipElement");

/** scroll indicators */
useScrollable(summaryElement);

/** debug */
// window.localStorage.clear();

/** state */
const text = useLocalStorage("text", "");
const search = useLocalStorage("search", "");
const exactness = ref(1);
const selectedHighlight = ref<Highlight>();
const selectedTooltip = ref<Instance>();
const progress = ref(0);

/** debounced state */
const debouncedText = useDebounce(text, 500);
const debouncedSearch = useDebounce(search, 500);
const debouncedExactness = useDebounce(exactness, 500);

/** split text by paragraph */
const paragraphs = computed(() =>
  debouncedText.value.split(/\n+/).filter((paragraph) => paragraph.trim()),
);
/** split search by separators */
const searches = computed(() =>
  debouncedSearch.value.split(/[\n,]+/).filter((entry) => entry.trim()),
);

/** whether to use exact search */
const exact = computed(() => debouncedExactness.value >= 1);

type WithMatches = { paragraph: string; matches: Match[] }[];

/** exact search matches, per paragraph */
const withExactMatches = shallowRef<WithMatches>([]);
/** fuzzy search matches, per paragraph */
const withFuzzyMatches = shallowRef<WithMatches>([]);
/** matches, depending on threshold */
const withMatches = shallowRef<WithMatches>([]);

watch(
  /** when inputs change */
  [paragraphs, searches],
  () => {
    console.debug("reset matches");
    /** reset matches */
    withExactMatches.value = [];
    withFuzzyMatches.value = [];
  },
  { immediate: true },
);

/** make pool of webworkers */
const { run, cleanup } = getPool<typeof SearchAPI>(SearchWorker);

/** update matches */
watch(
  [paragraphs, searches, exact],
  async () => {
    console.debug("update matches");
    /** cancel any in-progress work */
    await cleanup();

    /** if matches already exist, don't recalculate */
    if (exact.value && withExactMatches.value.length) return;
    if (!exact.value && withFuzzyMatches.value.length) return;

    /** progress */
    progress.value = 0.000001;
    let done = 0;

    /** pre-compute search windows */
    const _searches = searches.value.map(
      (search) => [search.toLowerCase(), splitWords(search).length] as const,
    );

    const withMatches =
      (await Promise.all(
        /** for each paragraph */
        paragraphs.value.map(async (paragraph) => {
          /** get search results */
          const matches = await run((worker) =>
            worker.getMatches(paragraph.toLowerCase(), _searches, exact.value),
          );
          /** update progress */
          progress.value = ++done / paragraphs.value.length;
          return { paragraph, matches };
        }),
      ).catch(console.warn)) ?? [];

    /** cancel any in-progress work */
    await cleanup();

    /** progress */
    progress.value = 0;

    /** set appropriate matches */
    if (exact.value) withExactMatches.value = withMatches;
    else withFuzzyMatches.value = withMatches;
  },
  { immediate: true },
);

/** choose matches */
watch(
  [withExactMatches, withFuzzyMatches, exact, debouncedExactness],
  () => {
    console.debug("choose matches");
    withMatches.value =
      /** which matches to use */
      (exact.value ? withExactMatches.value : withFuzzyMatches.value).map(
        ({ paragraph, matches }) => ({
          paragraph,
          /** remove matches below threshold */
          matches: matches.filter(
            (match) => match.score >= debouncedExactness.value,
          ),
        }),
      );
  },
  { immediate: true },
);

type Highlight = {
  id: string;
  text: string;
  matches: {
    search: string;
    score: number;
  }[];
};

type Slice = {
  id: string;
  original: string;
  highlights: Highlight[];
  highlightIds: string[];
  strength: number;
};

/** highlighted slices, per paragraph */
const withSlices = shallowRef<Slice[][]>([]);

watch(
  [withMatches],
  () => {
    console.debug("make slices");

    /** unique id for this watch run */
    const run = Math.random();

    /** match limit per paragraph */
    const matchLimit = Math.floor(10000 / (withMatches.value.length || 10));

    /** convert matches into sequentially-renderable highlighted dom elements */
    const newSlices: Slice[][] = [];

    /** for each paragraph */
    for (let index = 0; index < withMatches.value.length; index++) {
      const newSlice: Slice[] = [];

      /** input paragraph and matches */
      let { paragraph, matches } = withMatches.value[index]!;

      /** hard limit matches to avoid rendering slowness or crashes */
      matches = matches.slice(0, matchLimit);

      /** put withSlices that start later first, for benefit of hover */
      matches = orderBy(matches, "start", "desc");

      /** get in-order list of start/end indices, defining slice boundaries */
      const indices = orderBy(
        uniq([
          0,
          ...matches.flatMap(({ start, end }) => [start, end]),
          paragraph.length,
        ]),
      );

      /** for each slice */
      for (const [start, end] of pairs(indices)) {
        /** get all matches within slice range */
        const sliceMatches = matches.filter(
          (match) => !(match.end <= start || match.start >= end),
        );

        /** get unique id for slice */
        const id = [run, index, start, end].join("-");

        /** original slice of paragraph to render */
        const original = paragraph.slice(start, end);

        /** list of highlights associated with slice */
        const highlights = Object.values(groupBy(sliceMatches, "text"))
          .map((fullMatches) => {
            /** these fields should be same for all matches, so just take first */
            const firstMatch = fullMatches[0];
            if (!firstMatch) return;
            const { text, start, end } = firstMatch;

            /**
             * only keep fields that we need, and that are different for every
             * match
             */
            const matches = map(fullMatches, (match) =>
              pick(match, ["search", "score"]),
            )
              /** hard limit matches to avoid cluttering tooltip */
              .slice(0, 5);

            const highlight = { text, matches };

            /** get unique id for highlight */
            const id = [run, index, start, end].join("-");

            return { id, ...highlight };
          })
          .filter((highlight) => !!highlight);

        /** extract out highlight ids for convenience */
        const highlightIds = map(highlights, "id");

        /** "strength", used for coloring */
        const strength = max(map(sliceMatches, "score")) ?? 0;

        newSlice.push({ id, original, highlights, highlightIds, strength });
      }

      newSlices.push(newSlice);
    }

    withSlices.value = newSlices;
  },
  { immediate: true },
);

/** summary info */
const summary = computed(() => {
  console.debug("get summary");
  const allMatches = map(withMatches.value, "matches").flat();
  const total = allMatches.length;
  let counts = Object.entries(groupBy(allMatches, "search")).map(
    ([search, matches]) => [search, matches.length] as const,
  );
  /** hard limit counts to avoid rendering slowness */
  counts = orderBy(counts, "[1]", "desc").slice(0, 100);
  return { total, counts };
});

/** select slice highlight */
const select = async (slice: Slice, event: Event) => {
  /** select highlight */
  selectedHighlight.value = slice.highlights[0];
  /** wait for tooltip template to render */
  await nextTick();
  /** create tippy instance */
  selectedTooltip.value = tippy(event.currentTarget as Element);
  /** set content from (invisibly) rendered teleported template */
  selectedTooltip.value.setContent(tooltipElement.value?.innerHTML ?? "");
  /** programmatically show */
  selectedTooltip.value.show();
};

/** deselect slice highlight */
const deselect = () => {
  selectedHighlight.value = undefined;
  /** clean up tippy */
  selectedTooltip.value?.destroy();
};
</script>

<style scoped>
section {
  display: flex;
  padding: 0;
}

@media (max-width: 600px) {
  section {
    flex-direction: column;
  }

  .input {
    position: unset !important;
  }

  .input > * {
    width: 100% !important;
    max-width: unset !important;
  }
}

.input,
.output {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  gap: 20px;
}

.input > :first-child,
.output > :first-child {
  margin-top: 0;
}

.input > :last-child,
.output > :last-child {
  margin-bottom: 0;
}

.input {
  position: sticky;
  top: 0;
  max-height: 100vh;
}

.text-textbox {
  flex-shrink: 0;
  width: 25vw;
  max-width: 50vw;
  height: 25vh;
}

.search-textbox {
  flex-grow: 1;
  flex-shrink: 0;
  width: 0;
  min-width: 100%;
  resize: vertical;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}

.output {
  flex-grow: 1;
  align-self: flex-start;
}

.summary {
  --cols: 3;
  display: grid;
  grid-template-columns: repeat(calc(2 * var(--cols)), auto);
  align-content: flex-start;
  width: 100%;
  height: 200px;
  min-height: 100px;
  max-height: max-content;
  padding: 20px;
  overflow-x: auto;
  overflow-y: auto;
  gap: 10px 20px;
  border-radius: var(--rounded);
  box-shadow: var(--shadow);
  resize: vertical;
}

.summary > * {
  min-width: 0;
}

.summary > :nth-child(1) {
  font-weight: 600;
}

.summary > :nth-child(3) {
  grid-column: 1;
}

.summary > :nth-child(even) {
  font-weight: 500;
}

@media (max-width: 1200px) {
  .summary {
    --cols: 2;
  }
}

@media (max-width: 800px) {
  .summary {
    --cols: 1;
  }
}

.placeholder {
  color: gray;
}

.highlight {
  background: hsla(340, 100%, 75%, var(--strength));
}

.highlight-hover {
  box-shadow: 0 2px 0 var(--theme);
}

aside {
  position: fixed;
  right: 0;
  bottom: 0;
}

.indent {
  padding-left: 10px;
}
</style>
