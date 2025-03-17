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
          v-model="exactness"
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

      <div v-if="highlights.length" ref="summaryElement" class="summary">
        <span>Total Matches</span>
        <span>
          {{ summary.total.toLocaleString() }}
        </span>

        <template v-for="([search, matches], key) in summary.counts" :key="key">
          <span>{{ search }}</span>
          <span>{{ matches.toLocaleString() }}</span>
        </template>
      </div>

      <p v-else class="placeholder">Enter some text</p>

      <h2>Results</h2>

      <template v-if="highlights.length">
        <p v-for="(paragraph, key) in highlights" :key="key">
          <AppTooltip
            v-for="({ text, matches, ids, strength }, key) in paragraph"
            :key="JSON.stringify({ key, paragraph })"
            :class="[
              strength && 'highlight',
              ids.includes(hover) && 'highlight-hover',
            ]"
            :style="{ '--strength': strength / maxStrength }"
            @mouseenter="setHover(matches)"
            @mouseleave="clearHover"
          >
            <template #default>{{ text }}</template>
            <template v-if="matches.length" #content>
              <div class="tooltip">
                <div
                  v-for="(value, key) in groupBy(matches, 'text')"
                  class="tooltip-row"
                  :key="key"
                >
                  <template v-if="value[0]?.id === hover">
                    <div>"{{ key }}" matches...</div>
                    <div class="tooltip-subrow">
                      <div v-for="({ search, score }, key) in value" :key="key">
                        • "{{ search }}" ({{ (100 * score).toFixed(0) }}%)
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </template>
          </AppTooltip>
        </p>
      </template>

      <p v-else class="placeholder">Enter some text</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { useDebounce, useLocalStorage } from "@vueuse/core";
import {
  groupBy,
  inRange,
  isEqual,
  map,
  max,
  maxBy,
  orderBy,
  range,
  sumBy,
} from "lodash";
import AppTextbox from "../components/AppTextbox.vue";
import AppUpload from "../components/AppUpload.vue";
import AppButton from "../components/AppButton.vue";
import exampleText from "./example-text.txt?raw";
import exampleSearch from "./example-search.txt?raw";
import { fuzzySearch, splitWords } from "../util/search";
import { useScrollable } from "../util/composables";

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

useScrollable(summaryElement);

/** state */
const text = useLocalStorage("text", "");
const search = useLocalStorage("search", "");
const exactness = useLocalStorage("exactness", 0.5);
const hover = ref(0);

/** debounced state */
const debouncedText = useDebounce(text, 200);
const debouncedSearch = useDebounce(search, 200);
const debouncedExactness = useDebounce(exactness, 100);

/** split text by paragraph */
const paragraphs = computed(() =>
  debouncedText.value.split(/\n+/).filter((paragraph) => paragraph.trim())
);
/** split search by separators */
const searches = computed(() =>
  debouncedSearch.value.split(/[\n,]+/).filter((entry) => entry.trim())
);

/** fuzzy search matches */
const paragraphsWithMatches = computed(() => {
  /** get max word window for fuzzy search */
  const maxSearchWords =
    max(searches.value.map((search) => splitWords(search).length)) ?? 1;

  /** for each paragraph */
  return paragraphs.value.map((paragraph) => ({
    paragraph,
    matches: fuzzySearch(
      paragraph,
      searches.value,
      maxSearchWords,
      debouncedExactness.value
    ),
  }));
});

/** highlighted output */
const highlights = computed(() =>
  /** for each paragraphs */
  paragraphsWithMatches.value.map(({ paragraph, matches }) =>
    /** convert matches into sequentially-renderable highlighted dom elements */
    range(0, paragraph.length)
      /** for each character in paragraph */
      .map((char) => ({
        char,
        /** get match highlights that include this char */
        matches:
          /** sort so array order doesn't matter for equality */
          orderBy(
            matches.filter(({ start, end }) => inRange(char, start, end)),
            "start"
          ),
      }))
      .filter(
        /** remove char entries that are same as previous */
        ({ matches }, index, array) =>
          !isEqual(matches, array[index - 1]?.matches)
      )
      .map(({ char, matches }, index, array) => ({
        /** original paragraph text in highlight, to render */
        text: paragraph.slice(char, array[index + 1]?.char ?? paragraph.length),
        /** list of matches associated with highlight */
        matches: orderBy(matches, "score", "desc"),
        /** sum scores to get "strength" for coloring */
        strength: sumBy(matches, "score"),
        /** ids of contained matches */
        ids: map(matches, "id"),
      }))
  )
);

/** summary info */
const summary = computed(() => {
  const matches = paragraphsWithMatches.value
    .map(({ matches }) => matches)
    .flat();
  const total = matches.length;
  const counts = orderBy(
    Object.entries(groupBy(matches, "search")).map(
      ([search, matches]) => [search, matches.length] as const
    ),
    "[1]",
    "desc"
  );
  return { total, counts };
});

/** max highlight strength, for normalizing */
const maxStrength = computed(
  () => maxBy(highlights.value.flat(), "strength")?.strength ?? 0
);

type Matches = (typeof highlights.value)[number][number]["matches"];

/** handle hover */
const setHover = (matches: Matches) =>
  (hover.value = orderBy(matches, "start", "desc")[0]?.id ?? 0);
const clearHover = () => (hover.value = 0);
</script>

<style scoped>
section {
  display: flex;
  padding: 0;
}

.input,
.output {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 20px;
  padding: 40px;
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
  max-height: 100vh;
}

.text-textbox {
  width: 25vw;
  height: 25vh;
  flex-shrink: 0;
}

.search-textbox {
  width: 0;
  min-width: 100%;
  flex-grow: 1;
  flex-shrink: 0;
  resize: vertical;
}

.controls {
  display: flex;
  flex-wrap: wrap;
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
  gap: 10px 20px;
  width: 100%;
  min-height: 100px;
  max-height: max-content;
  height: 200px;
  padding: 20px;
  overflow-x: auto;
  overflow-y: auto;
  box-shadow: var(--shadow);
  border-radius: var(--rounded);
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
  background: hsla(350, 50%, 75%, var(--strength));
}

.highlight-hover {
  box-shadow: 0 2px 0 var(--theme);
}

.tooltip,
.tooltip-row,
.tooltip-subrow {
  display: flex;
  flex-direction: column;
}

.tooltip {
  gap: 5px;
}

.tooltip-subrow {
  padding-left: 20px;
}
</style>
