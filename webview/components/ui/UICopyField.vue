<script setup lang="ts">
import { Check, Copy } from '@lucide/vue'
import { computed, onUnmounted, shallowRef, useId, useTemplateRef } from 'vue'
import UITooltip from './UITooltip.vue'

const props = withDefaults(defineProps<{
  value: string
  label?: string
  copiedLabel?: string
  prominent?: boolean
  pending?: boolean
}>(), {
  label: 'Copy',
  copiedLabel: 'Copied',
  prominent: false,
  pending: false,
})

const emit = defineEmits<{ copy: [] }>()
const button = useTemplateRef<HTMLButtonElement>('button')
const tooltipId = useId()
const hovered = shallowRef(false)
const focused = shallowRef(false)
const copied = shallowRef(false)
const tooltipText = computed(() => copied.value ? props.copiedLabel : props.label)
const tooltipOpen = computed(() => !props.pending && (hovered.value || focused.value))
let resetTimer: number | undefined

function copy() {
  if (props.pending) return
  emit('copy')
  copied.value = true
  if (resetTimer) window.clearTimeout(resetTimer)
  resetTimer = window.setTimeout(() => { copied.value = false }, 1600)
}

onUnmounted(() => {
  if (resetTimer) window.clearTimeout(resetTimer)
})
</script>

<template>
  <button
    ref="button"
    type="button"
    class="copy-field"
    :class="{ prominent, copied, pending }"
    :aria-label="pending ? 'Waiting for device code' : tooltipText"
    :aria-describedby="pending ? undefined : tooltipId"
    :disabled="pending"
    @click="copy"
    @pointerenter="hovered = $event.pointerType !== 'touch'"
    @pointerleave="hovered = false"
    @focus="focused = button?.matches(':focus-visible') ?? false"
    @blur="focused = false"
  >
    <code v-if="!pending">{{ value }}</code>
    <span v-else class="copy-skeleton" aria-hidden="true" />
    <span class="copy-icon" aria-hidden="true"><Check v-if="copied" /><Copy v-else class="mirrored" /></span>
  </button>
  <UITooltip :id="tooltipId" :anchor="button" :text="tooltipText" :open="tooltipOpen" />
</template>

<style scoped>
.copy-field { display: grid; width: 100%; min-height: 42px; grid-template-columns: minmax(0, 1fr) 18px; align-items: center; gap: 10px; padding: 10px 12px; color: var(--color-text-primary); border: 1px solid var(--color-border-default); border-radius: 6px; outline: none; background: var(--color-bg-code); text-align: left; transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease, transform 100ms ease; }
.copy-field:focus-visible { color: var(--color-copy-info-foreground); border-color: var(--color-copy-info-border); background: var(--color-copy-info-background); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-focus) 20%, transparent); }
.copy-field:active:not(:disabled) { transform: scale(.995); }
.copy-field.copied { color: var(--color-copy-success-foreground); border-color: var(--color-copy-success-border); background: var(--color-copy-success-background); }
.copy-field code { overflow: hidden; padding: 0; border: 0; background: transparent; font: 500 12px/1.5 var(--vscode-editor-font-family, ui-monospace, Consolas, monospace); text-overflow: ellipsis; white-space: nowrap; }
.copy-field.prominent code { font-size: 25px; font-weight: 700; letter-spacing: .13em; text-align: center; }
.copy-icon { display: inline-flex; width: 16px; height: 16px; }
.copy-icon svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.5; }
.copy-icon .mirrored { transform: scaleX(-1); }
.copy-field.pending { cursor: wait; }
.copy-field.pending .copy-icon { opacity: .42; }
.copy-skeleton { position: relative; display: block; width: 126px; height: 24px; justify-self: center; overflow: hidden; border-radius: 4px; background: var(--color-bg-skeleton); }
.copy-skeleton::after { position: absolute; inset: 0; background: linear-gradient(105deg, transparent 18%, var(--color-shimmer-light) 50%, transparent 82%); content: ''; transform: translateX(-100%); animation: copy-shimmer 1.25s linear infinite; }
@keyframes copy-shimmer { to { transform: translateX(100%); } }
@media (hover: hover) and (pointer: fine) { .copy-field:hover:not(:disabled) { color: var(--color-copy-info-foreground); border-color: var(--color-copy-info-border); background: var(--color-copy-info-background); } }
@media (prefers-reduced-motion: reduce) { .copy-field { transition: none; } .copy-skeleton::after { animation: none; transform: none; } }
</style>
