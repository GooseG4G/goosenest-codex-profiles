<script setup lang="ts">
import { computed } from 'vue'
import { useMinuteClock } from '../composables/useMinuteClock'
import { formatRemainingTime } from '../utils/date'
import { formatUsageLimitLabel } from '../utils/usage'
import type { ProfileUsageLimits } from '../types'

const props = defineProps<{
  usage?: ProfileUsageLimits | null
  busy?: boolean
}>()

interface WindowInfo {
  key: 'primary' | 'secondary'
  label: string
  used: number
  reset: number
}

const now = useMinuteClock()

const windows = computed<WindowInfo[]>(() =>
  (['primary', 'secondary'] as const).flatMap((key) => {
    const window = props.usage?.[key]
    if (!window || !Number.isFinite(window.usedPercent)) return []
    return [{
      key,
      label: formatUsageLimitLabel(
        window.windowDurationMins,
        key === 'secondary' ? 'Secondary limit' : 'Primary limit',
      ),
      used: Math.max(0, Math.min(100, window.usedPercent)),
      reset: Number(window.resetsAt ?? 0),
    }]
  }),
)

const isLoading = computed(() => {
  if (windows.value.length) return false
  return Boolean(props.busy || props.usage?.status === 'fetching')
})

const isStale = computed(() => {
  if (!windows.value.length) return false
  if (props.usage?.status === 'stale') return true
  const timestamp = props.usage?.updatedAt ?? props.usage?.fetchedAt
  const updatedAt = timestamp ? new Date(timestamp).getTime() : Number.NaN
  return Number.isFinite(updatedAt) && now.value - updatedAt >= 180_000
})

function resetLabel(timestamp: number): string {
  if (!timestamp) return 'Reset time unavailable'
  const remaining = formatRemainingTime(timestamp * 1000, now.value)
  return remaining ? `Resets in ${remaining}` : 'Resets shortly'
}
</script>

<template>
  <div class="usage-list">
    <section
      v-for="window in windows"
      :key="window.key"
      class="usage-card"
      :class="{ stale: isStale }"
      :aria-label="isStale ? `${window.label}, snapshot is stale` : undefined"
    >
      <span class="usage-copy">
        <strong>{{ window.label }}</strong>
        <small>{{ resetLabel(window.reset) }}</small>
      </span>
      <span class="track" :class="{ 'is-stale': isStale }" aria-hidden="true">
        <i :style="{ width: `${100 - window.used}%` }" />
      </span>
      <span class="remaining">{{ Math.round(100 - window.used) }}% left</span>
    </section>
    <section v-if="!windows.length" class="usage-card unavailable">
      <span class="usage-copy">
        <strong>Usage limits</strong>
        <small>{{ isLoading ? 'Fetching usage limits…' : 'Usage limits unavailable' }}</small>
      </span>
    </section>
  </div>
</template>

<style scoped>
.usage-list { display: grid; gap: 8px; }
.usage-card { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(80px, 140px) 56px; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--color-border-default); border-radius: 7px; background: var(--color-usage-card-background); }
.usage-copy { display: grid; min-width: 0; gap: 4px; }
.usage-copy strong { overflow: hidden; font-size: 13px; font-weight: 600; line-height: 16px; text-overflow: ellipsis; white-space: nowrap; }
.usage-copy small, .remaining { min-height: 14px; color: var(--color-usage-secondary-text); font-size: 11px; line-height: 14px; }
.track { position: relative; height: 7px; overflow: hidden; border-radius: 4px; background: var(--color-bg-progress-track); }
.track i { display: block; height: 100%; border-radius: inherit; background: var(--color-bg-progress-fill); transition: width 560ms var(--ease-out); }
.remaining { text-align: right; font-variant-numeric: tabular-nums; }
.skeleton { position: relative; overflow: hidden; border-radius: 4px; color: transparent; background: transparent; }
.skeleton::before { position: absolute; inset: 1.5px 0; border-radius: inherit; background: var(--color-bg-skeleton); content: ''; }
.skeleton::after { position: absolute; inset: 1.5px 0; border-radius: inherit; background: linear-gradient(100deg, transparent 20%, var(--color-shimmer-subtle) 50%, transparent 80%); content: ''; transform: translateX(-100%); animation: shimmer 1.35s linear infinite; }
.skeleton-reset { width: 76px; height: 12px; }
.skeleton-percent { width: 40px; height: 12px; justify-self: end; }
.unavailable { grid-template-columns: 1fr; }
.reset-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 42px; padding: 8px 14px; border: 1px solid var(--color-border-default); border-radius: 7px; background: var(--color-reset-card-background); }
.reset-card > strong { overflow: hidden; font-size: 13px; font-weight: 600; line-height: 16px; text-overflow: ellipsis; white-space: nowrap; }
.reset-count { min-width: 76px; padding: 4px 9px; border-radius: 999px; color: var(--color-reset-badge-available-foreground, var(--color-text-primary)); font-size: 11px; font-weight: 650; line-height: 14px; text-align: center; background: var(--color-reset-badge-available-background, var(--color-bg-control-hover)); }
.reset-count.empty { color: var(--color-text-secondary); background: var(--color-bg-control-hover); }
.reset-count.skeleton { position: relative; height: 24px; overflow: hidden; padding: 0; background: var(--color-bg-control-hover); }
.reset-count.skeleton::after { position: absolute; inset: 0; background: linear-gradient(100deg, transparent 15%, var(--color-shimmer-subtle) 50%, transparent 85%); content: ''; transform: translateX(-100%); animation: reset-shimmer 1.35s linear infinite; }
@keyframes reset-shimmer { to { transform: translateX(100%); } }
@media (max-width: 420px) {
  .usage-card { grid-template-columns: 1fr 56px; }
  .track { grid-column: 1 / -1; grid-row: 2; }
  .remaining { grid-column: 2; grid-row: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .track i { transition: none; }
  .skeleton::after, .reset-count.skeleton::after { animation: none; transform: none; }
}
</style>
