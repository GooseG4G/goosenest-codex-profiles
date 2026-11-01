<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef } from 'vue'
import { useDelayedVisibility } from '../../composables/useDelayedVisibility'
import UIIcon from './UIIcon.vue'
import UITooltip from './UITooltip.vue'

const props = withDefaults(defineProps<{
  accessibleLabel: string
  title?: string
  tone?: 'neutral' | 'danger'
  disabled?: boolean
  pending?: boolean
  selected?: boolean
  size?: 'small' | 'medium'
  placement?: 'above' | 'horizontal'
}>(), {
  title: undefined,
  tone: 'neutral',
  size: 'medium',
  placement: 'above',
  pending: false,
  selected: undefined,
})

defineEmits<{ click: [event: MouseEvent] }>()
defineSlots<{ icon(): unknown; default(): unknown }>()

const showPending = useDelayedVisibility(() => props.pending)
const button = useTemplateRef<HTMLButtonElement>('button')
const tooltipId = useId()
const hovered = shallowRef(false)
const focused = shallowRef(false)
const tooltipDismissed = shallowRef(false)
const tooltipText = computed(() => props.title ?? props.accessibleLabel)
const tooltipOpen = computed(() =>
  !props.disabled && !props.pending && !tooltipDismissed.value && (hovered.value || focused.value),
)

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  tooltipDismissed.value = true
  hovered.value = false
  focused.value = false
}
function onPointerEnter(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  hovered.value = true
  tooltipDismissed.value = false
}
function onPointerLeave(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  hovered.value = false
  tooltipDismissed.value = false
}

onMounted(() => document.addEventListener('keydown', onDocumentKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onDocumentKeydown))

const classes = computed(() => [
  `tone-${props.tone}`,
  `size-${props.size}`,
  { 'is-selected': props.selected, 'is-pending': showPending.value },
])
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
    @click="tooltipDismissed = true; $emit('click', $event)"
    @pointerdown="focused = false"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @focus="focused = (button?.matches(':focus-visible') ?? false) && !button?.dataset.focusRestored; tooltipDismissed = false"
    @blur="focused = false; tooltipDismissed = false"
  >
    <span class="surface" aria-hidden="true" />
    <span class="content">
      <UIIcon class="icon"><slot name="icon" /></UIIcon>
      <span v-if="$slots.default" class="label"><slot /></span>
    </span>
  </button>
  <UITooltip :id="tooltipId" :anchor="button" :text="tooltipText" :open="tooltipOpen" :placement="placement" :instant="focused" />
</template>

<style scoped>
.icon-button { --button-background: var(--color-bg-surface); --button-foreground: var(--color-icon-button-foreground); --button-hover-background: var(--color-bg-control-hover); --button-pressed-background: var(--color-bg-control-pressed); position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 0; padding: 0; border: 0; border-radius: 6px; outline: none; background: none; color: var(--button-foreground); transition: color 160ms ease; }
.surface { position: absolute; inset: 0; z-index: 0; border: 1px solid transparent; border-radius: inherit; background: transparent; transform: scale(1); transform-origin: center; transition: transform 180ms ease, background-color 160ms ease, border-color 160ms ease; }
.content { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; gap: inherit; transform: scale(1); transform-origin: center; transition: transform 180ms ease; }
.size-small { width: 28px; height: 28px; }
.size-medium { width: 46px; height: 46px; }
.tone-danger { --button-foreground: var(--color-icon-button-danger-foreground); --button-hover-background: color-mix(in srgb, var(--color-icon-button-danger-foreground) 10%, transparent); --button-pressed-background: color-mix(in srgb, var(--color-icon-button-danger-foreground) 16%, transparent); }
.icon-button:focus-visible:not(:disabled) { --button-surface: var(--button-hover-background); color: var(--color-text-primary); }
.tone-danger.icon-button:focus-visible:not(:disabled) { color: var(--color-icon-button-danger-hover-foreground); }
.icon-button:focus-visible { --button-border: var(--color-focus); --button-focus-ring: 0 0 0 2px color-mix(in srgb, var(--color-focus) 24%, transparent); }
.icon-button[data-focus-restored]:focus-visible { --button-border: transparent; --button-focus-ring: none; }
.icon-button.is-selected { --button-surface: var(--button-hover-background); color: var(--color-text-primary); }
.surface { border-color: var(--button-border, transparent); background: var(--button-surface, transparent); box-shadow: var(--button-focus-ring, none); }
.icon { display: inline-flex; width: 17px; height: 17px; flex: 0 0 auto; }
.icon :deep(svg) { display: block; width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
.is-pending .icon { animation: icon-spin 0.7s linear infinite; }
.icon-button:disabled { opacity: .42; cursor: not-allowed; transform: none; transition: none; }
.icon-button.is-pending:disabled { cursor: wait; }
.icon-button:disabled .icon, .icon-button:disabled .label { opacity: .65; transform: none; }
.label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (hover: hover) and (pointer: fine) {
  .icon-button:hover:not(:disabled) { --button-surface: var(--button-hover-background); color: var(--color-text-primary); }
  .tone-danger.icon-button:hover:not(:disabled) { color: var(--color-icon-button-danger-hover-foreground); }
  .icon-button:hover:not(:disabled) { --surface-transform: scale(1.04); }
  .icon-button:hover:not(:disabled) .content { transform: scale(1.04); }
}
.surface { transform: var(--surface-transform, scale(1)); }
.icon-button:active:not(:disabled) .surface { --button-surface: var(--button-pressed-background); --surface-transform: scale(.98); transition-duration: 140ms; transition-timing-function: ease-in-out; }
.icon-button:active:not(:disabled) .content { transform: scale(.98); transition-duration: 140ms; transition-timing-function: ease-in-out; }
@keyframes icon-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .icon-button, .surface, .content, .icon { transition: none; }
  .icon-button:hover .surface, .icon-button:active .surface, .icon-button:hover .content, .icon-button:active .content, .icon-button:hover .icon, .icon-button:active .icon { transform: none; }
  .is-pending .icon { animation-duration: 1.4s; }
}
</style>
