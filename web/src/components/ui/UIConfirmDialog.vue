<script setup lang="ts">
import { X } from "@lucide/vue";
import UIButton from "./UIButton.vue";
import UIDialog from "./UIDialog.vue";
import UIIconButton from "./UIIconButton.vue";

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description: string;
    pending?: boolean;
    confirmLabel?: string;
    confirmVariant?: "primary" | "danger";
  }>(),
  { pending: false, confirmLabel: "Delete", confirmVariant: "danger" },
);
defineEmits<{ close: []; confirm: [] }>();
</script>

<template>
  <UIDialog
    :open="open"
    :title="title"
    :description="description"
    width="small"
    :close-disabled="pending"
    @close="$emit('close')"
  >
    <template #close="{ close }">
      <UIIconButton
        accessible-label="Close"
        size="small"
        surface-motion="none"
        :disabled="pending"
        @click="close"
      >
        <template #icon><X /></template>
      </UIIconButton>
    </template>
    <template #footer="{ close }">
      <UIButton :disabled="pending" @click="close">Cancel</UIButton>
      <UIButton :variant="confirmVariant" :pending="pending" @click="$emit('confirm')">
        {{ confirmLabel }}
      </UIButton>
    </template>
  </UIDialog>
</template>
