<script setup lang="ts">
import { computed } from "vue";
import { useDelayedVisibility } from "../../composables/useDelayedVisibility";
const props = withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost" | "danger";
    disabled?: boolean;
    pending?: boolean;
    type?: "button" | "submit";
    href?: string;
    target?: "_blank" | "_self";
    rel?: string;
    size?: "default" | "small";
  }>(),
  {
    variant: "secondary",
    type: "button",
    pending: false,
    href: undefined,
    target: undefined,
    rel: undefined,
    size: "default",
  },
);
const emit = defineEmits<{ click: [event: MouseEvent] }>();
const showPending = useDelayedVisibility(() => props.pending);
const classes = computed(() => [
  "ui-button",
  `is-${props.variant}`,
  `is-${props.size}`,
  { "is-busy": props.pending, "is-pending": showPending.value },
]);
function handleClick(event: MouseEvent) {
  if (props.disabled || props.pending) {
    event.preventDefault();
    return;
  }
  emit("click", event);
}
</script>
<template>
  <component
    :is="href ? 'a' : 'button'"
    :type="href ? undefined : type"
    :href="href"
    :target="target"
    :rel="rel"
    :class="classes"
    :disabled="href ? undefined : disabled || pending"
    :aria-disabled="href && (disabled || pending) ? 'true' : undefined"
    :tabindex="href && (disabled || pending) ? -1 : undefined"
    :aria-busy="pending || undefined"
    @click="handleClick"
  >
    <span class="content"><slot /></span>
  </component>
</template>
<style scoped>
.ui-button {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  height: 34px;
  padding: 0 13px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  outline: none;
  background: var(--color-bg-raised);
  color: var(--color-text-primary);
  font-weight: 600;
  line-height: 1;
  text-decoration: none;
  transform: translateY(0) scale(1);
  --pending-shimmer: var(--color-shimmer-light);
  transition:
    transform 140ms ease,
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}
.content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}
.ui-button.is-small {
  min-width: 72px;
  height: 30px;
  padding: 0 10px;
  font-size: 12px;
}
.content :deep(svg) {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 150ms ease;
}
.ui-button:hover:not(:disabled):not([aria-disabled="true"]) {
  background: var(--color-bg-button-hover);
  border-color: var(--color-border-button-hover);
  transform: translateY(-1px);
}
.ui-button:hover:not(:disabled):not([aria-disabled="true"]) .content :deep(svg) {
  transform: scale(1.08);
}
.ui-button:active:not(:disabled):not([aria-disabled="true"]) {
  background: var(--color-bg-button-pressed);
  transform: translateY(0) scale(0.98);
}
.ui-button:active:not(:disabled):not([aria-disabled="true"]) .content :deep(svg) {
  transform: scale(0.96);
}
.ui-button:focus-visible {
  border-color: var(--color-focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-focus) 24%, transparent);
}
.ui-button[data-focus-restored]:focus-visible {
  border-color: var(--color-border-strong);
  box-shadow: none;
}
.is-primary[data-focus-restored]:focus-visible {
  border-color: var(--color-bg-accent);
}
.is-danger[data-focus-restored]:focus-visible {
  border-color: var(--color-border-danger);
}
.is-ghost[data-focus-restored]:focus-visible {
  border-color: transparent;
}
.is-primary {
  --pending-shimmer: var(--color-shimmer-dark);
  border-color: var(--color-bg-accent);
  background: var(--color-bg-accent);
  color: var(--color-text-inverse);
}
.is-primary:hover:not(:disabled):not([aria-disabled="true"]) {
  border-color: var(--color-bg-accent-hover);
  background: var(--color-bg-accent-hover);
}
.is-danger {
  border-color: var(--color-border-danger);
  background: var(--color-bg-danger);
  color: var(--color-text-on-emphasis);
}
.is-danger:hover:not(:disabled):not([aria-disabled="true"]) {
  border-color: var(--color-border-danger-hover);
  background: var(--color-bg-danger-hover);
}
.is-ghost {
  border-color: transparent;
  background: transparent;
  color: var(--color-text-secondary);
}
.is-ghost:hover:not(:disabled):not([aria-disabled="true"]) {
  color: var(--color-text-primary);
  background: var(--color-bg-control-hover);
}
.ui-button:disabled:not(.is-busy),
.ui-button[aria-disabled="true"]:not(.is-busy) {
  opacity: 0.48;
  cursor: not-allowed;
  transform: none;
}
.is-busy {
  opacity: 0.56;
  cursor: default;
  transform: none;
  transition:
    opacity 140ms ease,
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}
.is-busy:hover {
  cursor: wait;
}
.is-pending .content {
  opacity: 0.82;
}
.is-pending::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 16%,
    var(--pending-shimmer) 50%,
    transparent 84%
  );
  content: "";
  pointer-events: none;
  transform: translateX(-100%);
  animation: button-shimmer 1.25s linear infinite;
  will-change: transform;
}
@keyframes button-shimmer {
  to {
    transform: translateX(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-button,
  .content :deep(svg) {
    transition: none;
  }
  .ui-button:hover:not(:disabled),
  .ui-button:active:not(:disabled),
  .ui-button:hover:not(:disabled) .content :deep(svg) {
    transform: none;
  }
  .is-pending::after {
    animation: none;
    transform: none;
  }
}
</style>
