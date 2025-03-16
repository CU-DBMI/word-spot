<template>
  <section>
    <div class="input">
      <h1>Ghostbusters</h1>
      <AppTextbox v-model="input" placeholder="Text to check" />
      <div class="controls">
        <button @click="input = exampleText">Example</button>
        <button
          v-tooltip="
            'Load .txt or .docx file. Or drag & drop file onto textbox.'
          "
        >
          Upload
        </button>
      </div>

      <AppTextbox
        v-model="list"
        placeholder="Phrases to check for"
        v-tooltip="'Comma or newline-separated'"
      />
      <div class="controls">
        <button @click="list = exampleList">Example</button>
        <button
          v-tooltip="
            'Load .txt or .docx file. Or drag & drop file onto textbox.'
          "
        >
          Upload
        </button>
      </div>
    </div>

    <div class="output">
      <h2>Summary</h2>
      <p>Lorem ipsum odor amet, consectetuer adipiscing elit.</p>
      <h2>Checked Text</h2>
      <p v-for="(paragraph, key) in output" :key="key">
        <AppTooltip
          v-for="({ text, matches }, key) in paragraph"
          :key="key"
          class="match"
          :style="{ background: mixScoreColors(map(matches, 'score')) }"
        >
          <template #default>{{ text }}</template>
          <template v-if="matches.length" #content>
            <div class="tooltip-table">
              <span>Input text</span>
              <span>...matches...</span>
              <span>list item</span>
              <template
                v-for="({ inputText, listText, score }, key) in matches"
                :key="key"
              >
                <span>{{ inputText }}</span>
                <span>{{ (100 * score).toFixed(0) }}%</span>
                <span>{{ listText }}</span>
              </template>
            </div>
          </template>
        </AppTooltip>
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppTextbox from "../components/AppTextbox.vue";
import { useLocalStorage } from "@vueuse/core";
import Fuse from "fuse.js";
import exampleText from "./example-text.txt?raw";
import exampleList from "./example-list.txt?raw";
import { inRange, isEqual, map, orderBy, pick, range } from "lodash";
import { hsl, type HSLColor } from "d3";

const input = useLocalStorage("input", "");
const list = useLocalStorage("list", "");

/** split input by paragraph */
const splitInput = computed(() =>
  input.value.split(/\n+/).filter((entry) => entry.trim())
);
/** split list by separators */
const splitList = computed(() =>
  list.value.split(/[\n,]+/).filter((entry) => entry.trim())
);

/** analyzed output */
const output = computed(() =>
  /** for each input paragraph */
  splitInput.value.map((paragraph) => {
    /** fuzzy-search paragraph */
    const fuse = new Fuse([paragraph], {
      threshold: 0.2,
      ignoreLocation: true,
      includeScore: true,
      includeMatches: true,
      findAllMatches: true,
    });

    const matches = splitList.value
      /** search paragraph for each list entry */
      .map((entry) => ({ listText: entry, search: fuse.search(entry) }))
      .map(({ listText, search }) => {
        /** find most salient list entry match */
        const firstResult = search[0];
        if (!firstResult) return;
        const firstMatch = firstResult.matches?.[0];
        if (!firstMatch) return;
        /** find longest match */
        const firstIndices = orderBy(
          firstMatch.indices,
          ([start, end]) => end - start,
          "desc"
        )[0];
        if (!firstIndices) return;
        return {
          listText,
          inputText: paragraph.slice(...firstIndices),
          /** make 1 strongest match, 0 weakest */
          score: 1 - (firstResult.score ?? 1),
          indices: firstIndices,
        };
      })
      .filter((entry) => !!entry);

    const highlighting = range(0, paragraph.length)
      /** for each character in paragraph */
      .map((char) => ({
        char,
        /** get match ranges that include this char */
        matches:
          /** sort so array order doesn't matter for equality */
          orderBy(
            matches.filter(({ indices: [start, end] }) =>
              inRange(char, start, end)
            ),
            /** sort in order of appearance, useful for showing latest match tooltip when hovering overlapping ranges */
            "indices[0]"
          ),
      }))
      .filter(
        /** remove char entries that are same as previous */
        ({ matches }, index, array) =>
          !isEqual(matches, array[index - 1]?.matches)
      )
      .map(({ char, matches }, index, array) => ({
        /** get original paragraph text in range */
        text: paragraph.slice(char, array[index + 1]?.char ?? paragraph.length),
        /** list of matches associated with range */
        matches: matches.map((match) =>
          pick(match, ["inputText", "listText", "score"])
        ),
      }));

    return highlighting;
  })
);

/** map 0-1 to color */
const getScoreColor = (score: number) => hsl(90 * (1 - score), 1, 0.5, score);

/** composite colors */
const alphaComposite = (bg: HSLColor, fg: HSLColor) => {
  const a = (1 - fg.opacity) * bg.opacity + fg.opacity;
  const h = (1 - fg.opacity) * bg.opacity * bg.h + fg.opacity * fg.h;
  const s = (1 - fg.opacity) * bg.opacity * bg.s + fg.opacity * fg.s;
  const l = (1 - fg.opacity) * bg.opacity * bg.l + fg.opacity * fg.l;
  return hsl(h / a, s / a, l / a, a);
};

/** mix list of scores to get one color */
const mixScoreColors = (scores: number[]) => {
  const colors = orderBy(scores, undefined, "desc").map(getScoreColor);
  let color = colors.pop();
  if (!color) return "";
  for (const nextColor of colors) color = alphaComposite(color, nextColor);
  return color.formatHex8();
};
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
  align-items: center;
  gap: 20px;
  padding: 40px;
}

.input {
  box-shadow: var(--shadow);
  max-height: 100vh;
}

textarea:first-of-type {
  width: 25vw;
  height: 25vh;
  flex-shrink: 0;
}

textarea:last-of-type {
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

.tooltip-table {
  display: grid;
  grid-template-columns: repeat(3, auto);
  align-items: center;
  gap: 10px 20px;
}

.tooltip-table > :nth-child(3n + 2) {
  text-align: center;
}
</style>
