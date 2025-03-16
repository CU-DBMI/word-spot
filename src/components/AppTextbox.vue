<template>
  <div>
    <textarea
      ref="element"
      :value="modelValue"
      @input="(event) => emit('update:modelValue', (event.target as HTMLTextAreaElement)?.value || '')"
      :placeholder="placeholder"
    />
    <button aria-label="Clear" @click="emit('update:modelValue', '')">×</button>
  </div>
</template>

<script setup lang="ts">
import { useTemplateRef } from "vue";

type Props = {
  modelValue?: string;
  placeholder?: string;
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
div {
  display: flex;
  position: relative;
  width: 100%;
  min-width: 200px;
  min-height: 3lh;
  border-radius: var(--rounded);
  box-shadow: var(--shadow);
  overflow: hidden;
  resize: both;
}

textarea {
  padding-right: 30px;
}

button {
  position: absolute;
  top: 0;
  right: 0;
  width: 40px;
  height: 40px;
  background: none;
  color: black;
  font-size: 1.3rem;
  line-height: 1;
}
</style>
