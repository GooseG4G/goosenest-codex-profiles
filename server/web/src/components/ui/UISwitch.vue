<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    accessibleLabel: string;
    disabled?: boolean;
    pending?: boolean;
  }>(),
  {
    disabled: false,
    pending: false,
  },
);

const emit = defineEmits<{
  change: [value: boolean];
}>();

function toggle() {
  if (props.disabled || props.pending) return;
  emit("change", !props.modelValue);
}
</script>

<template>
  <button
    type="button"
    class="ui-switch"
    :class="{ checked: modelValue, pending }"
    role="switch"
    :aria-label="accessibleLabel"
    :aria-checked="modelValue"
    :aria-busy="pending || undefined"
    :title="accessibleLabel"
    :disabled="disabled || pending"
    @click.stop="toggle"
  >
    <span class="thumb" aria-hidden="true" />
  </button>
</template>

<style scoped>
.ui-switch {
  position: relative;
  width: 32px;
  height: 18px;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  outline: none;
  background: var(--color-bg-widget);
  cursor: pointer;
  transition:
    background-color var(--duration-normal) var(--ease-standard),
    border-color var(--duration-normal) var(--ease-standard),
    opacity var(--duration-fast) var(--ease-standard);
}
.ui-switch:hover:not(:disabled) {
  border-color: var(--color-text-tertiary);
}
.ui-switch:focus-visible {
  border-color: var(--color-focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-focus) 24%, transparent);
}
.ui-switch.checked {
  border-color: var(--color-border-success);
  background: var(--color-bg-success-subtle);
}
.thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-status-inactive);
  transition:
    transform var(--duration-normal) var(--ease-out),
    background-color var(--duration-normal) var(--ease-standard);
}
.checked .thumb {
  background: var(--color-success);
  transform: translateX(14px);
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
