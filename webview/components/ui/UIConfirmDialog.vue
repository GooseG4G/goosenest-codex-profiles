<script setup lang="ts">
import UICancelButton from './UICancelButton.vue'
import UIConfirmButton from './UIConfirmButton.vue'
import UICloseButton from './UICloseButton.vue'
import UIDialog from './UIDialog.vue'

withDefaults(defineProps<{
  open: boolean
  title: string
  description: string
  pending?: boolean
  confirmLabel?: string
  confirmVariant?: 'primary' | 'danger'
}>(), { pending: false, confirmLabel: 'Delete', confirmVariant: 'danger' })

defineEmits<{ close: []; confirm: [] }>()
</script>

<template>
  <UIDialog :open="open" :title="title" :description="description" width="small" :close-disabled="pending" @close="$emit('close')">
    <template #close="{ close }"><UICloseButton :disabled="pending" @click="close" /></template>
    <template #footer="{ close }">
      <UICancelButton :disabled="pending" @click="close" />
      <UIConfirmButton :variant="confirmVariant" :pending="pending" @click="$emit('confirm')">{{ confirmLabel }}</UIConfirmButton>
    </template>
  </UIDialog>
</template>
