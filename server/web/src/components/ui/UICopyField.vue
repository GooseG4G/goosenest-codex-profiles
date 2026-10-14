<script setup lang="ts">
import { Check, Copy } from "@lucide/vue";
import { computed, onUnmounted, shallowRef, useId, useTemplateRef } from "vue";
import UITooltip from "./UITooltip.vue";

const props = withDefaults(
  defineProps<{
    value: string;
    label?: string;
    copiedLabel?: string;
    prominent?: boolean;
  }>(),
  { label: "Copy", copiedLabel: "Copied", prominent: false },
);
const button = useTemplateRef<HTMLButtonElement>("button");
const tooltipId = useId();
const hovered = shallowRef(false);
const focused = shallowRef(false);
const copied = shallowRef(false);
const tooltipOpen = computed(() => hovered.value || focused.value);
const tooltipText = computed(() =>
  copied.value ? props.copiedLabel : props.label,
);
let resetTimer: number | undefined;

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = props.value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copiedSuccessfully = document.execCommand("copy");
    textarea.remove();
    if (!copiedSuccessfully) return;
  }
  copied.value = true;
  if (resetTimer) window.clearTimeout(resetTimer);
  resetTimer = window.setTimeout(() => {
    copied.value = false;
  }, 1600);
}
onUnmounted(() => {
  if (resetTimer) window.clearTimeout(resetTimer);
});
</script>

<template>
  <button
    ref="button"
    type="button"
    class="copy-field"
    :class="{ prominent, copied }"
    :aria-label="tooltipText"
    :aria-describedby="tooltipId"
    @click="copy"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focus="focused = true"
    @blur="focused = false"
  >
    <code>{{ value }}</code>
    <span class="copy-icon" aria-hidden="true"
      ><Check v-if="copied" /><Copy v-else class="mirrored"
    /></span>
  </button>
  <UITooltip
    :id="tooltipId"
    :anchor="button"
    :text="tooltipText"
    :open="tooltipOpen"
    :instant="focused"
  />
</template>

<style scoped>
.copy-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18px;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  outline: none;
  background: #111212;
  color: var(--text);
  text-align: left;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    color 140ms ease,
    transform 100ms ease;
}
.copy-field:hover,
.copy-field:focus-visible {
  border-color: #527bbd;
  background: #162033;
  color: #b9d2ff;
}
.copy-field:focus-visible {
  box-shadow: 0 0 0 2px #527bbd33;
}
.copy-field:active {
  transform: scale(0.995);
}
.copy-field.copied {
  border-color: #3d8c63;
  color: #8de1b0;
  background: #14241b;
}
.copy-field code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font:
    500 12px/1.5 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}
.copy-field.prominent code {
  text-align: center;
  font-size: 25px;
  font-weight: 700;
  letter-spacing: 0.13em;
}
.copy-icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
}
.copy-icon svg {
  width: 100%;
  height: 100%;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.copy-icon .mirrored {
  transform: scaleX(-1);
}
@media (prefers-reduced-motion: reduce) {
  .copy-field {
    transition: none;
  }
}
</style>
