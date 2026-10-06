<script setup lang="ts">
import { computed, useId } from 'vue'

interface Props {
  variant?: 'primary' | 'secondary'
  autofocus?: boolean
  disabled?: boolean
  tooltip?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'secondary',
  autofocus: false,
  disabled: false,
  tooltip: undefined,
})

defineEmits<{ click: [event: MouseEvent] }>()

const tooltipId = useId()
const hasTooltip = computed(() => Boolean(props.tooltip))
</script>

<template>
  <button
    class="button"
    :class="`variant-${variant}`"
    type="button"
    :autofocus="autofocus"
    :disabled="disabled"
    :aria-describedby="hasTooltip ? tooltipId : undefined"
    @click="$emit('click', $event)"
  >
    <slot />
    <span v-if="hasTooltip" :id="tooltipId" class="tooltip" role="tooltip">{{ tooltip }}</span>
  </button>
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
.tooltip {
  position: absolute;
  bottom: calc(100% + 7px);
  left: 50%;
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
  transform: translateX(-50%);
  transition: opacity 80ms ease, visibility 0s linear 80ms;
}
.button:hover .tooltip,
.button:focus-visible .tooltip {
  opacity: 1;
  visibility: visible;
  transition-delay: 450ms;
}
@media (prefers-reduced-motion: reduce) {
  .button, .tooltip { transition: none; }
  .button:hover, .button:active { transform: none; }
}
</style>
