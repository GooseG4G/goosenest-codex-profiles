<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from 'vue'
import UIButton from './UIButton.vue'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
})

const emit = defineEmits<{ confirm: []; cancel: [] }>()
const panel = useTemplateRef<HTMLDivElement>('panel')

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    panel.value?.focus()
  },
)
</script>

<template>
  <div
    v-if="open"
    class="backdrop"
    @click.self="emit('cancel')"
    @keydown.esc.stop.prevent="emit('cancel')"
    @keydown.enter.stop.prevent="emit('confirm')"
  >
    <div
      ref="panel"
      class="dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      tabindex="-1"
    >
      <h2 id="confirm-dialog-title" class="title">{{ title }}</h2>
      <p id="confirm-dialog-message" class="message">{{ message }}</p>
      <div class="actions">
        <UIButton @click="emit('cancel')">{{ cancelLabel }}</UIButton>
        <UIButton variant="primary" autofocus @click="emit('confirm')">{{ confirmLabel }}</UIButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(0 0 0 / 48%);
}
.dialog {
  box-sizing: border-box;
  width: min(100%, 360px);
  padding: 18px;
  color: var(--vscode-foreground);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 8px;
  outline: none;
  background: var(--vscode-editorWidget-background);
  box-shadow: 0 10px 32px rgb(0 0 0 / 32%);
}
.title { margin: 0 0 8px; font-size: 15px; font-weight: 600; }
.message { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.45; overflow-wrap: anywhere; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
</style>
