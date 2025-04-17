<template>
  <button
    v-tooltip="tooltip"
    class="square"
    :disabled="uploading"
    @click="onClick"
  >
    <LoaderCircle v-if="uploading" class="spin" />
    <Upload v-else />
  </button>
  <input
    ref="input"
    type="file"
    :accept="accept.join(',')"
    multiple
    :style="{ display: 'none' }"
    @change="onChange"
  />
</template>

<script setup lang="ts">
import { ref, useTemplateRef, watchEffect } from "vue";
import { LoaderCircle, Upload } from "lucide-vue-next";
import { useEventListener } from "@vueuse/core";
import { getPool } from "@/util/pool";
import * as UploadAPI from "@/util/upload";
import UploadWorker from "@/util/upload?worker";

type Props = {
  dropZone?: HTMLElement | null;
  accept: string[];
  tooltip?: string;
};

const { dropZone } = defineProps<Props>();

type Emits = {
  dragging: [boolean];
  files: [{ text: string; filename: string }[]];
};

const emit = defineEmits<Emits>();

type Slots = {
  default: [{ uploading: boolean }];
};

defineSlots<Slots>();

/** actual file input element */
const input = useTemplateRef("input");

/** dragging state */
const dragging = ref(false);

/** uploading status */
const uploading = ref(false);

/** when dragging state changes */
watchEffect(() => {
  emit("dragging", dragging.value);
  dropZone?.classList[dragging.value ? "add" : "remove"]("dragging");
});

/** make pool of webworkers */
const { run, cleanup } = getPool<typeof UploadAPI>(UploadWorker);

/** upload file(s) */
const onLoad = async (fileList: FileList | null) => {
  if (!fileList) return;

  await cleanup();

  /** progress */
  uploading.value = true;

  /** parse file uploads as text */
  const files =
    (await Promise.all(
      Array.from(fileList).map(async (file) => {
        let text = "";

        /** parse as appropriate format */
        if (file.name.match(/\.(doc|docx)$/))
          text = await run(async (worker) =>
            worker.parseWordDoc(await file.arrayBuffer()),
          );
        else if (file.name.match(/\.(pdf)$/))
          text = await run(async (worker) =>
            worker.parsePdf(await file.arrayBuffer()),
          );
        else text = await file.text();

        return { text, filename: file.name };
      }),
    ).catch(console.warn)) ?? [];

  /** progress */
  uploading.value = false;

  /** notify parent of new files */
  if (files) emit("files", files);

  /** reset file input so the same file could be re-selected */
  if (input.value) input.value.value = "";
};

/** click actual actual file input on upload button click */
const onClick = () => input.value?.click();

/** on file input change */
const onChange = (event: Event) =>
  onLoad((event.target as HTMLInputElement).files ?? null);

/** track drag & drop state */
useEventListener(
  () => dropZone,
  "dragenter",
  () => (dragging.value = true),
);
useEventListener(
  () => dropZone,
  "dragleave",
  () => (dragging.value = false),
);
useEventListener(
  () => dropZone,
  "dragover",
  (event) => event.preventDefault(),
);

/** when file dropped on drop zone */
useEventListener(
  () => dropZone,
  "drop",
  (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragging.value = false;
    onLoad(event.dataTransfer?.files ?? null);
  },
);
</script>

<style>
.dragging {
  outline-color: var(--primary);
  outline-style: dashed;
  outline-width: 3px;
  outline-offset: -3px;
}
</style>
