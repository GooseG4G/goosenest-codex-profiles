<script setup lang="ts">
import { ChevronDown } from "@lucide/vue";
import { computed, shallowRef, useId } from "vue";
import type { UsageResetCredit, UsageResets } from "../../api";
import { useEscapeLayer } from "../../composables/useEscapeLayer";
import UIButton from "../ui/UIButton.vue";
import UIConfirmDialog from "../ui/UIConfirmDialog.vue";

const props = defineProps<{
  resets?: UsageResets;
  pendingResetId?: string;
}>();
const emit = defineEmits<{ useReset: [resetId: string] }>();
const expanded = shallowRef(false);
const requestedReset = shallowRef<UsageResetCredit>();
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
</script>

<template>
  <section class="reset-widget" :class="{ 'reset-widget-empty': !hasAvailable }">
    <button
      v-if="hasAvailable"
      class="reset-summary"
      type="button"
      :aria-expanded="expanded"
      :aria-controls="creditsId"
      @mousedown.prevent
      @click="expanded = !expanded"
    >
      <strong>Usage limit resets</strong>
      <span class="available">{{ count }} available</span>
      <ChevronDown
        v-if="count > 0"
        :class="['chevron', { expanded }]"
        aria-hidden="true"
      />
    </button>
    <div v-else class="reset-summary" aria-label="No usage limit resets available">
      <strong>Usage limit resets</strong>
      <span class="available">0 available</span>
    </div>
    <Transition name="credits">
      <div
        v-if="expanded && hasAvailable"
        :id="creditsId"
        class="credits"
      >
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
                {{ pendingResetId === credit.reset_id ? "Using…" : "Use reset" }}
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
  --reset-action-width: 80px;
  align-self: start;
  overflow: hidden;
  border: 1px solid var(--color-border-default);
  border-radius: 7px;
  background: var(--color-bg-widget);
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
.reset-summary:hover {
  background: var(--color-bg-row-hover);
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
  justify-self: stretch;
  padding: 4px 9px;
  border-radius: 999px;
  color: #d9ffe7;
  font-size: 11px;
  font-weight: 650;
  line-height: 14px;
  text-align: center;
  background: #086b31;
}
.reset-widget-empty .reset-summary {
  grid-template-columns: minmax(0, 1fr) auto;
}
.reset-widget-empty .available {
  color: var(--color-text-secondary);
  background: var(--color-bg-control-hover);
}
.reset-widget-empty .reset-summary:hover {
  background: transparent;
}
.chevron {
  width: 16px;
  height: 16px;
  color: var(--color-text-secondary);
  transition: transform var(--duration-normal) var(--ease-standard);
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
  border-top: 1px solid var(--color-border-default);
}
.credit {
  min-height: 60px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--reset-action-width) 18px;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
}
.credit .ui-button {
  grid-column: 2 / 4;
  width: 100%;
}
.credit + .credit {
  border-top: 1px solid var(--color-border-default);
}
.credit-copy {
  display: grid;
  gap: 5px;
}
.credit-copy small {
  color: var(--color-text-usage);
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
@media (prefers-reduced-motion: reduce) {
  .chevron,
  .credits-enter-active,
  .credits-leave-active {
    transition: none;
  }
}
</style>
