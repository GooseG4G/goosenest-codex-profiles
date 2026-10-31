<script setup lang="ts">
import UIIconButton from './ui/UIIconButton.vue'
import { ArrowLeftRight, Pencil, Trash2 } from '@lucide/vue'

const props = defineProps<{
  kind: 'provider' | 'default'
  active: boolean
}>()
const emit = defineEmits<{
  activate: [event: MouseEvent]
  edit: [event: MouseEvent]
  delete: [event: MouseEvent]
}>()
</script>

<template>
  <div class="row-actions" :class="`row-actions--${props.kind}`">
    <span v-if="kind === 'default'" class="row-action-slot">
      <UIIconButton v-if="!active" class="row-action-activate" accessible-label="Use profile" title="Use profile" background="hover" surface-motion="scale" icon-motion="together" size="small" @click.stop="emit('activate', $event)">
        <template #icon><ArrowLeftRight /></template>
      </UIIconButton>
    </span>
    <UIIconButton v-else class="row-action-edit" accessible-label="Edit provider" title="Edit provider" background="hover" surface-motion="scale" icon-motion="together" size="small" @click.stop="emit('edit', $event)">
      <template #icon><Pencil /></template>
    </UIIconButton>
    <span class="row-action-divider" aria-hidden="true" />
    <UIIconButton class="row-action-delete" accessible-label="Delete profile" title="Delete profile" background="hover" surface-motion="scale" icon-motion="none" size="small" tone="danger" @click.stop="emit('delete', $event)">
      <template #icon><Trash2 /></template>
    </UIIconButton>
  </div>
</template>

<style scoped>
.row-actions { position: relative; z-index: 2; display: inline-grid; height: 28px; grid-template-columns: 28px 1px 28px; align-items: center; gap: 10px; pointer-events: auto; }
.row-action-slot { display: inline-flex; width: 28px; height: 28px; }
.row-action-activate :deep(.icon) { width: 17px; height: 17px; }
.row-action-edit :deep(.icon) { width: 17px; height: 17px; }
.row-action-divider { width: 1px; height: 22px; background: var(--color-border-default); }
</style>
