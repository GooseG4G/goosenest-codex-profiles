<script setup lang="ts">
import { computed } from 'vue'
import { useDelayedVisibility } from '../../composables/useDelayedVisibility'

const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary'
  disabled?: boolean
  pending?: boolean
  type?: 'button' | 'submit'
}>(), {
  variant: 'secondary',
  disabled: false,
  pending: false,
  type: 'button',
})

const emit = defineEmits<{ click: [event: MouseEvent] }>()
const showPending = useDelayedVisibility(() => props.pending)
const classes = computed(() => [
  `is-${props.variant}`,
  { 'is-busy': props.pending, 'is-pending': showPending.value },
])
</script>

<template>
  <button
    class="line-button"
    :class="classes"
    :type="type"
    :disabled="disabled || pending"
    :aria-busy="pending || undefined"
    @click="emit('click', $event)"
  >
    <span class="line-button-surface" aria-hidden="true" />
    <span class="line-button-content"><slot /></span>
  </button>
</template>

<style scoped>
.line-button {
  --button-background: var(--color-button-secondary-background);
  --button-border: var(--color-button-secondary-border);
  --button-hover-background: var(--color-button-secondary-hover-background);
  --button-hover-border: var(--color-button-secondary-hover-border);
  --button-pressed-background: var(--color-button-secondary-pressed-background);
  --pending-shimmer: var(--color-shimmer-light);
  position: relative;
  display: inline-flex;
  overflow: hidden;
  height: 34px;
  min-width: 72px;
  padding: 0 13px;
  align-items: center;
  justify-content: center;
  color: var(--color-text-primary);
  border: 0;
  border-radius: 6px;
  outline: none;
  background: none;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  line-height: 1;
  transform: translateY(0);
  transition: color 140ms ease, transform 180ms cubic-bezier(.2,.8,.2,1);
}
.line-button-surface { position: absolute; z-index: 0; inset: 0; border: 1px solid var(--button-border); border-radius: inherit; background: var(--button-background); box-shadow: var(--button-focus-ring, none); transition: background-color 140ms ease, border-color 140ms ease; }
.line-button-content { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
.line-button:focus-visible { --button-border: var(--color-focus); --button-focus-ring: 0 0 0 2px color-mix(in srgb, var(--color-focus) 24%, transparent); }
.is-primary { --pending-shimmer: var(--color-shimmer-dark); --button-background: var(--color-button-primary-background); --button-border: var(--color-button-primary-border); --button-hover-background: var(--color-button-primary-hover-background); --button-hover-border: var(--color-button-primary-hover-border); --button-pressed-background: var(--color-button-primary-background); color: var(--color-button-primary-foreground); }
.line-button:disabled:not(.is-busy) { opacity: .48; cursor: not-allowed; }
.is-busy { opacity: .56; cursor: wait; }
.is-pending .line-button-content { opacity: .82; }
.is-pending::after { position: absolute; inset: 0; background: linear-gradient(105deg, transparent 16%, var(--pending-shimmer) 50%, transparent 84%); content: ''; pointer-events: none; transform: translateX(-100%); animation: button-shimmer 1.25s linear infinite; will-change: transform; }
@keyframes button-shimmer { to { transform: translateX(100%); } }
@media (hover: hover) and (pointer: fine) {
  .line-button:hover:not(:disabled) { --button-background: var(--button-hover-background); --button-border: var(--button-hover-border); transform: translateY(-1px); }
}
.line-button:active:not(:disabled) { --button-background: var(--button-pressed-background); transform: translateY(1px); }
@media (prefers-reduced-motion: reduce) {
  .line-button, .line-button-surface, .line-button-content { transition: none; }
  .line-button:hover:not(:disabled), .line-button:active:not(:disabled) { transform: none; }
  .is-pending::after { animation: none; transform: none; }
}
</style>
