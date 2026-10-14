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
  }>(),
  {
    variant: "secondary",
    type: "button",
    pending: false,
    href: undefined,
    target: undefined,
    rel: undefined,
  },
);
const emit = defineEmits<{ click: [event: MouseEvent] }>();
const showPending = useDelayedVisibility(() => props.pending);
const classes = computed(() => [
  "ui-button",
  `is-${props.variant}`,
  { "is-pending": showPending.value },
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
    <span v-if="showPending" class="spinner" aria-hidden="true" /><span
      class="content"
      ><slot
    /></span>
  </component>
</template>
<style scoped>
.ui-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  height: 34px;
  padding: 0 13px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  outline: none;
  background: var(--surface-raised);
  color: var(--text);
  font-weight: 600;
  line-height: 1;
  text-decoration: none;
  transform: translateY(0) scale(1);
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
  background: #292a2b;
  border-color: #4b4c4d;
  transform: translateY(-1px);
}
.ui-button:hover:not(:disabled):not([aria-disabled="true"]) .content :deep(svg) {
  transform: scale(1.08);
}
.ui-button:active:not(:disabled):not([aria-disabled="true"]) {
  background: #303132;
  transform: translateY(0) scale(0.98);
}
.ui-button:focus-visible {
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 24%, transparent);
}
.ui-button[data-focus-restored]:focus-visible {
  border-color: var(--line-strong);
  box-shadow: none;
}
.is-primary[data-focus-restored]:focus-visible {
  border-color: #ededed;
}
.is-danger[data-focus-restored]:focus-visible {
  border-color: #8a3f3a;
}
.is-ghost[data-focus-restored]:focus-visible {
  border-color: transparent;
}
.is-primary {
  border-color: #ededed;
  background: #ededed;
  color: #171717;
}
.is-primary:hover:not(:disabled):not([aria-disabled="true"]) {
  border-color: #fff;
  background: #fff;
}
.is-danger {
  border-color: #8a3f3a;
  background: #7b332f;
  color: #fff;
}
.is-danger:hover:not(:disabled):not([aria-disabled="true"]) {
  border-color: #a64a44;
  background: #913b36;
}
.is-ghost {
  border-color: transparent;
  background: transparent;
  color: var(--muted);
}
.is-ghost:hover:not(:disabled):not([aria-disabled="true"]) {
  color: var(--text);
  background: var(--hover);
}
.ui-button:disabled,
.ui-button[aria-disabled="true"] {
  opacity: 0.48;
  cursor: not-allowed;
  transform: none;
}
.is-pending {
  cursor: wait;
}
.is-pending .content {
  opacity: 0.35;
}
.spinner {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
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
  .spinner {
    animation-duration: 1.4s;
  }
}
</style>
