<template>
  <input
    ref="inputElement"
    type="range"
    :style="{ '--percent': 100 * percent + '%' }"
    :value="modelValue"
    @input="onInput($event.target as HTMLInputElement)"
  />
</template>

<script setup lang="ts">
import { ref, useTemplateRef, watchEffect } from "vue";

type Props = {
  modelValue: number;
};

defineProps<Props>();

type Emits = {
  "update:modelValue": [number];
};

const emit = defineEmits<Emits>();

const percent = ref(0);

const inputElement = useTemplateRef("inputElement");

const onInput = (element: HTMLInputElement) => {
  const min = Number(element.min);
  const max = Number(element.max);
  const value = Number(element.value);
  percent.value = (value - min) / (max - min);
  emit("update:modelValue", value);
};

watchEffect(() => inputElement.value && onInput(inputElement.value));
</script>

<style scoped>
input {
  --size: 5px;
  appearance: none;
  height: var(--size);
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--primary),
    var(--primary) var(--percent),
    var(--gray) var(--percent),
    var(--gray)
  );
  cursor: pointer;
}

input::-webkit-slider-thumb {
  appearance: none;
  aspect-ratio: 1;
  width: calc(var(--size) * 3);
  /* translate: calc(-50% + var(--percent)) 0; */
  border: none;
  border-radius: 999px;
  background: black;
}

input::-moz-range-thumb {
  appearance: none;
  aspect-ratio: 1;
  width: calc(var(--size) * 2);
  /* translate: calc(-50% + var(--percent)) 0; */
  border: none;
  border-radius: 999px;
  background: black;
}
</style>
