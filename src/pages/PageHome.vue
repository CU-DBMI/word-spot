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
        <AppButton @click="text = exampleText">Example</AppButton>
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
        <AppButton @click="search = exampleSearch">Example</AppButton>
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

        <template v-for="([search, matches], key) in summary.counts" :key="key">
          <span>{{ search }}</span>
          <span>{{ matches.toLocaleString() }}</span>
        </template>
      </div>

      <p v-if="!text.length" class="placeholder">Enter some text</p>
      <p v-if="!search.length" class="placeholder">Enter a search</p>
      <p v-if="!summary.total && !progress" class="placeholder">No matches</p>
      <p v-if="progress" class="placeholder">
        Checking {{ (100 * progress).toFixed() }}%
      </p>

      <h2>Results</h2>

      <template v-if="slices.length">
        <p v-for="(paragraph, key) in slices" :key="key">
          <AppTooltip
            v-for="slice in paragraph"
            :key="slice.id"
            :class="[
              slice.strength && 'highlight',
              slice.highlightIds.includes(hover) && 'highlight-hover',
            ]"
            :style="{ '--strength': slice.strength }"
            @mouseenter="setHover(slice.highlights)"
            @mouseleave="clearHover"
          >
            <template #default>{{ slice.original }}</template>
            <template v-if="slice.highlights[0]" #content>
              <div class="tooltip">
                <div>"{{ slice.highlights[0].text }}" matches...</div>
                <div class="tooltip-indent">
                  <div
                    v-for="(match, key) in slice.highlights[0].matches"
                    :key="key"
                  >
                    • "{{ match.search }}" ({{
                      (100 * match.score).toFixed(0)
                    }}%)
                  </div>
                </div>
              </div>
            </template>
          </AppTooltip>
        </p>
      </template>

      <p v-if="!text.length" class="placeholder">Enter some text</p>
      <p v-if="progress" class="placeholder">
        Checking {{ (100 * progress).toFixed() }}%
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, useTemplateRef, watch } from "vue";
import { groupBy, inRange, isEqual, map, max, orderBy, range } from "lodash";
import { useDebounce, useLocalStorage } from "@vueuse/core";
import exampleSearch from "@/assets/example-search.txt?raw";
import exampleText from "@/assets/example-text.txt?raw";
import AppButton from "@/components/AppButton.vue";
import AppTextbox from "@/components/AppTextbox.vue";
import AppUpload from "@/components/AppUpload.vue";
import { useScrollable } from "@/util/composables";
import { getPool } from "@/util/pool";
import { splitWords } from "@/util/search";
import type { Match } from "@/util/search";
import * as SearchAPI from "@/util/search";
import SearchWorker from "@/util/search?worker&url";

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

/** scroll indicators */
useScrollable(summaryElement);

/** state */
const text = useLocalStorage("text", "");
const search = useLocalStorage("search", "");
const exactness = ref(1);
const hover = ref("");
const progress = ref(0);

/** debounced state */
const debouncedText = useDebounce(text, 1000);
const debouncedSearch = useDebounce(search, 1000);
const debouncedExactness = useDebounce(exactness, 500);

/** split text by paragraph */
const paragraphs = computed(() =>
  debouncedText.value.split(/\n+/).filter((paragraph) => paragraph.trim()),
);
/** split search by separators */
const searches = computed(() =>
  debouncedSearch.value.split(/[\n,]+/).filter((entry) => entry.trim()),
);

/** get max word window forsearch */
const wordWindow = computed(
  () => max(searches.value.map((search) => splitWords(search).length)) ?? 1,
);

/** whether to use exact search */
const exact = computed(() => debouncedExactness.value >= 1);

/** exact search matches, per paragraph */
const exactMatches = shallowRef<Match[][]>([]);
/** fuzzy search matches, per paragraph */
const fuzzyMatches = shallowRef<Match[][]>([]);
/** matches, depending on threshold */
const matches = shallowRef<Match[][]>([]);

watch(
  /** when inputs change */
  [paragraphs, searches, wordWindow],
  () => {
    /** reset matches */
    exactMatches.value = [];
    fuzzyMatches.value = [];
  },
  { immediate: true },
);

/** make pool of webworkers */
const { run, cleanup } = getPool<typeof SearchAPI>(SearchWorker);

/** update matches */
watch(
  [paragraphs, searches, wordWindow, exact, exactMatches, fuzzyMatches],
  async () => {
    /** cancel any in-progress work */
    await cleanup();

    /** if matches already exist, don't recalculate */
    if (exact.value && exactMatches.value.length) return;
    if (!exact.value && fuzzyMatches.value.length) return;

    /** progress */
    progress.value = 0;
    let done = 0;

    const matches =
      (await Promise.all(
        /** for each paragraph */
        paragraphs.value.map(async (paragraph) => {
          /** get search results */
          const matches = await run(
            "getMatches",
            paragraph,
            searches.value,
            wordWindow.value,
            exact.value,
          );
          /** update progress */
          progress.value = done++ / paragraphs.value.length;
          return matches;
        }),
      ).catch(console.warn)) ?? [];

    /** progress */
    progress.value = 0;

    /** set appropriate matches */
    if (exact.value) exactMatches.value = matches;
    else fuzzyMatches.value = matches;
  },
  { immediate: true },
);

/** update matches */
watch(
  [exactMatches, fuzzyMatches, debouncedExactness],
  () => {
    matches.value =
      /** which matches to use */
      (debouncedExactness.value < 1 ? fuzzyMatches.value : exactMatches.value)
        /** remove matches below threshold */
        .map((matches) =>
          matches.filter((match) => match.score >= debouncedExactness.value),
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
const slices = shallowRef<Slice[][]>([]);

watch(
  [matches],
  () => {
    /** unique id for this computation */
    const comp = Math.random();

    /** match limit per paragraph */
    const matchLimit = Math.floor(10000 / (matches.value.length ?? 10));

    const newSlices = matches.value.map((matches, paragraphIndex) => {
      /** associated input paragraph */
      const paragraph = paragraphs.value[paragraphIndex]!;
      /** hard limit matches to avoid rendering slowness or crashes */
      matches = matches.slice(0, matchLimit);
      /** sort so array order doesn't matter for equality */
      /** put slices that start later first, for benefit of hover */
      matches = orderBy(matches, "start", "desc");

      /** convert matches into sequentially-renderable highlighted dom elements */
      return (
        range(0, paragraph.length)
          /** for each character in paragraph */
          .map((char) => ({
            char,
            matches:
              /** get match highlights that include this char */
              matches.filter(({ start, end }) => inRange(char, start, end)),
          }))
          .filter(
            /** remove char entries that are same as previous */
            ({ matches }, index, array) =>
              !isEqual(matches, array[index - 1]?.matches),
          )
          .map(({ char, matches }, index, array) => {
            const start = char;
            const end = array[index + 1]?.char ?? paragraph.length;

            /** get unique id for slice */
            const id = [comp, paragraphIndex, start, end].join("-");

            /** original slice of paragraph to render */
            const original = paragraph.slice(start, end);

            /** list of highlights associated with slice */
            const highlights = Object.values(groupBy(matches, "text")).map(
              (fullMatches) => {
                /**
                 * these fields should be same for all matches, so just take
                 * first
                 */
                const { text, start, end } = fullMatches[0]!;

                /**
                 * only keep fields that we need, and that are different for
                 * every match
                 */
                const matches = map(fullMatches, ({ search, score }) => ({
                  search,
                  score,
                }))
                  /** hard limit matches to avoid cluttering tooltip */
                  .slice(0, 5);

                const highlight = { text, matches };

                /** get unique id for highlight */
                const id = [comp, paragraphIndex, start, end].join("-");

                return { id, ...highlight };
              },
            );

            /** extract out highlight ids for convenience */
            const highlightIds = map(highlights, "id");

            /** "strength", used for coloring */
            const strength = max(map(matches, "score")) ?? 0;

            return { id, original, highlights, highlightIds, strength };
          })
      );
    });

    slices.value = newSlices;
  },
  { immediate: true },
);

/** summary info */
const summary = computed(() => {
  const allMatches = matches.value.flat();
  const total = allMatches.length;
  const counts = orderBy(
    Object.entries(groupBy(allMatches, "search")).map(
      ([search, matches]) => [search, matches.length] as const,
    ),
    "[1]",
    "desc",
  )
    /** hard limit counts to avoid rendering slowness */
    .slice(0, 100);
  return { total, counts };
});

/** handle hover */
const setHover = (highlights: Highlight[]) =>
  (hover.value = highlights[0]?.id ?? "");
const clearHover = () => (hover.value = "");
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

.tooltip,
.tooltip-indent {
  display: flex;
  flex-direction: column;
}

.tooltip {
  gap: 5px;
}

.tooltip-indent {
  padding-left: 10px;
}
</style>
