<script setup lang="ts">
import { ChevronDown } from "@lucide/vue";

defineOptions({ inheritAttrs: false });
withDefaults(
  defineProps<{
    disabled?: boolean;
  }>(),
  {
    disabled: false,
  },
);
const model = defineModel<string>({ required: true });
</script>

<template>
  <span class="select-control" :class="{ disabled }">
    <select v-model="model" v-bind="$attrs" :disabled="disabled">
      <slot />
    </select>
    <ChevronDown aria-hidden="true" />
  </span>
</template>

<style scoped>
.select-control {
  position: relative;
  display: block;
  border-radius: 6px;
}
.select-control select {
  width: 100%;
  height: 38px;
  padding: 0 34px 0 12px;
  appearance: none;
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  outline: none;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    box-shadow 140ms ease;
}
.select-control:not(.disabled):hover select {
  border-color: var(--color-border-strong);
  background: var(--color-bg-raised);
}
.select-control select:focus-visible {
  border-color: var(--color-focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-focus) 18%, transparent);
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
  stroke: var(--color-text-secondary);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition:
    color 140ms ease,
    transform 140ms ease;
}
.select-control:focus-within svg {
  stroke: var(--color-text-primary);
}
.select-control:has(select:open) svg {
  transform: translateY(-50%) rotate(180deg);
}
.select-control.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.select-control select:disabled {
  cursor: not-allowed;
}
@media (prefers-reduced-motion: reduce) {
  .select-control select,
  .select-control svg {
    transition: none;
  }
}
</style>
