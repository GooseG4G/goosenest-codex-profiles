<script setup lang="ts">
import { ChevronDown, RefreshCw, Trash2 } from "@lucide/vue";
import type { Profile, UsageResets } from "../../api";
import { useCollapseAnimation } from "../../composables/useCollapseAnimation";
import { formatDateTime } from "../../utils/date";
import UIIconButton from "../ui/UIIconButton.vue";
import UICollectionItem from "../ui/UICollectionItem.vue";
import UIDisclosureItem from "../ui/UIDisclosureItem.vue";
import UIActionItem from "../ui/UIActionItem.vue";
import UICollectionItemIdentity from "../ui/UICollectionItemIdentity.vue";
import UISwitch from "../ui/UISwitch.vue";
import UsageDisplay from "./UsageDisplay.vue";
import UsageResetWidget from "./UsageResetWidget.vue";

const props = defineProps<{
  profile: Profile;
  expanded: boolean;
  planPending: boolean;
  enabledPending: boolean;
  resets?: UsageResets;
  resetPendingId?: string;
}>();

const emit = defineEmits<{
  activate: [];
  delete: [];
  useReset: [resetId: string];
  enabledChange: [enabled: boolean];
}>();

const usageAnimation = useCollapseAnimation();

function needsAuthentication(): boolean {
  return props.profile.auth_status !== "authorized";
}

function planLabel(): string {
  const value = props.profile.plan_type;
  if (typeof value !== "string" || !value.trim()) return "Plan unavailable";
  return value
    .trim()
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function expiryLabel(): string {
  const plan = planLabel();
  if (!props.profile.last_used_at) return plan;
  const lastUsedAt = new Date(props.profile.last_used_at).getTime();
  return Number.isFinite(lastUsedAt)
    ? `${plan}, last used ${formatDateTime(lastUsedAt)}`
    : plan;
}
</script>

<template>
  <UICollectionItem class="profile-item">
    <template #interaction>
      <UIActionItem
        v-if="needsAuthentication()"
        :accessible-label="`Sign in to ${profile.name} again`"
        @activate="emit('activate')"
      />
      <UIDisclosureItem
        v-else
        :accessible-label="`${expanded ? 'Hide' : 'Show'} usage for ${profile.name}`"
        :expanded="expanded"
        :controls="`usage-${profile.profile_id}`"
        @toggle="emit('activate')"
      />
    </template>
      <UICollectionItemIdentity disclosure class="profile-meta">
        <template #disclosure>
          <span class="row-indicator" :class="{ expanded }" aria-hidden="true">
            <RefreshCw v-if="needsAuthentication()" class="reauth-icon" />
            <ChevronDown v-else class="chevron" />
          </span>
        </template>
        <template #status>
          <span
            :class="[
              'dot',
              { off: !profile.enabled, warning: needsAuthentication() },
            ]"
          />
        </template>
        <span class="copy">
          <strong>{{ profile.name }}</strong>
          <small v-if="planPending" class="plan-pending" aria-label="Loading plan" />
          <small v-else>{{ expiryLabel() }}</small>
        </span>
      </UICollectionItemIdentity>
      <template #actions><div class="actions">
        <UISwitch
          :model-value="profile.enabled"
          :accessible-label="`${profile.enabled ? 'Disable' : 'Enable'} ${profile.name}`"
          :tooltip="profile.enabled ? 'Disable' : 'Enable'"
          :pending="enabledPending"
          @change="emit('enabledChange', $event)"
        />
        <i />
        <UIIconButton
          :accessible-label="`Delete ${profile.name}`"
          title="Delete"
          tone="danger"
          size="small"
          surface-motion="none"
          icon-motion="none"
          motion-preset="surface"
          @click="emit('delete')"
        >
          <template #icon><Trash2 /></template>
        </UIIconButton>
      </div></template>
    <template #details><Transition
      :css="false"
      @enter="(element, done) => usageAnimation.animate(element, true, done)"
      @leave="(element, done) => usageAnimation.animate(element, false, done)"
      @enter-cancelled="usageAnimation.cancel"
      @leave-cancelled="usageAnimation.cancel"
    >
      <div
        v-if="!needsAuthentication() && expanded"
        :id="`usage-${profile.profile_id}`"
        class="usage-collapse"
      >
        <div class="usage-wrap">
          <div class="usage-content">
            <UsageDisplay :usage="profile.usage" :updated-at="profile.usage_updated_at" />
            <UsageResetWidget
              :resets="resets"
              :pending-reset-id="resetPendingId"
              @use-reset="emit('useReset', $event)"
            />
          </div>
        </div>
      </div>
    </Transition></template>
  </UICollectionItem>
</template>

<style scoped>
.dot { z-index: 1; width: 10px; height: 10px; border-radius: 50%; background: var(--color-profile-status-active); pointer-events: none; }
.dot.off { background: var(--color-profile-status-inactive); }
.dot.warning { background: var(--color-profile-status-auth-required); }
.profile-meta { z-index: 1; min-width: 0; pointer-events: none; }
.copy { display: grid; min-width: 0; gap: 3px; pointer-events: none; }
.copy strong { overflow: hidden; font-size: 14px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.copy small { position: relative; overflow: hidden; width: fit-content; max-width: 100%; color: var(--color-text-secondary); font-size: 12px; line-height: 16px; }
.copy small.plan-pending { width: min(112px, 40%); height: 16px; border-radius: 4px; background: var(--color-bg-control-hover); }
.copy small.plan-pending::after { position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(105deg, transparent 20%, var(--color-shimmer-light) 50%, transparent 80%); content: ""; transform: translateX(-100%); animation: plan-shimmer 1.25s linear infinite; }
@keyframes plan-shimmer { to { transform: translateX(100%); } }
.actions { z-index: 2; display: grid; grid-template-columns: 40px 1px 28px; align-items: center; gap: 16px; pointer-events: none; }
.actions > :deep(.ui-switch), .actions > :deep(.icon-button) { pointer-events: auto; }
.actions > :deep(.ui-switch) { justify-self: start; }
.actions i { width: 1px; height: 22px; border-left: 1px solid var(--color-border-default); }
.chevron { width: 16px; height: 16px; transition: transform var(--duration-normal) var(--ease-standard); }
.row-indicator { z-index: 1; display: inline-flex; width: 16px; height: 28px; align-items: center; justify-content: center; color: var(--color-profile-disclosure-icon); pointer-events: none; transform-origin: center; transition: color var(--duration-fast) var(--ease-standard); }
.profile-item:hover .row-indicator { color: var(--color-text-primary); }
.profile-item:hover .row-indicator:not(.expanded) .chevron { transform: scale(1.06); }
.profile-item:hover .row-indicator.expanded .chevron { transform: rotate(180deg) scale(1.06); }
.row-indicator.expanded .chevron { transform: rotate(180deg); }
.reauth-icon { width: 17px; height: 17px; animation: profile-reauth-spin 0.9s linear infinite; }
@keyframes profile-reauth-spin { to { transform: rotate(360deg); } }
.usage-collapse { display: grid; grid-template-rows: 1fr; overflow: hidden; opacity: 1; }
.usage-wrap { min-height: 0; overflow: hidden; transition: background-color var(--duration-fast) var(--ease-standard); }
.usage-content { display: grid; align-items: start; gap: 8px; padding: 0 12px 12px; }
@media (prefers-reduced-motion: reduce) { .chevron, .usage-wrap, .copy small.plan-pending::after { animation: none; transform: none; } }
</style>
