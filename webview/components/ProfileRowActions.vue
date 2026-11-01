<script setup lang="ts">
import UIIconButton from './ui/UIIconButton.vue'
import UITrashButton from './ui/UITrashButton.vue'
import { ArrowLeftRight } from '@lucide/vue'

const props = defineProps<{
  active: boolean
}>()
const emit = defineEmits<{
  activate: [event: MouseEvent]
  delete: [event: MouseEvent]
}>()
</script>

<template>
  <div class="row-actions">
    <span class="row-action-slot">
      <UIIconButton class="row-action-activate" :accessible-label="active ? 'Current profile' : 'Use profile'" :title="active ? 'Current profile' : 'Use profile'" size="small" :disabled="active" @click.stop="emit('activate', $event)">
        <template #icon><ArrowLeftRight /></template>
      </UIIconButton>
    </span>
    <span class="row-action-divider" aria-hidden="true" />
    <UITrashButton class="row-action-delete" accessible-label="Delete profile" title="Delete profile" @click.stop="emit('delete', $event)" />
  </div>
</template>

<style scoped>
.row-actions { position: relative; z-index: 2; display: inline-grid; height: 28px; grid-template-columns: 28px 1px 28px; align-items: center; gap: 10px; pointer-events: auto; }
.row-action-slot { display: inline-flex; width: 28px; height: 28px; }
.row-action-activate :deep(.icon) { width: 17px; height: 17px; }
.row-action-divider { width: 1px; height: 22px; background: var(--color-border-default); }
</style>
