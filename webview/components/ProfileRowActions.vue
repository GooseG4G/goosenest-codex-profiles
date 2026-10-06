<script setup lang="ts">
import UIIconButton from './ui/UIIconButton.vue'
import TrashIcon from './icons/TrashIcon.vue'
import EditIcon from './icons/EditIcon.vue'
import ChevronIcon from './icons/ChevronIcon.vue'

const props = defineProps<{
  kind: 'provider' | 'default'
  canShowUsage: boolean
  usageExpanded: boolean
}>()
const emit = defineEmits<{
  edit: [event: MouseEvent]
  delete: [event: MouseEvent]
  toggleUsage: [event: MouseEvent]
}>()
</script>

<template>
  <div class="row-actions" :class="`row-actions--${props.kind}`">
    <UIIconButton v-if="kind === 'provider'" class="row-action-edit" accessible-label="Edit provider" title="Edit provider" background="hover" surface-motion="scale" icon-motion="together" size="small" @click.stop="emit('edit', $event)">
      <template #icon><EditIcon /></template>
    </UIIconButton>
    <UIIconButton class="row-action-delete" accessible-label="Delete profile" background="hover" surface-motion="scale" icon-motion="none" size="small" tone="danger" @click.stop="emit('delete', $event)">
      <template #icon><TrashIcon /></template>
    </UIIconButton>
    <span class="row-action-divider" aria-hidden="true" />
    <UIIconButton v-if="kind !== 'provider'" class="row-action-usage" :accessible-label="canShowUsage ? (usageExpanded ? 'Hide usage limits' : 'Show usage limits') : 'Action unavailable'" :title="canShowUsage ? (usageExpanded ? 'Hide' : 'Show') : 'Action unavailable'" :disabled="!canShowUsage" background="hover" surface-motion="scale" icon-motion="together" size="small" @click.stop="emit('toggleUsage', $event)">
      <template #icon><ChevronIcon :expanded="usageExpanded" /></template>
    </UIIconButton>
  </div>
</template>

<style scoped>
.row-actions { position: relative; z-index: 1; display: grid; width: 68px; height: 28px; align-self: center; grid-template-columns: 28px 12px 28px; grid-template-rows: 28px; align-items: center; justify-items: center; }
.row-action-edit, .row-action-usage { grid-column: 1; grid-row: 1; }
.row-action-delete { grid-column: 3; grid-row: 1; }
.row-action-edit :deep(.icon), .row-action-usage :deep(.icon) { width: 17px; height: 17px; }
.row-action-divider { grid-column: 2; grid-row: 1; width: 1px; height: 16px; background: var(--vscode-widget-border); }
</style>
