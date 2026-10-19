<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from "vue";

const props = defineProps<{
  usage?: Record<string, unknown> | null;
  updatedAt?: string | null;
}>();

const now = shallowRef(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  clock = setInterval(() => {
    now.value = Date.now();
  }, 60_000);
});

onBeforeUnmount(() => clearInterval(clock));
interface WindowInfo {
  key: string;
  label: string;
  used: number;
  reset: number;
}
function windowLabel(key: string, duration: number): string {
  if (key === "secondary" && duration === 7 * 24 * 60) return "Weekly usage limit";
  if (duration === 5 * 60) return "5-hour usage limit";
  if (duration === 30 * 24 * 60) return "Monthly usage limit";
  if (duration > 0 && duration % (30 * 24 * 60) === 0)
    return `${duration / (30 * 24 * 60)}-month usage limit`;
  if (duration > 0 && duration % (7 * 24 * 60) === 0)
    return `${duration / (7 * 24 * 60)}-week usage limit`;
  if (duration > 0 && duration % 60 === 0)
    return `${duration / 60}-hour usage limit`;
  return key === "secondary" ? "Secondary usage limit" : "Primary usage limit";
}
const isStale = computed(() => {
  if (!windows.value.length) return false;
  const updatedAt = props.updatedAt
    ? new Date(props.updatedAt).getTime()
    : Number.NaN;
  return !Number.isFinite(updatedAt) || now.value - updatedAt >= 180_000;
});
const windows = computed<WindowInfo[]>(() =>
  [
    ["primary"],
    ["secondary"],
  ].flatMap(([key]) => {
    const value = props.usage?.[key];
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const used = Number(row.usedPercent ?? row.used_percent),
      duration = Number(row.windowDurationMins ?? row.window_duration_minutes),
      reset = Number(row.resetsAt ?? row.resets_at);
    return Number.isFinite(used)
      ? [{ key, label: windowLabel(key, duration), used: Math.max(0, Math.min(100, used)), reset }]
      : [];
  }),
);
function resetLabel(timestamp: number): string {
  if (!timestamp) return "Reset time unavailable";
  const remainingMinutes = Math.max(
    0,
    Math.ceil((timestamp * 1000 - now.value) / 60_000),
  );
  if (remainingMinutes === 0) return "Resets shortly";

  const days = Math.floor(remainingMinutes / 1_440);
  const hours = Math.floor((remainingMinutes % 1_440) / 60);
  const minutes = remainingMinutes % 60;
  const parts = days
    ? [`${days}d`, ...(hours ? [`${hours}h`] : [])]
    : hours
      ? [`${hours}h`, ...(minutes ? [`${minutes}m`] : [])]
      : [`${minutes}m`];

  return `Resets in ${parts.join(" ")}`;
}
</script>
<template>
  <div class="usage-list">
    <section
      v-for="window in windows"
      :key="window.key"
      class="usage-card"
      :class="{ stale: isStale }"
      :aria-label="isStale ? `${window.label}, updating` : undefined"
    >
      <span class="copy">
        <strong>{{ window.label }}</strong>
        <small v-if="!isStale">{{ resetLabel(window.reset) }}</small>
        <small v-else class="skeleton skeleton-reset" aria-hidden="true" />
      </span>
      <span class="track" :class="{ 'is-stale': isStale }">
        <i :style="{ width: `${100 - window.used}%` }" />
      </span>
      <span v-if="!isStale" class="remaining">
        {{ Math.round(100 - window.used) }}% left
      </span>
      <span
        v-else
        class="remaining skeleton skeleton-percent"
        aria-hidden="true"
      />
    </section>
    <section v-if="!windows.length" class="usage-card unavailable">
      <span class="copy">
        <strong>Usage limits</strong>
        <small>Usage will appear after the first request</small>
      </span>
    </section>
  </div>
</template>
<style scoped>
.usage-list {
  display: grid;
  gap: 8px;
}
.usage-card {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) minmax(110px, 150px) 56px;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--color-border-default);
  border-radius: 7px;
  background: var(--color-bg-widget);
}
.copy {
  display: grid;
  gap: 4px;
}
.copy strong {
  font-size: 13px;
  font-weight: 600;
  line-height: 16px;
}
.copy small,
.remaining {
  min-height: 14px;
  color: var(--color-text-usage);
  font-size: 11px;
  line-height: 14px;
}
.track {
  position: relative;
  height: 7px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--color-bg-progress-track);
}
.track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-bg-progress-fill);
  transition: width 560ms var(--ease-out);
}
.track.is-stale i {
  opacity: 0.45;
}
.track.is-stale::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    transparent 12%,
    var(--color-shimmer-strong) 50%,
    transparent 88%
  );
  content: "";
  pointer-events: none;
  transform: translateX(-100%);
  animation: shimmer 1.35s linear infinite;
  will-change: transform;
}
.skeleton {
  position: relative;
  overflow: hidden;
  border-radius: 4px;
  color: transparent;
  background: transparent;
}
.skeleton::before {
  position: absolute;
  inset: 1.5px 0;
  border-radius: 4px;
  background: var(--color-bg-skeleton);
  content: "";
}
.skeleton::after {
  position: absolute;
  inset: 1.5px 0;
  border-radius: 4px;
  background: linear-gradient(
    100deg,
    transparent 20%,
    var(--color-shimmer-subtle) 50%,
    transparent 80%
  );
  content: "";
  transform: translateX(-100%);
  animation: shimmer 1.35s linear infinite;
  will-change: transform;
}
.skeleton-reset {
  width: 76px;
  height: 12px;
}
.skeleton-percent {
  justify-self: end;
  width: 40px;
  height: 12px;
}
.remaining {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.unavailable {
  grid-template-columns: 1fr;
}
@keyframes shimmer {
  to {
    transform: translateX(100%);
  }
}
@media (max-width: 540px) {
  .usage-card {
    grid-template-columns: 1fr 56px;
  }
  .track {
    grid-column: 1/-1;
    grid-row: 2;
  }
  .remaining {
    grid-column: 2;
    grid-row: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .track i {
    transition: none;
  }
  .track.is-stale::after,
  .skeleton::after {
    animation: none;
    transform: none;
  }
}
</style>
