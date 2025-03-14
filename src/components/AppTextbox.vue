<template>
  <textarea
    :value="modelValue"
    @input="(event) => emit('update:modelValue', (event.target as HTMLTextAreaElement)?.value || '')"
  />
</template>

<script setup lang="ts">
type Props = {
  modelValue?: string;
};

defineProps<Props>();

type Emits = {
  "update:modelValue": [string];
};

const emit = defineEmits<Emits>();
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
