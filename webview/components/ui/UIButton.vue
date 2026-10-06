<script setup lang="ts">
import { computed, shallowRef, useId, useTemplateRef } from 'vue'
import UITooltip from './UITooltip.vue'

interface Props {
  type?: 'button' | 'submit'
  variant?: 'primary' | 'secondary'
  autofocus?: boolean
  disabled?: boolean
  pending?: boolean
  tooltip?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'button',
  variant: 'secondary',
  autofocus: false,
  disabled: false,
  pending: false,
  tooltip: undefined,
})

defineEmits<{ click: [event: MouseEvent] }>()

const tooltipId = useId()
const hasTooltip = computed(() => Boolean(props.tooltip))
const button = useTemplateRef<HTMLButtonElement>('button')
const isTooltipHovered = shallowRef(false)
const isTooltipFocused = shallowRef(false)
const isTooltipOpen = computed(() => hasTooltip.value && (isTooltipHovered.value || isTooltipFocused.value))
</script>

<template>
  <button
    ref="button"
    class="button"
    :class="[`variant-${variant}`, { 'is-pending': pending }]"
    :type="type"
    :autofocus="autofocus"
    :disabled="disabled"
    :aria-busy="pending || undefined"
    :aria-describedby="hasTooltip ? tooltipId : undefined"
    @click="$emit('click', $event)"
    @mouseenter="isTooltipHovered = true"
    @mouseleave="isTooltipHovered = false"
    @focus="isTooltipFocused = true"
    @blur="isTooltipFocused = false"
  >
    <slot />
  </button>
  <UITooltip v-if="hasTooltip" :id="tooltipId" :anchor="button" :text="tooltip ?? ''" :open="isTooltipOpen" />
</template>

<style scoped>
.button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 5px;
  outline: none;
  font: inherit;
  line-height: 1;
  cursor: pointer;
  transform: scale(1);
  transform-origin: center;
  backface-visibility: hidden;
  will-change: transform;
  transition: transform 180ms ease, background-color 160ms ease, border-color 160ms ease;
}
.button:hover { transform: scale(1.04); }
.button:active { transform: scale(.98); }
.button:focus-visible { border-color: var(--vscode-focusBorder); }
.variant-primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
.variant-primary:hover { background: var(--vscode-button-hoverBackground); }
.variant-primary:active { background: color-mix(in srgb, var(--vscode-button-hoverBackground) 88%, var(--vscode-button-foreground) 12%); }
.variant-secondary { color: var(--vscode-foreground); background: transparent; }
.variant-secondary:hover { background: var(--vscode-toolbar-hoverBackground); }
.variant-secondary:active { background: var(--vscode-toolbar-activeBackground, var(--vscode-list-activeSelectionBackground)); }
.button:disabled {
  color: var(--vscode-disabledForeground);
  border-color: var(--vscode-widget-border);
  background: var(--vscode-input-background);
  cursor: not-allowed;
}
.button:disabled:hover, .button:disabled:active { background: var(--vscode-input-background); transform: scale(1); }
.button.is-pending:disabled { cursor: wait; }
@media (prefers-reduced-motion: reduce) {
  .button { transition: none; }
  .button:hover, .button:active { transform: none; }
}
</style>
