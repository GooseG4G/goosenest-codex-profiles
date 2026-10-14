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
const isStale = computed(() => {
  if (!windows.value.length) return false;
  const updatedAt = props.updatedAt
    ? new Date(props.updatedAt).getTime()
    : Number.NaN;
  return !Number.isFinite(updatedAt) || now.value - updatedAt > 180_000;
});
const windows = computed<WindowInfo[]>(() =>
  [
    ["primary", "5-hour usage limit"],
    ["secondary", "Weekly usage limit"],
  ].flatMap(([key, label]) => {
    const value = props.usage?.[key];
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const used = Number(row.usedPercent ?? row.used_percent),
      reset = Number(row.resetsAt ?? row.resets_at);
    return Number.isFinite(used)
      ? [{ key, label, used: Math.max(0, Math.min(100, used)), reset }]
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
        <small
          v-else
          class="skeleton skeleton-reset"
          aria-hidden="true"
        />
      </span>
      <span class="track">
        <i
          :class="{ skeleton: isStale }"
          :style="{ width: isStale ? '58%' : `${100 - window.used}%` }"
        />
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
  border: 1px solid #333;
  border-radius: 7px;
  background: #202020;
}
.copy {
  display: grid;
  gap: 4px;
}
.copy strong {
  font-size: 13px;
  font-weight: 600;
}
.copy small,
.remaining {
  color: #aaa;
  font-size: 11px;
}
.track {
  height: 7px;
  overflow: hidden;
  border-radius: 4px;
  background: #3b3b3b;
}
.track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #aaa;
}
.skeleton {
  color: transparent;
  background: linear-gradient(
    100deg,
    #383939 20%,
    #4a4b4b 38%,
    #383939 56%
  );
  background-size: 220% 100%;
  animation: shimmer 1.35s ease-in-out infinite;
}
.skeleton-reset {
  width: 76px;
  height: 11px;
  border-radius: 4px;
}
.skeleton-percent {
  justify-self: end;
  width: 44px;
  height: 11px;
  border-radius: 4px;
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
    background-position-x: -220%;
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
  .skeleton {
    animation: none;
  }
}
</style>
