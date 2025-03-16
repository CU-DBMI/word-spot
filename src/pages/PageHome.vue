<template>
  <section>
    <div class="input">
      <h2>Input</h2>
      <AppTextbox
        ref="inputElement"
        v-model="input"
        class="input-textbox"
        placeholder="Text to check"
      />
      <div class="controls">
        <AppButton @click="input = exampleText">Example</AppButton>
        <AppUpload
          :drop-zone="inputElement?.element"
          :accept="uploadMimeTypes"
          :tooltip="uploadTooltip"
          @files="(files) => (input = files[0]?.text ?? '')"
        />
      </div>

      <h2>List</h2>
      <AppTextbox
        ref="listElement"
        v-model="list"
        class="list-textbox"
        placeholder="Phrases to check for"
        v-tooltip="'Comma or newline-separated'"
      />
      <div class="controls">
        <AppButton @click="list = exampleList">Example</AppButton>
        <AppUpload
          :drop-zone="listElement?.element"
          :accept="uploadMimeTypes"
          :tooltip="uploadTooltip"
          @files="(files) => (list = files[0]?.text ?? '')"
        />
      </div>
    </div>

    <div v-if="output.length" class="output">
      <h2>Summary</h2>
      <div class="summary">
        <span>Total Matches</span>
        <span>
          {{ summary.total.toLocaleString() }}
        </span>

        <template v-for="(matches, key) in summary.counts" :key="key">
          <span>{{ key }}</span>
          <span>{{ matches.length.toLocaleString() }}</span>
        </template>
      </div>

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
            <div class="tooltip">
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

    <div v-else class="output" :style="{ opacity: 0.5 }">Enter some text</div>
  </section>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { useDebounce, useLocalStorage } from "@vueuse/core";
import { groupBy, inRange, isEqual, maxBy, orderBy, range } from "lodash";
import AppTextbox from "../components/AppTextbox.vue";
import AppUpload from "../components/AppUpload.vue";
import AppButton from "../components/AppButton.vue";
import exampleText from "./example-text.txt?raw";
import exampleList from "./example-list.txt?raw";

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
const inputElement = useTemplateRef("inputElement");
const listElement = useTemplateRef("listElement");

/** state */
const input = useLocalStorage("input", "");
const list = useLocalStorage("list", "");

/** debounced state */
const debouncedInput = useDebounce(input, 200);
const debouncedList = useDebounce(list, 200);

/** split input by paragraph */
const splitInput = computed(() =>
  debouncedInput.value.split(/\n+/).filter((paragraph) => paragraph.trim())
);
/** split list by separators */
const splitList = computed(() =>
  debouncedList.value.split(/[\n,]+/).filter((entry) => entry.trim())
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

/** output summary info */
const summary = computed(() => {
  const matches = output.value
    .map((paragraph) => paragraph.map((range) => range.matches))
    .flat()
    .flat();
  const counts = groupBy(matches, "listEntry");
  return { total: matches.length, counts };
});

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

.input-textbox {
  width: 25vw;
  height: 25vh;
  flex-shrink: 0;
}

.list-textbox {
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
  gap: 10px 20px;
  width: 100%;
  min-height: 3lh;
  height: 120px;
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

.tooltip {
  display: grid;
  grid-template-columns: repeat(3, auto);
  align-items: center;
  gap: 10px 20px;
}

.tooltip > :nth-child(3n + 2) {
  text-align: center;
}
</style>
