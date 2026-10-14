<script setup lang="ts">
import { ChevronDown } from "@lucide/vue";
defineOptions({ inheritAttrs: false });
const model = defineModel<string>({ required: true });
</script>

<template>
  <span class="select-control">
    <select v-model="model" v-bind="$attrs">
      <slot />
    </select>
    <ChevronDown aria-hidden="true" />
  </span>
</template>

<style scoped>
.select-control {
  position: relative;
  display: block;
}
.select-control select {
  width: 100%;
  height: 38px;
  padding: 0 34px 0 12px;
  appearance: none;
  border: 1px solid var(--line);
  border-radius: 6px;
  outline: none;
  background: #1b1c1d;
  color: var(--text);
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    box-shadow 140ms ease;
}
.select-control select:hover {
  border-color: var(--line-strong);
  background: #1e1f20;
}
.select-control select:focus-visible {
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 18%, transparent);
}
.select-control svg {
  position: absolute;
  top: 50%;
  right: 11px;
  width: 16px;
  height: 16px;
  pointer-events: none;
  transform: translateY(-50%);
  fill: none;
  stroke: var(--muted);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: color 140ms ease;
}
.select-control:focus-within svg {
  stroke: var(--text);
}
@media (prefers-reduced-motion: reduce) {
  .select-control select,
  .select-control svg {
    transition: none;
  }
}
</style>
