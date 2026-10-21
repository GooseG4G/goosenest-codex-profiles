<script setup lang="ts">
import { Search } from "@lucide/vue";

defineOptions({ inheritAttrs: false });
withDefaults(
  defineProps<{
    placeholder?: string;
    accessibleLabel?: string;
    disabled?: boolean;
  }>(),
  {
    placeholder: "Search...",
    accessibleLabel: "Search",
    disabled: false,
  },
);
const model = defineModel<string>({ required: true });
</script>

<template>
  <label class="search-field" :class="{ disabled }">
    <Search aria-hidden="true" />
    <input
      v-model="model"
      v-bind="$attrs"
      type="search"
      :aria-label="accessibleLabel"
      :placeholder="placeholder"
      :disabled="disabled"
    />
  </label>
</template>

<style scoped>
.search-field {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 46px;
  padding: 0 14px;
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    color 140ms ease;
}
.search-field:focus-within {
  border-color: var(--color-focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-focus) 18%, transparent);
  color: var(--color-text-primary);
}
.search-field svg {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
}
.search-field input,
.search-field input:focus {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  outline: 0;
  background: transparent;
  box-shadow: none;
}
.search-field.disabled {
  opacity: 0.48;
}
@media (hover: hover) and (pointer: fine) {
  .search-field:hover:not(.disabled):not(:focus-within) {
    border-color: var(--color-border-strong);
  }
}
@media (prefers-reduced-motion: reduce) {
  .search-field {
    transition: none;
  }
}
</style>
