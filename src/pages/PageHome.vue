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
      <p v-for="(paragraph, key) of output" :key="key">
        <template
          v-for="({ inputWord, score, listWord }, key) of paragraph"
          :key="key"
        >
          <span
            v-tooltip="`${(100 * score).toFixed(0)}% match with &quot;${listWord}&quot;`"
            class="match"
            :style="{ '--score': score }"
          >
            {{ inputWord }}
          </span>
          {{ " " }}
        </template>
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
import { orderBy } from "lodash";

const input = useLocalStorage("input", "");
const list = useLocalStorage("list", "");

const splitInput = computed(() =>
  input.value.split(/\n+/).map((p) => p.split(/\s+/))
);
const splitList = computed(() => list.value.split(/[\n,]+/).filter(Boolean));

const output = computed(() => {
  return splitInput.value.map((paragraph) =>
    paragraph.map((inputWord) => {
      const fuse = new Fuse([inputWord], {
        threshold: 0.3,
        distance: 10,
        includeScore: true,
      });
      let matches = splitList.value
        .map((listWord) => {
          const match = fuse.search(listWord)[0];
          if (!match) return;
          return { listWord, score: 1 - (match.score ?? 1) };
        })
        .filter((match) => !!match);
      matches = orderBy(matches, "score", ["desc"]);
      return {
        inputWord,
        score: matches[0]?.score || 0,
        listWord: matches[0]?.listWord ?? "",
      };
    })
  );
});
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

.match {
  background: hsl(
    calc(120 - var(--score) * 120),
    100%,
    50%,
    calc(50% * var(--score))
  );
}
</style>
