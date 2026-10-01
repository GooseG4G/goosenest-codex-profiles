<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'secondary'
  autofocus?: boolean
}

withDefaults(defineProps<Props>(), {
  variant: 'secondary',
  autofocus: false,
})

defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <button class="button" :class="`variant-${variant}`" type="button" :autofocus="autofocus" @click="$emit('click', $event)">
    <slot />
  </button>
</template>

<style scoped>
.button {
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
  transition: background-color 120ms ease, transform 120ms cubic-bezier(.2, .8, .2, 1);
}
.button:hover { transform: scale(1.04); }
.button:active { transform: scale(.96); }
.button:focus-visible { border-color: var(--vscode-focusBorder); }
.variant-primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
.variant-primary:hover { background: var(--vscode-button-hoverBackground); }
.variant-secondary { color: var(--vscode-foreground); background: transparent; }
.variant-secondary:hover { background: var(--vscode-toolbar-hoverBackground); }
.variant-secondary:active { background: var(--vscode-toolbar-activeBackground, var(--vscode-list-activeSelectionBackground)); }
@media (prefers-reduced-motion: reduce) {
  .button { transition: none; }
  .button:hover, .button:active { transform: none; }
}
</style>
