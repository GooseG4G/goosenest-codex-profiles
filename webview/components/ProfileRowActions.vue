<script setup lang="ts">
import UIIconButton from './ui/UIIconButton.vue'
import TrashIcon from './icons/TrashIcon.vue'
import EditIcon from './icons/EditIcon.vue'

const props = defineProps<{
  kind: 'provider' | 'default'
}>()
const emit = defineEmits<{
  edit: [event: MouseEvent]
  delete: [event: MouseEvent]
}>()
</script>

<template>
  <div class="row-actions" :class="`row-actions--${props.kind}`">
    <UIIconButton v-if="kind === 'provider'" class="row-action-edit" accessible-label="Edit provider" title="Edit provider" background="hover" surface-motion="scale" icon-motion="together" size="small" @click.stop="emit('edit', $event)">
      <template #icon><EditIcon /></template>
    </UIIconButton>
    <span v-if="kind === 'provider'" class="row-action-divider" aria-hidden="true" />
    <UIIconButton class="row-action-delete" accessible-label="Delete profile" title="Delete profile" background="hover" surface-motion="scale" icon-motion="none" size="small" tone="danger" @click.stop="emit('delete', $event)">
      <template #icon><TrashIcon /></template>
    </UIIconButton>
  </div>
</template>

<style scoped>
.row-actions { position: relative; z-index: 2; display: inline-grid; height: 28px; grid-template-columns: 28px; align-items: center; pointer-events: auto; }
.row-actions--provider { width: 76px; grid-template-columns: 28px 1px 28px; gap: 10px; }
.row-action-edit :deep(.icon) { width: 17px; height: 17px; }
.row-action-divider { width: 1px; height: 22px; background: var(--color-border-default); }
</style>
