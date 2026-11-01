<script setup lang="ts">
import { nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import UICancelButton from './ui/UICancelButton.vue'
import UIConfirmButton from './ui/UIConfirmButton.vue'
import UICopyField from './ui/UICopyField.vue'

const props = defineProps<{
  open: boolean
  userCode?: string
  verificationUrl?: string
  error?: string
}>()

const emit = defineEmits<{
  openBrowser: []
  copyCode: []
  cancel: []
  retry: []
}>()

const panel = useTemplateRef<HTMLDivElement>('panel')
const authOpened = shallowRef(false)

function openBrowser() {
  if (!props.verificationUrl || authOpened.value) return
  authOpened.value = true
  emit('openBrowser')
}

watch(
  () => [props.open, props.userCode, props.error] as const,
  async ([open, userCode, error], previous) => {
    if (!open) return
    if (!previous?.[0] || userCode !== previous[1] || error !== previous[2]) authOpened.value = false
    await nextTick()
    panel.value?.focus()
  },
)
</script>

<template>
  <Transition name="device-auth-layer">
    <div
      v-if="open"
      class="backdrop"
      @click.self="emit('cancel')"
      @keydown.esc.stop.prevent="emit('cancel')"
    >
      <div ref="panel" class="dialog" role="dialog" aria-modal="true" aria-labelledby="device-auth-title" tabindex="-1">
        <h2 id="device-auth-title" class="title">{{ error ? 'Authentication problem' : 'Sign in to Codex' }}</h2>
        <p v-if="error" class="message error" role="alert">{{ error }}</p>
        <template v-else>
          <p class="message">Open the sign-in page and enter this one-time code. The profile will be added automatically.</p>
          <UICopyField
            :value="userCode || ''"
            label="Copy code"
            copied-label="Code copied"
            prominent
            :pending="!userCode"
            @copy="emit('copyCode')"
          />
          <p class="url">{{ verificationUrl }}</p>
        </template>
        <div class="actions">
          <UICancelButton :disabled="authOpened" @click="emit('cancel')" />
          <UIConfirmButton v-if="error" @click="emit('retry')">Retry</UIConfirmButton>
          <UIConfirmButton v-else :pending="!verificationUrl || authOpened" @click="openBrowser">Go to OpenAI</UIConfirmButton>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop { position: fixed; z-index: 100; inset: 0; display: grid; place-items: center; padding: 20px; background: rgb(0 0 0 / 48%); }
.dialog { box-sizing: border-box; width: min(100%, 380px); padding: 18px; color: var(--color-text-primary); border: 1px solid var(--color-border-default); border-radius: 8px; outline: none; background: var(--color-bg-dialog); box-shadow: 0 10px 32px rgb(0 0 0 / 32%); }
.title { margin: 0 0 8px; font-size: 15px; font-weight: 600; }
.message { margin: 0; color: var(--color-text-secondary); line-height: 1.45; }
.message.error { color: var(--color-error-foreground); overflow-wrap: anywhere; }
.message + :deep(.copy-field) { margin-top: 16px; }
.url { margin: 8px 0 0; overflow: hidden; color: var(--color-text-tertiary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.device-auth-layer-enter-active { transition: opacity 180ms ease; }
.device-auth-layer-leave-active { transition: opacity 140ms ease; }
.device-auth-layer-enter-from, .device-auth-layer-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .device-auth-layer-enter-active, .device-auth-layer-leave-active { transition: none; } }
</style>
