<template>
  <textarea
    ref="element"
    :value="modelValue"
    @input="(event) => emit('update:modelValue', (event.target as HTMLTextAreaElement)?.value || '')"
  />
</template>

<script setup lang="ts">
import { useTemplateRef } from "vue";

type Props = {
  modelValue?: string;
};

defineProps<Props>();

type Emits = {
  "update:modelValue": [string];
};

const emit = defineEmits<Emits>();

const element = useTemplateRef("element");

defineExpose({ element });
</script>

<style scoped>
textarea {
  min-width: 200px;
  min-height: 3lh;
  padding: 10px;
  font: inherit;
  border: var(--border);
  border-radius: var(--rounded);
  box-shadow: var(--shadow);
}
</style>
