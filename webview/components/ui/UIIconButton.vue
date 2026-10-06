<script setup lang="ts">
import { computed, shallowRef, useId, useTemplateRef } from 'vue'

export type IconButtonBackground = 'always' | 'hover' | 'never'
export type IconButtonSurfaceMotion = 'lift' | 'scale' | 'none'
export type IconButtonIconMotion = 'together' | 'spin' | 'tilt-clockwise' | 'tilt-counterclockwise' | 'shift-diagonal' | 'none'

interface Props {
  accessibleLabel: string
  title?: string
  disabled?: boolean
  selected?: boolean
  tone?: 'neutral' | 'danger'
  background?: IconButtonBackground
  surfaceMotion?: IconButtonSurfaceMotion
  iconMotion?: IconButtonIconMotion
  size?: 'small' | 'medium'
}

const props = withDefaults(defineProps<Props>(), {
  title: undefined,
  disabled: false,
  tone: 'neutral',
  background: 'hover',
  surfaceMotion: 'lift',
  iconMotion: 'together',
  size: 'medium',
})

defineEmits<{ click: [event: MouseEvent] }>()
defineSlots<{
  icon(): unknown
  default(): unknown
}>()

const tooltipId = useId()
const tooltipText = computed(() => props.title ?? props.accessibleLabel)
const button = useTemplateRef<HTMLButtonElement>('button')
const tooltipSide = shallowRef<'left' | 'right'>('left')

function updateTooltipSide() {
  const rect = button.value?.getBoundingClientRect()
  if (!rect) return
  tooltipSide.value = rect.left < window.innerWidth - rect.right ? 'right' : 'left'
}

const buttonClasses = computed(() => [
  `background-${props.background}`,
  `surface-${props.surfaceMotion}`,
  `icon-${props.iconMotion}`,
  `size-${props.size}`,
  `tone-${props.tone}`,
  { 'is-selected': props.selected },
])
</script>

<template>
  <button
    ref="button"
    class="icon-button"
    :class="buttonClasses"
    type="button"
    :aria-label="accessibleLabel"
    :aria-describedby="tooltipId"
    :disabled="disabled"
    :aria-pressed="selected === undefined ? undefined : selected"
    @click="$emit('click', $event)"
    @mouseenter="updateTooltipSide"
    @focus="updateTooltipSide"
  >
    <span class="icon" aria-hidden="true"><slot name="icon" /></span>
    <span v-if="$slots.default" class="label"><slot /></span>
    <span :id="tooltipId" class="tooltip" :class="`tooltip-${tooltipSide}`" role="tooltip">{{ tooltipText }}</span>
  </button>
</template>

<style scoped>
.icon-button {
  --button-background: var(--vscode-toolbar-hoverBackground);
  --button-foreground: var(--vscode-foreground);
  --button-hover-background: var(--vscode-toolbar-hoverBackground);
  --button-pressed-background: var(--vscode-toolbar-activeBackground, var(--vscode-list-activeSelectionBackground));
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 0;
  color: var(--button-foreground);
  border: 1px solid transparent;
  border-radius: 6px;
  outline: none;
  cursor: pointer;
  font: inherit;
  font-weight: 500;
  transform: scale(1);
  transform-origin: center;
  backface-visibility: hidden;
  will-change: transform;
  transition: transform 180ms ease, background-color 160ms ease, border-color 160ms ease;
}
.size-small { width: 28px; height: 28px; padding: 5px; font-size: 11px; }
.size-medium { min-height: 28px; padding: 5px 9px; font-size: 12px; }
.tone-danger {
  --button-foreground: var(--vscode-errorForeground);
  --button-hover-background: var(--vscode-inputValidation-errorBackground, var(--vscode-toolbar-hoverBackground));
  --button-pressed-background: var(--vscode-inputValidation-errorBackground, var(--vscode-toolbar-hoverBackground));
}
.background-always { background: var(--button-background); }
.background-always:hover { background: var(--button-hover-background); }
.background-hover { color: var(--button-foreground); background: transparent; }
.background-hover:hover { color: var(--button-foreground); background: var(--button-hover-background); }
.background-never { color: var(--button-foreground); background: transparent; }
.background-never:hover { color: var(--button-foreground); background: transparent; }
.icon-button:focus-visible { border-color: var(--vscode-focusBorder); }
.icon-button.is-selected { color: var(--button-foreground); background: var(--button-hover-background); }
.icon-button:active { background: var(--button-pressed-background); }
.surface-lift:hover { transform: translate3d(0, -2px, 0) scale(1); }
.surface-lift:active { transform: translate3d(0, 1px, 0) scale(.98); }
.surface-scale:hover { transform: scale(1.04); }
.surface-scale:active { transform: scale(.98); }
.icon {
  display: inline-flex;
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  transform: rotate(0) scale(1);
  transform-origin: center;
  backface-visibility: hidden;
  will-change: transform;
  transition: transform 180ms ease;
}
.icon :deep(svg) { display: block; width: 100%; height: 100%; }
.surface-none.icon-together:hover .icon { transform: scale(1.08); }
.surface-none.icon-together:active .icon { transform: scale(.94); }
.icon-spin:hover .icon { transform: rotate(180deg); }
.icon-spin:active .icon { transform: rotate(320deg) scale(.9); }
.icon-tilt-clockwise:hover .icon { transform: rotate(12deg); }
.icon-tilt-clockwise:active .icon { transform: rotate(-5deg) scale(.9); }
.icon-tilt-counterclockwise:hover .icon { transform: rotate(-12deg); }
.icon-tilt-counterclockwise:active .icon { transform: rotate(5deg) scale(.9); }
.icon-shift-diagonal:hover .icon { transform: translate3d(2px, -2px, 0); }
.icon-shift-diagonal:active .icon { transform: translate3d(-1px, 1px, 0) scale(.9); }
.icon-button:disabled { color: var(--vscode-disabledForeground); background: transparent; cursor: default; opacity: .65; transform: none; }
.icon-button:disabled .icon { transform: none; }
.label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tooltip {
  position: absolute;
  top: 50%;
  z-index: 20;
  max-width: 240px;
  padding: 4px 7px;
  color: var(--vscode-editorHoverWidget-foreground, var(--vscode-foreground));
  border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-widget-border));
  border-radius: 3px;
  background: var(--vscode-editorHoverWidget-background, var(--vscode-editorWidget-background, var(--vscode-editor-background)));
  box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgb(0 0 0 / 36%));
  font-size: 12px;
  font-weight: 400;
  line-height: 1.35;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-50%);
  transition: opacity 80ms ease, visibility 0s linear 80ms;
}
.tooltip-left { right: calc(100% + 7px); }
.tooltip-right { left: calc(100% + 7px); }
.icon-button:hover .tooltip,
.icon-button:focus-visible .tooltip {
  opacity: 1;
  visibility: visible;
  transition-delay: 450ms;
}
@media (prefers-reduced-motion: reduce) {
  .icon-button, .icon, .tooltip { transition: none; }
  .icon-button:hover, .icon-button:active, .icon-button:hover .icon, .icon-button:active .icon { transform: none; }
}
</style>
