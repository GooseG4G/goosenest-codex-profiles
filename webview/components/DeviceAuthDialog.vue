<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import UICancelButton from './ui/UICancelButton.vue'
import UIConfirmButton from './ui/UIConfirmButton.vue'
import UICopyField from './ui/UICopyField.vue'
import UIDialog from './ui/UIDialog.vue'

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
  },
)
</script>

<template>
  <UIDialog
    :open="open"
    :title="error ? 'Authentication problem' : 'Sign in to Codex'"
    :close-disabled="authOpened"
    @close="emit('cancel')"
  >
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
    <template #footer="{ close }">
      <UICancelButton :disabled="authOpened" @click="close" />
      <UIConfirmButton v-if="error" @click="emit('retry')">Retry</UIConfirmButton>
      <UIConfirmButton v-else :pending="!verificationUrl || authOpened" @click="openBrowser">Go to OpenAI</UIConfirmButton>
    </template>
  </UIDialog>
</template>

<style scoped>
.message { margin: 0; color: var(--color-text-secondary); line-height: 1.45; }
.message.error { color: var(--color-error-foreground); overflow-wrap: anywhere; }
.message + :deep(.copy-field) { margin-top: 16px; }
.url { margin: 8px 0 0; overflow: hidden; color: var(--color-text-tertiary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
</style>
