<script setup lang="ts">
import { computed, shallowRef, useId, useTemplateRef } from "vue";
import { useDelayedVisibility } from "../../composables/useDelayedVisibility";
import UITooltip from "./UITooltip.vue";

type Background = "always" | "hover" | "never";
type SurfaceMotion = "lift" | "scale" | "none";
type IconMotion =
  | "together"
  | "spin"
  | "tilt-clockwise"
  | "tilt-counterclockwise"
  | "shift-diagonal"
  | "none";

const props = withDefaults(
  defineProps<{
    accessibleLabel: string;
    title?: string;
    tone?: "neutral" | "danger";
    disabled?: boolean;
    pending?: boolean;
    selected?: boolean;
    size?: "small" | "medium";
    placement?: "above" | "horizontal";
    background?: Background;
    surfaceMotion?: SurfaceMotion;
    iconMotion?: IconMotion;
  }>(),
  {
    title: undefined,
    tone: "neutral",
    size: "medium",
    placement: "above",
    background: "hover",
    surfaceMotion: "none",
    iconMotion: "together",
    pending: false,
    selected: undefined,
  },
);
defineEmits<{ click: [event: MouseEvent] }>();
defineSlots<{ icon(): unknown; default(): unknown }>();

const showPending = useDelayedVisibility(() => props.pending);
const button = useTemplateRef<HTMLButtonElement>("button");
const tooltipId = useId();
const hovered = shallowRef(false);
const focused = shallowRef(false);
const tooltipText = computed(() => props.title ?? props.accessibleLabel);
const tooltipOpen = computed(
  () => !props.disabled && !props.pending && (hovered.value || focused.value),
);
const classes = computed(() => [
  `tone-${props.tone}`,
  `size-${props.size}`,
  `background-${props.background}`,
  `surface-${props.surfaceMotion}`,
  `icon-${props.iconMotion}`,
  { "is-selected": props.selected, "is-pending": showPending.value },
]);
</script>

<template>
  <button
    ref="button"
    type="button"
    class="icon-button"
    :class="classes"
    :aria-label="accessibleLabel"
    :aria-describedby="tooltipId"
    :aria-busy="pending || undefined"
    :aria-pressed="selected === undefined ? undefined : selected"
    :disabled="disabled || pending"
    @click="$emit('click', $event)"
    @pointerdown="focused = false"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focus="focused = button?.matches(':focus-visible') ?? false"
    @blur="focused = false"
  >
    <span class="icon" aria-hidden="true"><slot name="icon" /></span>
    <span v-if="$slots.default" class="label"><slot /></span>
  </button>
  <UITooltip
    :id="tooltipId"
    :anchor="button"
    :text="tooltipText"
    :open="tooltipOpen"
    :placement="placement"
    :instant="focused"
  />
</template>

<style scoped>
.icon-button {
  --button-background: var(--color-bg-surface);
  --button-foreground: var(--color-icon);
  --button-hover-background: var(--color-bg-control-hover);
  --button-pressed-background: var(--color-bg-control-pressed);
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  outline: none;
  background: transparent;
  color: var(--button-foreground);
  transform: scale(1);
  transform-origin: center;
  backface-visibility: hidden;
  transition:
    transform 180ms ease,
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}
.size-small {
  width: 28px;
  height: 28px;
}
.size-medium {
  width: 46px;
  height: 46px;
}
.size-medium.background-always {
  border-color: var(--color-border-default);
}
.tone-danger {
  --button-foreground: var(--color-danger);
  --button-hover-background: color-mix(in srgb, var(--color-danger) 10%, transparent);
  --button-pressed-background: color-mix(
    in srgb,
    var(--color-danger) 16%,
    transparent
  );
}
.background-always {
  background: var(--button-background);
}
.background-always:hover:not(:disabled),
.background-always:focus-visible:not(:disabled),
.background-hover:hover:not(:disabled),
.background-hover:focus-visible:not(:disabled) {
  background: var(--button-hover-background);
  color: var(--color-text-primary);
}
.tone-danger.background-always:hover:not(:disabled),
.tone-danger.background-always:focus-visible:not(:disabled),
.tone-danger.background-hover:hover:not(:disabled),
.tone-danger.background-hover:focus-visible:not(:disabled) {
  color: var(--color-danger-emphasis);
}
.background-never:hover:not(:disabled),
.background-never:focus-visible:not(:disabled) {
  background: transparent;
}
.icon-button:focus-visible {
  border-color: var(--color-focus);
}
.icon-button[data-focus-restored]:focus-visible {
  border-color: transparent;
}
.icon-button.background-always[data-focus-restored]:focus-visible {
  border-color: var(--color-border-default);
}
.icon-button.is-selected {
  background: var(--button-hover-background);
  color: var(--color-text-primary);
}
.icon-button:active:not(:disabled) {
  background: var(--button-pressed-background);
}
.surface-lift:hover:not(:disabled),
.surface-lift:focus-visible:not(:disabled) {
  transform: translate3d(0, -2px, 0);
}
.surface-lift:active:not(:disabled) {
  transform: translate3d(0, 1px, 0) scale(0.98);
}
.surface-scale:hover:not(:disabled),
.surface-scale:focus-visible:not(:disabled) {
  transform: scale(1.04);
}
.surface-scale:active:not(:disabled) {
  transform: scale(0.98);
}
.surface-none {
  transform: none;
}
.icon {
  display: inline-flex;
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  transform: rotate(0) scale(1);
  transform-origin: center;
  backface-visibility: hidden;
  transition: transform 180ms ease;
}
.icon :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}
.icon-together:hover:not(:disabled) .icon,
.icon-together:focus-visible:not(:disabled) .icon {
  transform: scale(1.06);
}
.icon-together:active:not(:disabled) .icon {
  transform: scale(0.96);
}
.icon-spin:hover:not(:disabled) .icon,
.icon-spin:focus-visible:not(:disabled) .icon {
  transform: rotate(180deg);
}
.icon-spin:active:not(:disabled) .icon {
  transform: rotate(320deg) scale(0.9);
}
.icon-tilt-clockwise:hover:not(:disabled) .icon,
.icon-tilt-clockwise:focus-visible:not(:disabled) .icon {
  transform: rotate(12deg);
}
.icon-tilt-counterclockwise:hover:not(:disabled) .icon,
.icon-tilt-counterclockwise:focus-visible:not(:disabled) .icon {
  transform: rotate(-12deg);
}
.icon-shift-diagonal:hover:not(:disabled) .icon,
.icon-shift-diagonal:focus-visible:not(:disabled) .icon {
  transform: translate3d(2px, -2px, 0);
}
.icon-none .icon {
  transform: none;
}
.is-pending .icon {
  animation: icon-spin 0.7s linear infinite;
}
.icon-button:disabled {
  opacity: 0.42;
  cursor: default;
  transform: none;
  transition: none;
}
.icon-button:disabled .icon,
.icon-button:disabled .label {
  opacity: 0.65;
  transform: none;
}
.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@keyframes icon-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .icon-button,
  .icon {
    transition: none;
  }
  .icon-button:hover,
  .icon-button:active,
  .icon-button:hover .icon,
  .icon-button:active .icon {
    transform: none;
  }
  .is-pending .icon {
    animation-duration: 1.4s;
  }
}
</style>
