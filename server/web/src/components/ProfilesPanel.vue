<script setup lang="ts">
import { ChevronDown, RefreshCw, Trash2, UserRoundPlus } from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from "vue";
import type { Profile, UsageResets } from "../api";
import { useEscapeLayer } from "../composables/useEscapeLayer";
import { useRouteQuery } from "../composables/useRouteQuery";
import { formatDateTime } from "../utils/date";
import UsageDisplay from "./profiles/UsageDisplay.vue";
import UsageResetWidget from "./profiles/UsageResetWidget.vue";
import UIIconButton from "./ui/UIIconButton.vue";
import UISearchField from "./ui/UISearchField.vue";
import UISwitch from "./ui/UISwitch.vue";
const props = defineProps<{
  items: readonly Profile[];
  planPendingProfileIds: ReadonlySet<string>;
  resetsByProfileId: Readonly<Record<string, UsageResets | undefined>>;
  busy: boolean;
  resetPending?: string;
  enabledPendingProfileIds: ReadonlySet<string>;
}>();
const query = useRouteQuery();
const visible = computed(() => {
  const value = query.value.trim().toLocaleLowerCase();
  return value
    ? props.items.filter((profile) =>
        profile.name.toLocaleLowerCase().includes(value),
      )
    : props.items;
});
const emit = defineEmits<{
  startAuth: [];
  reauthorize: [profileId: string];
  delete: [profileId: string];
  hotProfileChange: [profileId?: string];
  useReset: [profileId: string, resetId: string];
  enabledChange: [profileId: string, enabled: boolean];
}>();
const expanded = shallowRef<string>();
const now = shallowRef(Date.now());
const planShimmerIds = shallowRef(new Set<string>());
const planShimmerTimers = new Map<string, ReturnType<typeof setTimeout>>();
let clock: ReturnType<typeof setInterval> | undefined;
useEscapeLayer(
  () => Boolean(expanded.value),
  () => {
    expanded.value = undefined;
    emit("hotProfileChange", undefined);
  },
);

function planLabel(profile: Profile): string {
  const value = profile.plan_type;
  if (typeof value !== "string" || !value.trim()) return "Plan unavailable";
  return value
    .trim()
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
function planPending(profile: Profile): boolean {
  return planShimmerIds.value.has(profile.profile_id);
}
function expiryLabel(profile: Profile): string {
  const plan = planLabel(profile);
  if (!profile.subscription_expires_at) {
    if (!profile.last_used_at) return plan;
    const lastUsedAt = new Date(profile.last_used_at).getTime();
    return Number.isFinite(lastUsedAt)
      ? `${plan}, last used ${formatDateTime(lastUsedAt)}`
      : plan;
  }
  const expiresAt = new Date(profile.subscription_expires_at).getTime();
  if (!Number.isFinite(expiresAt)) return plan;
  const remainingMinutes = Math.ceil((expiresAt - now.value) / 60_000);
  if (remainingMinutes <= 0) return `${plan}, expired`;
  const days = Math.floor(remainingMinutes / 1_440);
  const hours = Math.floor((remainingMinutes % 1_440) / 60);
  const minutes = remainingMinutes % 60;
  const duration = days
    ? `${days}d${hours ? ` ${hours}h` : ""}`
    : hours
      ? `${hours}h${minutes ? ` ${minutes}m` : ""}`
      : `${minutes}m`;
  return `${plan}, expires in ${duration}`;
}
function toggle(profile: Profile) {
  expanded.value =
    expanded.value === profile.profile_id ? undefined : profile.profile_id;
  emit("hotProfileChange", expanded.value);
}
function needsAuthentication(profile: Profile): boolean {
  return profile.auth_status !== "authorized";
}
function activate(profile: Profile) {
  if (needsAuthentication(profile)) {
    emit("reauthorize", profile.profile_id);
    return;
  }
  toggle(profile);
}
onMounted(() => {
  clock = setInterval(() => {
    now.value = Date.now();
  }, 60_000);
});
watch(
  () => ({
    pendingIds: props.planPendingProfileIds,
    plans: props.items.map((profile) => [profile.profile_id, profile.plan_type]),
  }),
  ({ pendingIds }) => {
    for (const profile of props.items) {
      const id = profile.profile_id;
      const hasPlan = Boolean(profile.plan_type?.trim());
      if (hasPlan) {
        const timer = planShimmerTimers.get(id);
        if (timer) {
          clearTimeout(timer);
          planShimmerTimers.delete(id);
        }
        if (planShimmerIds.value.has(id)) {
          const next = new Set(planShimmerIds.value);
          next.delete(id);
          planShimmerIds.value = next;
        }
      } else if (pendingIds.has(id)) {
        planShimmerIds.value = new Set(planShimmerIds.value).add(id);
      } else if (!pendingIds.has(id) && planShimmerIds.value.has(id) && !planShimmerTimers.has(id)) {
        const timer = setTimeout(() => {
          const next = new Set(planShimmerIds.value);
          next.delete(id);
          planShimmerIds.value = next;
          planShimmerTimers.delete(id);
        }, 1250);
        planShimmerTimers.set(id, timer);
      }
    }
  },
  { immediate: true, deep: true },
);
onBeforeUnmount(() => {
  clearInterval(clock);
  for (const timer of planShimmerTimers.values()) clearTimeout(timer);
  planShimmerTimers.clear();
  emit("hotProfileChange", undefined);
});
</script>
<template>
  <section class="profiles-panel">
    <div class="toolbar">
      <UISearchField
        v-model="query"
        accessible-label="Search profiles"
        placeholder="Search profiles..."
      /><UIIconButton
        accessible-label="Add profile"
        background="always"
        :disabled="busy"
        @click="emit('startAuth')"
        ><template #icon><UserRoundPlus /></template
      ></UIIconButton>
    </div>
    <div class="table-card">
      <div class="list-header">
        Profile
      </div>
      <div v-if="!visible.length" class="profiles-empty">No profiles found</div>
      <article
        v-for="profile in visible"
        :key="profile.profile_id"
        class="profile-item"
      >
        <div class="profile-row">
          <button
            class="row-hit"
            :aria-label="
              needsAuthentication(profile)
                ? `Sign in to ${profile.name} again`
                : `${expanded === profile.profile_id ? 'Hide' : 'Show'} usage for ${profile.name}`
            "
            :aria-expanded="
              needsAuthentication(profile)
                ? undefined
                : expanded === profile.profile_id
            "
            :aria-controls="
              needsAuthentication(profile)
                ? undefined
                : `usage-${profile.profile_id}`
            "
            @mousedown.prevent
            @click="activate(profile)"
          /><span
            :class="[
              'dot',
              {
                off: !profile.enabled,
                warning: needsAuthentication(profile),
              },
            ]"
          /><span
            class="copy"
            ><strong>{{ profile.name }}</strong
            ><small
              v-if="planPending(profile)"
              class="plan-pending"
              aria-label="Loading plan"
            /><small v-else>{{ expiryLabel(profile) }}</small></span
          >
          <div class="actions">
            <span
              class="row-indicator"
              :class="{ expanded: expanded === profile.profile_id }"
              aria-hidden="true"
            ><RefreshCw v-if="needsAuthentication(profile)" class="reauth-icon" /><ChevronDown
                v-else
                class="chevron"
              /></span
            ><UISwitch
              :model-value="profile.enabled"
              :accessible-label="`${profile.enabled ? 'Disable' : 'Enable'} ${profile.name}`"
              :tooltip="profile.enabled ? 'Disable' : 'Enable'"
              :pending="enabledPendingProfileIds.has(profile.profile_id)"
              @change="emit('enabledChange', profile.profile_id, $event)"
            /><i /><UIIconButton
              :accessible-label="`Delete ${profile.name}`"
              title="Delete"
              tone="danger"
              size="small"
              surface-motion="none"
              icon-motion="none"
              motion-preset="surface"
              @click="emit('delete', profile.profile_id)"
              ><template #icon><Trash2 /></template
            ></UIIconButton>
          </div>
        </div>
        <Transition name="usage"
          ><div
            v-if="
              !needsAuthentication(profile) &&
              expanded === profile.profile_id
            "
            :id="`usage-${profile.profile_id}`"
            class="usage-collapse"
          >
            <div class="usage-wrap">
              <div class="usage-content">
                <UsageDisplay
                  :usage="profile.usage"
                  :updated-at="profile.usage_updated_at"
                />
                <UsageResetWidget
                  :resets="props.resetsByProfileId[profile.profile_id]"
                  :pending-reset-id="
                    props.resetPending?.startsWith(`${profile.profile_id}:`)
                      ? props.resetPending.slice(profile.profile_id.length + 1)
                      : undefined
                  "
                  @use-reset="emit('useReset', profile.profile_id, $event)"
                />
              </div>
            </div></div
        ></Transition>
      </article>
    </div>
  </section>
</template>
<style scoped>
.profiles-panel {
  width: min(620px, 100%);
  display: grid;
  align-content: start;
  gap: 12px;
}
.toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 46px;
  gap: 12px;
}
.table-card {
  overflow: hidden;
  border: 1px solid var(--color-border-default);
  border-radius: 7px;
  background: var(--color-bg-sunken);
}
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 14px;
  color: var(--color-text-secondary);
  font-size: 12px;
  border-bottom: 1px solid var(--color-border-default);
  background: var(--color-bg-table-header);
}
.profile-item + .profile-item {
  border-top: 1px solid var(--color-border-default);
}
.profile-row {
  position: relative;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
  min-height: 68px;
  padding: 11px 15px;
  transition: background-color var(--duration-fast) var(--ease-standard);
}
.profile-row:has(.row-hit:hover) {
  background: var(--color-bg-row-hover);
}
.profile-row:has(.actions:hover) {
  background: var(--color-bg-row-hover);
}
.profile-item:has(.row-hit:hover) .usage-wrap {
  background: var(--color-bg-row-hover);
}
.profile-item:has(.actions:hover) .usage-wrap {
  background: var(--color-bg-row-hover);
}
.row-hit {
  position: absolute;
  inset: 0;
  z-index: 0;
  border: 0;
  background: transparent;
}
.row-hit:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-focus) 76%, transparent);
}
.dot {
  z-index: 1;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--color-success);
  pointer-events: none;
}
.dot.off {
  background: var(--color-status-inactive);
}
.dot.warning {
  background: var(--color-status-warning);
}
.copy {
  z-index: 1;
  display: grid;
  min-width: 0;
  gap: 3px;
  pointer-events: none;
}
.copy strong {
  overflow: hidden;
  font-size: 14px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy small {
  position: relative;
  overflow: hidden;
  width: fit-content;
  max-width: 100%;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 16px;
}
.copy small.plan-pending {
  width: min(112px, 40%);
  height: 16px;
  border-radius: 4px;
  background: var(--color-bg-control-hover);
}
.copy small.plan-pending::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 20%,
    var(--color-shimmer-light) 50%,
    transparent 80%
  );
  content: "";
  border-radius: inherit;
  transform: translateX(-100%);
  animation: plan-shimmer 1.25s linear infinite;
}
@keyframes plan-shimmer {
  to {
    transform: translateX(100%);
  }
}
.actions {
  z-index: 2;
  display: grid;
  grid-template-columns: 28px 40px 1px 28px;
  align-items: center;
  gap: 16px;
  pointer-events: none;
}
.actions > :deep(.ui-switch),
.actions > :deep(.icon-button) {
  pointer-events: auto;
}
.actions > :deep(.ui-switch) {
  justify-self: start;
}
.actions i {
  height: 22px;
  width: 1px;
  border-left: 1px solid var(--color-border-default);
}
.chevron {
  width: 17px;
  height: 17px;
  transition: transform var(--duration-normal) var(--ease-standard);
}
.row-indicator {
  z-index: 1;
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  color: var(--color-icon);
  pointer-events: none;
  transform: translateZ(0);
  transform-origin: center;
  transition: color var(--duration-fast) var(--ease-standard);
}
.profile-row:has(.row-hit:hover) .row-indicator {
  color: var(--color-text-primary);
}
.profile-row:has(.row-hit:active) .row-indicator {
  color: var(--color-text-primary);
}
.profile-row:has(.row-hit:hover) .row-indicator:not(.expanded) .chevron {
  transform: scale(1.06);
}
.profile-row:has(.row-hit:hover) .row-indicator.expanded .chevron {
  transform: rotate(180deg) scale(1.06);
}
.profile-row:has(.row-hit:active) .row-indicator:not(.expanded) .chevron {
  transform: scale(0.96);
}
.profile-row:has(.row-hit:active) .row-indicator.expanded .chevron {
  transform: rotate(180deg) scale(0.96);
}
.row-indicator.expanded .chevron {
  transform: rotate(180deg);
}
.reauth-icon {
  width: 17px;
  height: 17px;
  animation: profile-reauth-spin 0.9s linear infinite;
}
@keyframes profile-reauth-spin {
  to { transform: rotate(360deg); }
}
.usage-collapse {
  display: grid;
  grid-template-rows: 1fr;
  opacity: 1;
}
.usage-wrap {
  min-height: 0;
  overflow: hidden;
  transition: background-color var(--duration-fast) var(--ease-standard);
}
.usage-content {
  display: grid;
  align-items: start;
  gap: 8px;
  padding: 0 12px 12px;
}
.profiles-empty {
  padding: 44px;
  color: var(--color-text-secondary);
  text-align: center;
}
.usage-enter-active,
.usage-leave-active {
  transition:
    grid-template-rows var(--duration-slow) var(--ease-out),
    opacity var(--duration-normal) var(--ease-standard);
}
.usage-enter-from,
.usage-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .chevron,
  .profile-row,
  .usage-wrap,
  .usage-enter-active,
  .usage-leave-active {
    transition: none;
  }
  .copy small.plan-pending::after {
    animation: none;
    transform: none;
  }
}
</style>
