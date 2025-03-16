<template>
  <AppButton v-tooltip="tooltip" @click="onClick">Upload</AppButton>
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
import { useEventListener } from "@vueuse/core";
import { ref, useTemplateRef, watchEffect } from "vue";
import { parsePdf, parseWordDoc } from "../util/upload";
import AppButton from "./AppButton.vue";

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

/** actual file input element */
const input = useTemplateRef("input");

/** dragging state */
const dragging = ref(false);

/** when dragging state changes */
watchEffect(() => {
  emit("dragging", dragging.value);
  dropZone?.classList[dragging.value ? "add" : "remove"]("dragging");
});

/** upload file(s) */
const onLoad = async (fileList: FileList | null) => {
  if (!fileList) return;

  /** parse file uploads as text */
  const files = await Promise.all(
    Array.from(fileList).map(async (file) => {
      let text = "";

      /** parse as appropriate format */
      if (file.name.match(/\.(doc|docx)$/))
        text = await parseWordDoc(await file.arrayBuffer());
      else if (file.name.match(/\.(pdf)$/))
        text = await parsePdf(await file.arrayBuffer());
      else text = await file.text();

      return { text, filename: file.name };
    })
  );

  /** notify parent of new files */
  emit("files", files);

  /** reset file input so the same file could be re-selected */
  if (input.value) input.value.value = "";
};

/** click actual actual file input on upload button click */
const onClick = () => input.value?.click();

/** on file input change  */
const onChange = (event: Event) =>
  onLoad((event.target as HTMLInputElement).files ?? null);

/** track drag & drop state */
useEventListener(
  () => dropZone,
  "dragenter",
  () => (dragging.value = true)
);
useEventListener(
  () => dropZone,
  "dragleave",
  () => (dragging.value = false)
);
useEventListener(
  () => dropZone,
  "dragover",
  (event) => event.preventDefault()
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
  }
);
</script>

<style>
.dragging {
  outline-color: var(--theme);
  outline-width: 2px;
  outline-offset: 2px;
  outline-style: dashed;
}
</style>
