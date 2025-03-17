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
          :min="0.05"
          :max="1"
          :step="0.01"
        />
        {{ (100 * exactness).toFixed(0) }}%
      </label>
    </div>

    <div class="output">
      <h2>Summary</h2>

      <div
        v-if="!checkingProgress && summary.total"
        ref="summaryElement"
        class="summary"
      >
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
      <p v-if="checkingProgress" class="placeholder">
        Checking {{ (100 * checkingProgress).toFixed() }}%
      </p>

      <h2>Results</h2>

      <template v-if="!checkingProgress && withSlices.length">
        <p v-for="(paragraph, key) in withSlices" :key="key">
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
                    v-for="(match, key) in slice.highlights[0].matches.slice(
                      0,
                      5,
                    )"
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
      <p v-if="checkingProgress" class="placeholder">
        Checking {{ (100 * checkingProgress).toFixed() }}%
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import {
  groupBy,
  inRange,
  isEqual,
  map,
  max,
  orderBy,
  range,
  sumBy,
} from "lodash";
import { pool } from "workerpool";
import { asyncComputed, useDebounce, useLocalStorage } from "@vueuse/core";
import exampleSearch from "@/assets/example-search.txt?raw";
import exampleText from "@/assets/example-text.txt?raw";
import AppButton from "@/components/AppButton.vue";
import AppTextbox from "@/components/AppTextbox.vue";
import AppUpload from "@/components/AppUpload.vue";
import { useScrollable } from "@/util/composables";
import { getId } from "@/util/misc";
import { splitWords, type GetMatches } from "@/util/search";
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

// window.localStorage.clear();

/** state */
const text = useLocalStorage("text", "");
const search = useLocalStorage("search", "");
const exactness = useLocalStorage("exactness", 1);
const hover = ref(0);
const checkingProgress = ref(0);

/** debounced state */
const debouncedText = useDebounce(text, 200);
const debouncedSearch = useDebounce(search, 200);
const debouncedExactness = useDebounce(exactness, 100);

/** split text by paragraph */
const paragraphs = computed(() =>
  debouncedText.value.split(/\n+/).filter((paragraph) => paragraph.trim()),
);
/** split search by separators */
const searches = computed(() =>
  debouncedSearch.value.split(/[\n,]+/).filter((entry) => entry.trim()),
);

/** pool of web workers to do searching on multiple cores */
const searchPool = pool(SearchWorker, {
  /** https://github.com/josdejong/workerpool/issues/341#issuecomment-2046514842 */
  workerOpts: { type: import.meta.env.PROD ? undefined : "module" },
});

/** paragraphs with search matches */
const withMatches = asyncComputed(async () => {
  /** get max word window for fuzzy search */
  const maxSearchWords =
    max(searches.value.map((search) => splitWords(search).length)) ?? 1;

  /** use dependencies synchronously so they can be auto-tracked */
  const text = paragraphs.value;
  const threshold = debouncedExactness.value;

  /** reset */
  await searchPool.terminate(true, 0);
  checkingProgress.value = 0;

  const results = await Promise.all(
    /** for each paragraph */
    text.map(async (paragraph) => {
      /** start new web worker to get search results */
      const matches = await searchPool.exec<GetMatches>("getMatches", [
        paragraph,
        searches.value,
        maxSearchWords,
        threshold,
      ]);
      /** update progress */
      checkingProgress.value =
        1 - searchPool.stats().pendingTasks / paragraphs.value.length;
      return { paragraph, matches };
    }),
  );

  /** reset */
  checkingProgress.value = 0;

  return results;
}, []);

/** paragraphs with highlighted slices */
const withSlices = computed(() => {
  const paragraphs = withMatches.value.map(
    ({ paragraph, matches }, paragraphIndex) =>
      /** convert matches into sequentially-renderable highlighted dom elements */
      range(0, paragraph.length)
        /** for each character in paragraph */
        .map((char) => ({
          char,
          matches:
            /** sort so array order doesn't matter for equality */
            orderBy(
              /** get match highlights that include this char */
              matches.filter(({ start, end }) => inRange(char, start, end)),
              /**
               * put slices that start later first, for benefit of hover and
               * tooltip
               */
              "start",
              "desc",
            ),
        }))
        .filter(
          /** remove char entries that are same as previous */
          ({ matches }, index, array) =>
            !isEqual(matches, array[index - 1]?.matches),
        )
        .map(({ char, matches }, index, array) => {
          /** original slice of paragraph to render */
          const original = paragraph.slice(
            char,
            array[index + 1]?.char ?? paragraph.length,
          );

          /** get unique id for slice */
          const id = getId({ char, matches });

          /** list of highlights associated with slice */
          const highlights = Object.values(groupBy(matches, "text")).map(
            (fullMatches) => {
              /** these fields should be same for all matches, so just take first */
              const { text, start, end } = fullMatches[0]!;

              /** sort stronger matches first */
              fullMatches = orderBy(fullMatches, "score", "desc");

              /**
               * only keep fields that we need, and that are different for every
               * match
               */
              const matches = map(fullMatches, ({ search, score }) => ({
                search,
                score,
              }));

              const highlight = { text, matches };

              /** get unique id for highlight */
              const id = getId({ paragraphIndex, start, end, highlight });

              return { id, ...highlight };
            },
          );

          /** extract out highlight ids for convenience */
          const highlightIds = map(highlights, "id");

          /** "strength", used for coloring. start empty, calc after. */
          const strength = 0;

          return { id, original, highlights, highlightIds, strength };
        }),
  );

  /** determine max # of highlights that will ever overlap each other */
  const maxOverlapping =
    max(map(paragraphs.flat(), (paragraph) => paragraph.highlights.length)) ??
    1;

  /** calculate slice strengths */
  for (const paragraph of paragraphs)
    for (const slice of paragraph)
      slice.strength = sumBy(slice.highlights, (highlight) => {
        /** use strongest (first) search match score */
        const strength = highlight.matches[0]?.score ?? 0;
        /** ensure sum of highlight strengths on a slice never exceeds 1 */
        return strength / maxOverlapping;
      });

  return paragraphs;
});

/** summary info */
const summary = computed(() => {
  const matches = withMatches.value.map(({ matches }) => matches).flat();
  const total = matches.length;
  const counts = orderBy(
    Object.entries(groupBy(matches, "search")).map(
      ([search, matches]) => [search, matches.length] as const,
    ),
    "[1]",
    "desc",
  );
  return { total, counts };
});

type Highlights = (typeof withSlices.value)[number][number]["highlights"];

/** handle hover */
const setHover = (highlights: Highlights) =>
  (hover.value = highlights[0]?.id ?? 0);
const clearHover = () => (hover.value = 0);
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
  background: hsla(350, 100%, 75%, var(--strength));
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
