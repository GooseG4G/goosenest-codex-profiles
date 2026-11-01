<script setup lang="ts">
import { computed } from 'vue'
import { Pencil } from '@lucide/vue'
import type { Profile } from '../types'
import UIIconButton from './ui/UIIconButton.vue'

const props = defineProps<{
  profile: Profile
}>()

const emit = defineEmits<{
  edit: [event: MouseEvent]
}>()

const transportLabel = computed(() =>
  props.profile.transport === 'websocket' ? 'WebSocket' : 'HTTP/SSE',
)
</script>

<template>
  <section class="provider-details" aria-label="Provider details">
    <div class="provider-copy">
      <strong class="provider-endpoint">{{ profile.baseUrl || 'Not configured' }}</strong>
      <small class="provider-transport">{{ transportLabel }}</small>
    </div>
    <UIIconButton
      class="provider-edit"
      accessible-label="Edit provider"
      title="Edit provider"
      background="hover"
      surface-motion="scale"
      icon-motion="none"
      size="small"
      @click="emit('edit', $event)"
    >
      <template #icon><Pencil /></template>
    </UIIconButton>
  </section>
</template>

<style scoped>
.provider-details {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--color-border-default);
  border-radius: 7px;
  background: var(--color-usage-card-background);
}
.provider-copy { display: grid; min-width: 0; gap: 4px; }
.provider-endpoint { color: var(--color-text-primary); font-size: 13px; font-weight: 600; line-height: 17px; overflow-wrap: anywhere; }
.provider-transport { color: var(--color-usage-secondary-text); font-size: 11px; line-height: 14px; }
.provider-edit :deep(.icon) { width: 17px; height: 17px; }
</style>
