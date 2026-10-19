<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef } from "vue";
import UITooltip from "./UITooltip.vue";
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    accessibleLabel: string;
    tooltip?: string;
    disabled?: boolean;
    pending?: boolean;
  }>(),
  {
    disabled: false,
    pending: false,
    tooltip: undefined,
  },
);

const emit = defineEmits<{
  change: [value: boolean];
}>();
const button = useTemplateRef<HTMLButtonElement>("button");
const tooltipId = useId();
const hovered = shallowRef(false);
const focused = shallowRef(false);
const tooltipText = computed(() => props.tooltip ?? props.accessibleLabel);
const tooltipOpen = computed(() => !props.disabled && !props.pending && (hovered.value || focused.value));
function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  hovered.value = false;
  focused.value = false;
}
onMounted(() => document.addEventListener("keydown", onDocumentKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", onDocumentKeydown));

function toggle() {
  if (props.disabled || props.pending) return;
  emit("change", !props.modelValue);
}
</script>

<template>
  <button
    ref="button"
    type="button"
    class="ui-switch"
    :class="{ checked: modelValue, pending }"
    role="switch"
    :aria-label="accessibleLabel"
    :aria-describedby="tooltipId"
    :aria-checked="modelValue"
    :aria-busy="pending || undefined"
    :disabled="disabled || pending"
    @click.stop="toggle"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focus="focused = (button?.matches(':focus-visible') ?? false) && !button?.dataset.focusRestored"
    @blur="focused = false"
  >
    <span class="thumb" aria-hidden="true" />
  </button>
  <UITooltip :id="tooltipId" :anchor="button" :text="tooltipText" :open="tooltipOpen" :instant="focused" />
</template>

<style scoped>
.ui-switch {
  position: relative;
  width: 36px;
  height: 20px;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid var(--color-border-default);
  border-radius: 999px;
  outline: none;
  background: var(--color-switch-track-background);
  cursor: pointer;
  transition:
    background-color var(--duration-normal) var(--ease-standard),
    border-color var(--duration-normal) var(--ease-standard),
    opacity var(--duration-fast) var(--ease-standard);
}
.ui-switch:hover:not(:disabled) {
  border-color: var(--color-border-button-hover);
  background: var(--color-switch-track-hover-background);
}
.ui-switch:focus-visible {
  border-color: var(--color-focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-focus) 24%, transparent);
}
.ui-switch.checked {
  border-color: var(--color-border-strong);
  background: var(--color-switch-track-background);
}
.ui-switch.checked:hover:not(:disabled) {
  border-color: var(--color-border-button-hover);
  background: var(--color-switch-track-hover-background);
}
.thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-switch-thumb-inactive);
  transition:
    transform var(--duration-normal) var(--ease-out),
    background-color var(--duration-normal) var(--ease-standard);
}
.checked .thumb {
  background: var(--color-switch-thumb-active);
  transform: translateX(16px);
}
.ui-switch:disabled {
  cursor: default;
  opacity: 0.52;
}
.ui-switch.pending .thumb {
  animation: switch-pulse 0.8s ease-in-out infinite alternate;
}
@keyframes switch-pulse {
  to {
    opacity: 0.38;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-switch,
  .thumb {
    transition: none;
  }
  .ui-switch.pending .thumb {
    animation: none;
  }
}
</style>
