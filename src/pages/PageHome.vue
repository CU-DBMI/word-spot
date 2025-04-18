<template>
  <section>
    <div class="left">
      <div v-html="logo" class="logo" />

      <TabGroup :selectedIndex="tab" @change="(value) => (tab = value)">
        <TabList class="tabs">
          <Tab v-slot="{ selected }" as="template">
            <button :class="!selected && 'secondary'">Search</button>
          </Tab>
          <Tab v-slot="{ selected }" as="template">
            <button :class="!selected && 'secondary'">
              <template v-if="progress">
                Analyzing
                <svg viewBox="-50 -50 100 100" height="1.5em">
                  <circle
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="10"
                    opacity="0.25"
                  />
                  <circle
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="10"
                    pathLength="1"
                    :stroke-dasharray="`${progress} 1`"
                    transform="rotate(-90)"
                  />
                </svg>
              </template>
              <template v-else>Summary</template>
            </button>
          </Tab>
        </TabList>
        <TabPanels as="template">
          <TabPanel as="template">
            <div class="search">
              <textarea
                ref="searchElement"
                v-model="search"
                placeholder="Phrases to check for"
                v-tooltip="'Comma or line-separated'"
              />

              <div class="search-controls">
                <template v-if="search">
                  <button
                    v-tooltip="'Clear text'"
                    class="square"
                    @click="search = ''"
                  >
                    <X />
                  </button>
                </template>
                <template v-else>
                  <button
                    v-if="exampleSearch.trim()"
                    v-tooltip="'Try example search'"
                    class="square"
                    @click="search = exampleSearch"
                  >
                    <Lightbulb />
                  </button>
                  <AppUpload
                    :drop-zone="searchElement"
                    :accept="uploadMimeTypes"
                    :tooltip="uploadTooltip"
                    @files="(files) => (search = files[0]?.text ?? '')"
                  />
                </template>
              </div>
            </div>
          </TabPanel>

          <TabPanel as="template">
            <div ref="summaryElement" class="summary">
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
          </TabPanel>
        </TabPanels>
      </TabGroup>

      <label
        v-tooltip="
          'Threshold for close matches. Setting this very low can cause slowdown.'
        "
      >
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

    <div class="right" ref="rightElement">
      <AppEditor
        v-model="text"
        :highlights="highlights"
        @select="select"
        @deselect="deselect"
      >
        <template #placeholder>
          Text to check
          <br />
          <br />
          {{ placeholder }}
        </template>
      </AppEditor>
      <div class="text-controls-container">
        <div class="text-controls">
          <template v-if="text">
            <button
              v-if="y > 200"
              v-tooltip="'Scroll to top'"
              class="square"
              @click="scrollToTop"
            >
              <ArrowUp />
            </button>
            <button v-tooltip="'Clear text'" class="square" @click="text = ''">
              <X />
            </button>
          </template>

          <template v-else>
            <button
              v-if="exampleText.trim()"
              v-tooltip="'Try example text'"
              class="square"
              @click="
                () => {
                  text = exampleText;
                  scrollToTop();
                }
              "
            >
              <Lightbulb />
            </button>
            <AppUpload
              :drop-zone="rightElement"
              :accept="uploadMimeTypes"
              :tooltip="uploadTooltip"
              @files="
                (files) => {
                  text = files[0]?.text ?? '';
                  scrollToTop();
                }
              "
            />
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  computed,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
  watchEffect,
} from "vue";
import { tippy } from "vue-tippy";
import { groupBy, orderBy } from "lodash";
import { ArrowUp, Lightbulb, X } from "lucide-vue-next";
import type { Instance } from "tippy.js";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/vue";
import { useDebounce, useLocalStorage, useWindowScroll } from "@vueuse/core";
import exampleSearch from "@/assets/example-search.txt?raw";
import exampleText from "@/assets/example-text.txt?raw";
import logo from "@/assets/logo.svg?raw";
import AppEditor from "@/components/AppEditor.vue";
import AppUpload from "@/components/AppUpload.vue";
import { useScrollable } from "@/util/composables";
import { sleep } from "@/util/misc";
import { getPool } from "@/util/pool";
import { splitWords } from "@/util/search";
import type { Match } from "@/util/search";
import * as SearchAPI from "@/util/search";
import SearchWorker from "@/util/search?worker";

/** placeholder text */
const placeholder =
  "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair, we had everything before us, we had nothing before us...";

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
  "Load .txt, .docx, or .pdf file. Or drag & drop file onto textbox.";

/** elements */
const searchElement = useTemplateRef("searchElement");
const summaryElement = useTemplateRef("summaryElement");
const rightElement = useTemplateRef("rightElement");

/** scroll indicators */
useScrollable(searchElement, "var(--white)");
useScrollable(summaryElement, "var(--white)");

/** scroll position */
const { y } = useWindowScroll();

/** debug */
// window.localStorage.clear();

/** state */
const tab = ref(0);
const text = useLocalStorage("text", "");
const search = useLocalStorage("search", "");
const exactness = ref(1);
const tooltip = ref<Instance>();
const progress = ref(0);

/** debounced state */
const debouncedText = useDebounce(text, 500);
const debouncedSearch = useDebounce(search, 500);
const debouncedExactness = useDebounce(exactness, 500);

/** split text by paragraph */
const paragraphs = computed(() => debouncedText.value.split("\n"));
/** split search by separators */
const searches = computed(() =>
  debouncedSearch.value.split(/[\n,]+/).filter((entry) => entry.trim()),
);

/** whether to use exact search */
const exact = computed(() => debouncedExactness.value >= 1);

/** exact search matches, per paragraph */
const exactMatches = shallowRef<Match[]>([]);
/** fuzzy search matches, per paragraph */
const fuzzyMatches = shallowRef<Match[]>([]);
/** matches, depending on threshold */
const matches = shallowRef<Match[]>([]);

watch(
  /** when inputs change */
  [paragraphs, searches],
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
  [paragraphs, searches, exact],
  async () => {
    /** cancel any in-progress work */
    await cleanup();

    /** if matches already exist, don't recalculate */
    if (exact.value && exactMatches.value.length) return;
    if (!exact.value && fuzzyMatches.value.length) return;

    /** progress */
    progress.value = 0.000001;
    let done = 0;

    /** pre-compute search windows */
    const _searches = searches.value.map(
      (search) => [search.toLowerCase(), splitWords(search).length] as const,
    );

    /** paragraph char offsets */
    let offset = 0;
    const offsets = [0].concat(
      paragraphs.value.map((paragraph) => (offset += paragraph.length + 1)),
    );

    let matches = (
      (await Promise.all(
        /** for each paragraph */
        paragraphs.value.map(async (paragraph, index) => {
          /** get search results */
          const matches = await run((worker) =>
            worker.getMatches(
              paragraph.toLowerCase(),
              _searches,
              exact.value,
              offsets[index],
            ),
          );
          /** update progress */
          progress.value = ++done / paragraphs.value.length;
          return matches;
        }),
      ).catch(console.warn)) ?? []
    ).flat();

    /** order matches by start index (orderBy not memory-efficient-enough here) */
    matches.sort((a, b) => a.start - b.start || b.end - a.end);

    /** cancel any in-progress work */
    await cleanup();

    /** progress */
    progress.value = 0;

    /** set appropriate matches */
    if (exact.value) exactMatches.value = matches;
    else fuzzyMatches.value = matches;
  },
  { immediate: true },
);

/** choose matches */
watch(
  [exactMatches, fuzzyMatches, exact, debouncedExactness],
  () => {
    matches.value =
      /** which matches to use */
      (exact.value ? exactMatches.value : fuzzyMatches.value)
        /** remove matches below threshold */
        .filter(({ score }) => score >= debouncedExactness.value);
  },
  { immediate: true },
);

/** highlighted slices of text */
const highlights = computed(() =>
  matches.value.map(({ start, end, score, text, search }) => ({
    start,
    end,
    strength: score,
    data: { score, text, search },
  })),
);

/** summary info */
const summary = computed(() => {
  const total = matches.value.length;
  let counts = Object.entries(groupBy(matches.value, "search")).map(
    ([search, matches]) => [search, matches.length] as const,
  );
  /** hard limit counts to avoid rendering slowness */
  counts = orderBy(counts, "[1]", "desc").slice(0, 100);
  return { total, counts };
});

/** switch to summary view */
watchEffect(() => {
  if (summary.value.total) tab.value = 1;
});

/** select highlight */
const select = (
  { text, search, score }: (typeof highlights)["value"][number]["data"],
  anchor: HTMLElement,
) => {
  /** use single tippy instance for highlights for performance */

  /** create tippy instance */
  tooltip.value = tippy(anchor);
  /** set tooltip content */
  tooltip.value.setContent(
    `"${text}" matches "${search}" ${(100 * score).toFixed(0)}%`,
  );
  /** programmatically show */
  tooltip.value.show();
};

/** deselect highlight */
const deselect = () => {
  /** clean up tippy */
  tooltip.value?.destroy();
};

/** scroll to top of page */
const scrollToTop = async () => {
  await sleep();
  window.scrollTo({ top: 0 });
};
</script>

<style scoped>
section {
  display: flex;
  padding: 0;
}

.left {
  display: flex;
  position: sticky;
  top: 0;
  flex-shrink: 0;
  flex-direction: column;
  align-items: center;
  width: 400px;
  min-width: 200px;
  max-width: 50vw;
  height: 100vh;
  padding: 40px;
  overflow-y: auto;
  gap: 20px;
  background: var(--pale);
  box-shadow: var(--shadow);
  resize: horizontal;
}

.right {
  display: flex;
  position: relative;
  flex-grow: 1;
  flex-direction: column;
}

.logo > :deep(svg) {
  height: 30px;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  gap: 10px;
}

.tabs > * {
  flex-grow: 1;
  flex-basis: 0;
}

.search {
  position: relative;
  flex-grow: 1;
  flex-shrink: 0;
  width: 100%;
  overflow: auto;
  resize: vertical;
}

.search-controls {
  display: flex;
  position: absolute;
  top: 0;
  right: 0;
  flex-wrap: wrap;
  justify-content: center;
  padding: 10px;
  gap: 5px;
}

.summary {
  display: grid;
  grid-template-columns: 1fr max-content;
  flex-grow: 1;
  flex-shrink: 0;
  align-content: flex-start;
  width: 100%;
  padding: 20px;
  overflow-x: auto;
  overflow-y: auto;
  gap: 10px 20px;
  border-radius: var(--rounded);
  resize: vertical;
}

.summary > * {
  min-width: 0;
  overflow-wrap: break-word;
}

.summary > :nth-child(1),
.summary > :nth-child(2) {
  font-weight: 600;
}

.text-controls-container {
  display: flex;
  position: absolute;
  align-items: flex-start;
  justify-content: flex-end;
  inset: 0;
  pointer-events: none;
}

.text-controls {
  display: flex;
  position: sticky;
  top: 0;
  padding: 10px;
  gap: 5px;
  pointer-events: auto;
}

.search:has(textarea:focus) .search-controls,
.right:has([contenteditable]:focus) .text-controls {
  opacity: 0.5;
}

@media (width < 600px) {
  section {
    flex-direction: column;
  }

  .left {
    position: unset;
    width: 100%;
    min-width: 100%;
    max-width: 100%;
    height: unset;
    min-height: min-content;
    min-height: 25vh;
    resize: vertical;
  }

  .search,
  .summary {
    height: unset !important;
    resize: none;
  }
}

@media (width >= 600px) {
  .left {
    height: 100vh !important;
  }
}
</style>
