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
          v-for="({ inputText, matches }, key) in paragraph"
          :key="key"
          class="match"
          :style="{
            background: `hsla(40, 100%, 50%, ${matches.length / maxOverlap})`,
          }"
        >
          <template #default>{{ inputText }}</template>
          <template v-if="matches.length" #content>
            <div class="tooltip-table">
              <template
                v-for="({ inputText, listEntry }, key) in matches"
                :key="key"
              >
                <span>"{{ inputText }}"</span>
                <span>matches</span>
                <span>"{{ listEntry }}"</span>
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
import { useLocalStorage } from "@vueuse/core";
import { inRange, isEqual, maxBy, orderBy, range } from "lodash";
import AppTextbox from "../components/AppTextbox.vue";
import exampleText from "./example-text.txt?raw";
import exampleList from "./example-list.txt?raw";

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
    const matches = splitList.value
      /** for each list entry */
      .map((listEntry) => ({
        listEntry,
        /** get all instances of entry in paragraph */
        matches: [...paragraph.matchAll(new RegExp(listEntry, "gi"))],
      }))
      .map(({ listEntry, matches }) =>
        matches.map((match) => {
          /** get location of match */
          const start = match.index;
          const end = start + listEntry.length;
          return {
            inputText: paragraph.slice(start, end),
            listEntry,
            start,
            end,
          };
        })
      )
      .flat();

    const highlighting = range(0, paragraph.length)
      /** for each character in paragraph */
      .map((char) => ({
        char,
        /** get match ranges that include this char */
        matches:
          /** sort so array order doesn't matter for equality */
          orderBy(
            matches.filter(({ start, end }) => inRange(char, start, end)),
            /** sort in order of appearance, useful for showing latest match tooltip when hovering overlapping ranges */
            "start",
            "desc"
          ),
      }))
      .filter(
        /** remove char entries that are same as previous */
        ({ matches }, index, array) =>
          !isEqual(matches, array[index - 1]?.matches)
      )
      .map(({ char, matches }, index, array) => ({
        /** get original paragraph text in range */
        inputText: paragraph.slice(
          char,
          array[index + 1]?.char ?? paragraph.length
        ),
        /** list of matches associated with range */
        matches,
      }));

    return highlighting;
  })
);

/** max number of overlapping ranges */
const maxOverlap = computed(
  () => maxBy(output.value.flat(), "matches.length")?.matches.length ?? 0
);
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
