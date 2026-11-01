<script setup lang="ts">
import UICancelButton from './UICancelButton.vue'
import UIDeleteButton from './UIDeleteButton.vue'
import UICloseButton from './UICloseButton.vue'
import UIDialog from './UIDialog.vue'

withDefaults(defineProps<{
  open: boolean
  title: string
  description: string
  pending?: boolean
  confirmLabel?: string
}>(), { pending: false, confirmLabel: 'Delete' })

defineEmits<{ close: []; confirm: [] }>()
</script>

<template>
  <UIDialog :open="open" :title="title" :description="description" width="small" :close-disabled="pending" @close="$emit('close')">
    <template #close="{ close }"><UICloseButton :disabled="pending" @click="close" /></template>
    <template #footer="{ close }">
      <UICancelButton :disabled="pending" @click="close" />
      <UIDeleteButton :pending="pending" @click="$emit('confirm')">{{ confirmLabel }}</UIDeleteButton>
    </template>
  </UIDialog>
</template>
