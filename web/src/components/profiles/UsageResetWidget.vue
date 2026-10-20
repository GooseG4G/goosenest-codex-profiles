<script setup lang="ts">
import { ChevronDown } from "@lucide/vue";
import {
  computed,
  shallowRef,
  useId,
  watch,
} from "vue";
import type { UsageResetCredit, UsageResets } from "../../api";
import { useEscapeLayer } from "../../composables/useEscapeLayer";
import { useMinuteClock } from "../../composables/useMinuteClock";
import UIButton from "../ui/UIButton.vue";
import UIConfirmDialog from "../ui/UIConfirmDialog.vue";

const props = defineProps<{
  resets?: UsageResets;
  pendingResetId?: string;
}>();
const emit = defineEmits<{ useReset: [resetId: string] }>();
const expanded = shallowRef(false);
const requestedReset = shallowRef<UsageResetCredit>();
const now = useMinuteClock();
const creditsId = useId();

const available = computed(() =>
  (props.resets?.credits ?? []).filter(
    (credit) => credit.status === "available",
  ),
);
const count = computed(() =>
  Math.max(props.resets?.available_count ?? 0, available.value.length),
);
const hasAvailable = computed(() => count.value > 0);
const isStale = computed(() => {
  if (!props.resets) return true;
  const updatedAt = props.resets.updated_at
    ? new Date(props.resets.updated_at).getTime()
    : Number.NaN;
  return (
    props.resets.stale ||
    !Number.isFinite(updatedAt) ||
    now.value - updatedAt >= 180_000
  );
});
const canExpand = computed(() => hasAvailable.value && !isStale.value);
watch(canExpand, (value) => {
  if (!value) expanded.value = false;
});
useEscapeLayer(
  () => expanded.value,
  () => {
    expanded.value = false;
  },
);

function title(credit: UsageResetCredit): string {
  return credit.title?.trim() || "Full reset (Weekly + 5 hr)";
}
function expiry(credit: UsageResetCredit): string {
  if (!credit.expires_at) return credit.description?.trim() || "No expiry date";
  const value = new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(credit.expires_at * 1000);
  return `Expires ${value}`;
}
function confirmReset() {
  if (!requestedReset.value) return;
  emit("useReset", requestedReset.value.reset_id);
  requestedReset.value = undefined;
}
function toggleExpanded(event: MouseEvent) {
  if (!canExpand.value) return;
  const target = event.target;
  if (target instanceof Element && target.closest(".ui-button")) return;
  expanded.value = !expanded.value;
}
</script>

<template>
  <section
    class="reset-widget"
    :class="{ 'reset-widget-inert': !canExpand }"
    @click="toggleExpanded"
  >
    <button
      class="reset-summary"
      type="button"
      :aria-expanded="canExpand ? expanded : false"
      :aria-controls="creditsId"
      :aria-label="
        canExpand
          ? 'Usage limit resets'
          : isStale
            ? 'Loading usage limit resets'
          : 'No usage limit resets available'
      "
      :disabled="!canExpand"
      @mousedown.prevent
    >
      <strong>Usage limit resets</strong>
      <span :class="['available', { 'is-stale': isStale }]">
        {{ count }} available
      </span>
      <ChevronDown
        :class="['chevron', { expanded }]"
        aria-hidden="true"
      />
    </button>
    <Transition name="credits">
      <div v-if="expanded && canExpand" :id="creditsId" class="credits">
        <div class="credits-clip">
          <div class="credits-list">
            <article
              v-for="credit in available"
              :key="credit.reset_id"
              class="credit"
            >
              <span class="credit-copy">
                <strong>{{ title(credit) }}</strong>
                <small>{{ expiry(credit) }}</small>
              </span>
              <UIButton
                variant="secondary"
                size="small"
                :disabled="Boolean(pendingResetId)"
                @click="requestedReset = credit"
              >
                {{
                  pendingResetId === credit.reset_id ? "Using…" : "Use reset"
                }}
              </UIButton>
            </article>
          </div>
        </div>
      </div>
    </Transition>
  </section>
  <UIConfirmDialog
    :open="Boolean(requestedReset)"
    title="Use usage reset?"
    :description="`This will consume “${requestedReset ? title(requestedReset) : 'usage reset'}”. This action cannot be undone.`"
    confirm-label="Use reset"
    confirm-variant="primary"
    @close="requestedReset = undefined"
    @confirm="confirmReset"
  />
</template>

<style scoped>
.reset-widget {
  --reset-action-width: 84px;
  align-self: start;
  overflow: hidden;
  border: 1px solid var(--color-border-default);
  border-radius: 7px;
  background: var(--color-reset-card-background);
  transition: background-color var(--duration-fast) var(--ease-standard);
}
.reset-widget:not(.reset-widget-inert):hover {
  background: var(--color-reset-card-hover-background);
}
.reset-widget:not(.reset-widget-inert) {
  cursor: pointer;
}
.reset-widget :deep(.ui-button) {
  cursor: pointer;
}
.reset-summary {
  width: 100%;
  height: 50px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--reset-action-width) 18px;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border: 0;
  color: var(--color-text-primary);
  text-align: left;
  background: transparent;
}
.reset-summary:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px var(--color-focus);
}
.reset-summary strong,
.credit-copy strong {
  font-size: 13px;
  font-weight: 600;
  line-height: 16px;
}
.available {
  position: relative;
  justify-self: stretch;
  overflow: hidden;
  min-height: 24px;
  padding: 4px 9px;
  border-radius: 999px;
  color: var(--color-reset-badge-available-foreground);
  font-size: 11px;
  font-weight: 650;
  line-height: 14px;
  text-align: center;
  background: var(--color-reset-badge-available-background);
}
.available.is-stale::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    transparent 15%,
    var(--color-reset-badge-shimmer) 50%,
    transparent 85%
  );
  content: "";
  pointer-events: none;
  transform: translateX(-100%);
  animation: available-shimmer 1.35s linear infinite;
  will-change: transform;
}
.reset-widget-inert .available {
  color: var(--color-text-secondary);
  background: var(--color-bg-control-hover);
}
.available.is-stale {
  color: transparent;
}
.reset-summary:disabled {
  cursor: default;
}
.reset-summary:disabled .chevron {
  opacity: 0.45;
}
.chevron {
  width: 16px;
  height: 16px;
  color: var(--color-text-secondary);
  transition:
    color var(--duration-fast) var(--ease-standard),
    transform var(--duration-normal) var(--ease-standard);
}
.reset-widget:not(.reset-widget-inert):hover .chevron {
  color: var(--color-text-primary);
  transform: scale(1.06);
}
.reset-widget:not(.reset-widget-inert):hover .chevron.expanded {
  transform: rotate(180deg) scale(1.06);
}
.reset-widget:not(.reset-widget-inert):active .chevron {
  color: var(--color-text-primary);
  transform: scale(0.96);
}
.reset-widget:not(.reset-widget-inert):active .chevron.expanded {
  transform: rotate(180deg) scale(0.96);
}
.chevron.expanded {
  transform: rotate(180deg);
}
.credits {
  display: grid;
  grid-template-rows: 1fr;
  opacity: 1;
}
.credits-clip {
  min-height: 0;
  overflow: hidden;
}
.credits-list {
  display: grid;
}
.credit {
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 14px;
}
.credit :deep(.ui-button) {
  flex: 0 0 auto;
  height: 30px;
  border-color: var(--color-reset-action-border);
  border-radius: 999px;
  color: var(--color-reset-action-foreground);
  background: var(--color-reset-action-background);
}
.credit :deep(.ui-button:hover:not(:disabled)) {
  border-color: var(--color-reset-action-hover-border);
  background: var(--color-reset-action-hover-background);
}
.credit-copy {
  display: grid;
  min-width: 0;
  gap: 5px;
}
.credit-copy small {
  color: var(--color-usage-secondary-text);
  font-size: 11px;
  line-height: 14px;
}
.credits-enter-active,
.credits-leave-active {
  transition:
    grid-template-rows var(--duration-slow) var(--ease-out),
    opacity var(--duration-normal) var(--ease-standard);
}
.credits-enter-from,
.credits-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}
@keyframes available-shimmer {
  to {
    transform: translateX(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .chevron,
  .credits-enter-active,
  .credits-leave-active {
    transition: none;
  }
  .available.is-stale::after {
    animation: none;
    transform: none;
  }
}
</style>
