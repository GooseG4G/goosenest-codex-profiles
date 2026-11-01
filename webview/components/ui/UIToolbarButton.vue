<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef } from 'vue'
import UIIcon from './UIIcon.vue'
import UITooltip from './UITooltip.vue'
defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{ accessibleLabel: string; title?: string; disabled?: boolean; pending?: boolean; size?: 'small' | 'medium' }>(), { title: undefined, disabled: false, pending: false, size: 'medium' })
defineEmits<{ click: [event: MouseEvent] }>()
defineSlots<{ icon(): unknown }>()
const button = useTemplateRef<HTMLButtonElement>('button')
const tooltipId = useId()
const hovered = shallowRef(false)
const focused = shallowRef(false)
const tooltipDismissed = shallowRef(false)
const tooltipText = computed(() => props.title ?? props.accessibleLabel)
const tooltipOpen = computed(() => !props.disabled && !props.pending && !tooltipDismissed.value && (hovered.value || focused.value))
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
</script>
<template>
  <button ref="button" v-bind="$attrs" class="toolbar-button" :class="[`size-${props.size}`, { 'is-pending': props.pending }]" type="button" :aria-label="props.accessibleLabel" :aria-describedby="tooltipId" :aria-busy="props.pending || undefined" :disabled="props.disabled || props.pending" @click="$emit('click', $event)" @pointerdown="focused = false" @pointerenter="onPointerEnter" @pointerleave="onPointerLeave" @focus="focused = (button?.matches(':focus-visible') ?? false) && !button?.dataset.focusRestored; tooltipDismissed = false" @blur="focused = false; tooltipDismissed = false"><span class="toolbar-button-surface" aria-hidden="true" /><UIIcon class="toolbar-button-icon"><slot name="icon" /></UIIcon></button>
  <UITooltip :id="tooltipId" :anchor="button" :text="tooltipText" :open="tooltipOpen" :instant="focused" />
</template>
<style scoped>
.toolbar-button { --toolbar-button-background: var(--color-bg-surface); --toolbar-button-hover-background: var(--color-bg-control-hover); --toolbar-button-border: var(--color-border-default); --toolbar-button-hover-border: var(--color-border-strong); position: relative; display: inline-flex; width: 46px; height: 46px; padding: 0; align-items: center; justify-content: center; color: var(--color-icon-button-foreground); border: 0; border-radius: 6px; outline: none; background: transparent; transition: color 160ms ease; }
.toolbar-button.size-small { width: 28px; height: 28px; }
.toolbar-button-surface { position: absolute; inset: 0; border: 1px solid var(--toolbar-button-border); border-radius: inherit; background: var(--toolbar-button-background); transition: background-color 160ms ease, border-color 160ms ease; }
.toolbar-button-icon { position: relative; z-index: 1; transition: transform 180ms ease, color 160ms ease; }
.toolbar-button:focus-visible { --toolbar-button-border: var(--color-focus); color: var(--color-text-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-focus) 24%, transparent); }
.toolbar-button:disabled { opacity: .42; cursor: not-allowed; }
.toolbar-button.is-pending:disabled { cursor: wait; }
@media (hover: hover) and (pointer: fine) { .toolbar-button:hover:not(:disabled) { --toolbar-button-background: var(--toolbar-button-hover-background); --toolbar-button-border: var(--toolbar-button-hover-border); color: var(--color-text-primary); } .toolbar-button:hover:not(:disabled) .toolbar-button-icon { transform: scale(1.08); } }
.toolbar-button:active:not(:disabled) .toolbar-button-icon { transform: scale(.96); }
.is-pending .toolbar-button-icon { animation: toolbar-button-spin .7s linear infinite; }
@keyframes toolbar-button-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .toolbar-button, .toolbar-button-surface, .toolbar-button-icon { transition: none; } .toolbar-button:hover:not(:disabled) .toolbar-button-icon, .toolbar-button:active:not(:disabled) .toolbar-button-icon { transform: none; } .is-pending .toolbar-button-icon { animation-duration: 1.4s; } }
</style>
