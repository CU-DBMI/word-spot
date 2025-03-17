<template>
  <button>
    <slot />
  </button>
</template>

<style scoped>
button {
  color: white;
  background: var(--theme);
  box-shadow: var(--shadow);
}

button:hover {
  background: var(--gray);
  color: white;
}
</style>
