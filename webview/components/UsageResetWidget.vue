<script setup lang="ts">
import { computed, shallowRef, useId, watch } from 'vue'
import type { UsageResetCredit } from '../types'
import UIConfirmDialog from './ui/UIConfirmDialog.vue'
import UIChevronIcon from './ui/UIChevronIcon.vue'
import UILineButton from './ui/UILineButton.vue'

const props = defineProps<{ credits?: readonly UsageResetCredit[]; stale?: boolean; pendingId?: string | null }>()
const emit = defineEmits<{ useReset: [id: string] }>()
const requested = shallowRef<UsageResetCredit | null>(null)
const expanded = shallowRef(false)
const creditsId = useId()
const available = computed(() => (props.credits ?? []).filter((credit) => credit.status === 'available'))
const hasAvailable = computed(() => available.value.length > 0)
const canExpand = computed(() => hasAvailable.value && (!props.stale || Boolean(props.pendingId)))
watch(canExpand, (value) => { if (!value) expanded.value = false })
function title(credit: UsageResetCredit) { return credit.title?.trim() || 'Full reset (Weekly + 5 hr)' }
function expiry(credit: UsageResetCredit) {
  if (!credit.expiresAt) return credit.description?.trim() || 'No expiry date'
  return `Expires ${new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(credit.expiresAt * 1000)}`
}
function confirmReset() {
  if (!requested.value || props.pendingId) return
  emit('useReset', requested.value.id)
  requested.value = null
}
</script>

<template>
  <section class="reset-widget" :class="{ empty: !hasAvailable, inert: !canExpand }">
    <button class="reset-summary" type="button" :disabled="!canExpand" :aria-expanded="canExpand ? expanded : false" :aria-controls="creditsId" @click="expanded = !expanded">
      <strong>Usage limit resets</strong>
      <span v-if="!stale || pendingId" class="available">{{ available.length }} available</span>
      <span v-else class="available-skeleton" aria-label="Loading usage limit resets" />
      <UIChevronIcon :expanded="expanded" />
    </button>
    <div v-if="expanded && canExpand" :id="creditsId" class="reset-list">
      <article v-for="credit in available" :key="credit.id" class="reset-item">
        <span class="reset-copy"><strong>{{ title(credit) }}</strong><small>{{ expiry(credit) }}</small></span>
        <UILineButton
          class="reset-action"
          variant="secondary"
          size="small"
          :disabled="Boolean(pendingId)"
          @click.stop="requested = credit"
        >
          {{ pendingId === credit.id ? 'Using…' : 'Use reset' }}
        </UILineButton>
      </article>
    </div>
  </section>
  <UIConfirmDialog
    :open="Boolean(requested)"
    title="Use usage reset?"
    :description="`This will consume “${requested ? title(requested) : 'usage reset'}”. This action cannot be undone.`"
    confirm-label="Use reset"
    @close="requested = null"
    @confirm="confirmReset"
  />
</template>

<style scoped>
.reset-widget { display: grid; overflow: hidden; border: 1px solid var(--color-border-default); border-radius: 7px; background: var(--color-reset-card-background); transition: background-color var(--duration-fast) var(--ease-standard); }
.reset-widget:not(.inert) { cursor: pointer; }
.reset-widget.empty { color: var(--color-text-secondary); }
.reset-summary { display: grid; grid-template-columns: minmax(0, 1fr) 84px 18px; align-items: center; gap: 10px; width: 100%; height: 50px; padding: 8px 14px; border: 0; outline: none; color: var(--color-text-primary); text-align: left; background: transparent; }
.reset-summary:focus-visible { box-shadow: inset 0 0 0 1px var(--color-focus); }
.reset-summary:disabled { cursor: default; }
.reset-summary strong, .reset-item strong { font-size: 13px; font-weight: 600; }
.available, .available-skeleton { justify-self: stretch; min-height: 24px; padding: 4px 9px; border-radius: 999px; }
.available { color: var(--color-reset-badge-available-foreground, var(--color-text-primary)); font-size: 11px; font-weight: 650; line-height: 14px; text-align: center; background: var(--color-reset-badge-available-background, var(--color-bg-control-hover)); }
.available-skeleton { position: relative; overflow: hidden; background: var(--color-bg-control-hover); }
.available-skeleton::after { position: absolute; inset: 0; background: linear-gradient(100deg, transparent 15%, var(--color-shimmer-subtle) 50%, transparent 85%); content: ''; transform: translateX(-100%); animation: shimmer 1.35s linear infinite; }
.reset-list { display: grid; overflow: hidden; }
.reset-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 60px; padding: 8px 14px; }
.reset-item span { display: grid; gap: 2px; }
.reset-item small { color: var(--color-text-secondary); font-size: 11px; }
.reset-item :deep(.reset-action) { --button-background: var(--color-reset-action-background, var(--color-button-secondary-background)); --button-border: var(--color-reset-action-border, var(--color-button-secondary-border)); --button-hover-background: var(--color-reset-action-hover-background, var(--color-button-secondary-hover-background)); --button-hover-border: var(--color-reset-action-hover-border, var(--color-button-secondary-hover-border)); --button-pressed-background: var(--color-reset-action-hover-background, var(--color-button-secondary-pressed-background)); flex: 0 0 auto; color: var(--color-reset-action-foreground, var(--color-text-primary)); }
@keyframes shimmer { to { transform: translateX(100%); } }
@media (hover: hover) and (pointer: fine) {
  .reset-widget:not(.inert):hover { background: var(--color-reset-card-hover-background, var(--color-reset-card-background)); }
}
</style>
