<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from 'vue'
import UIButton from './UIButton.vue'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  secondaryLabel?: string
  confirmPending?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  secondaryLabel: undefined,
  confirmPending: false,
})

const emit = defineEmits<{ confirm: []; cancel: []; secondary: [] }>()
const panel = useTemplateRef<HTMLDivElement>('panel')

function confirm() {
  if (!props.confirmPending) emit('confirm')
}

function cancel() {
  if (!props.confirmPending) emit('cancel')
}

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
  <Transition name="dialog-layer">
    <div
      v-if="open"
      class="backdrop"
      @click.self="cancel"
      @keydown.esc.stop.prevent="cancel"
      @keydown.enter.stop.prevent="confirm"
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
          <UIButton :disabled="confirmPending" @click="cancel">{{ cancelLabel }}</UIButton>
          <UIButton v-if="secondaryLabel" @click="emit('secondary')">{{ secondaryLabel }}</UIButton>
          <UIButton
            variant="primary"
            autofocus
            :disabled="confirmPending"
            :pending="confirmPending"
            @click="confirm"
          >
            {{ confirmLabel }}
          </UIButton>
        </div>
      </div>
    </div>
  </Transition>
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
.dialog-layer-enter-active { transition: opacity 180ms ease; }
.dialog-layer-leave-active { transition: opacity 140ms ease; }
.dialog-layer-enter-active .dialog { transition: opacity 180ms ease, transform 180ms ease; }
.dialog-layer-leave-active .dialog { transition: opacity 140ms ease, transform 140ms ease; }
.dialog-layer-enter-from, .dialog-layer-leave-to { opacity: 0; }
.dialog-layer-enter-from .dialog, .dialog-layer-leave-to .dialog { opacity: 0; transform: translateY(5px) scale(.98); }
@media (prefers-reduced-motion: reduce) {
  .dialog-layer-enter-active, .dialog-layer-leave-active, .dialog-layer-enter-active .dialog, .dialog-layer-leave-active .dialog { transition: none; }
}
</style>
