<script setup lang="ts">
import { computed } from 'vue'
import type { Profile } from '../types'
import ChevronIcon from './icons/ChevronIcon.vue'
import ProfileRowActions from './ProfileRowActions.vue'
import UsageDisplay from './UsageDisplay.vue'

const props = defineProps<{
  profile: Profile
  usageExpanded: boolean
}>()

const emit = defineEmits<{
  activate: []
  edit: [event: MouseEvent]
  delete: [event: MouseEvent]
  toggleUsage: [event: MouseEvent]
}>()

const hasUsage = computed(() =>
  props.profile.kind !== 'provider'
  && Boolean(props.profile.usage?.primary || props.profile.usage?.secondary),
)

const planPending = computed(() =>
  props.profile.kind !== 'provider'
  && Boolean(props.profile.busy)
  && !props.profile.usage?.planType,
)

const subtitle = computed(() => {
  if (props.profile.kind === 'provider') return props.profile.baseUrl || 'Custom provider'
  const plan = props.profile.usage?.planType?.trim()
  if (!plan) return 'Plan unavailable'
  return plan
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
})
</script>

<template>
  <article class="profile-item">
    <div
      class="profile-row"
      :class="{
        active: profile.active,
        expired: profile.authExpired,
        switchable: !profile.active,
      }"
    >
      <button
        class="row-hit-target"
        type="button"
        :aria-label="profile.active ? `Active profile ${profile.name}` : `Switch to ${profile.name}`"
        :tabindex="profile.active ? -1 : 0"
        @click="emit('activate')"
      />
      <div class="identity">
        <button
          v-if="profile.kind !== 'provider'"
          class="disclosure"
          :class="{ disabled: !hasUsage }"
          type="button"
          :disabled="!hasUsage"
          :aria-label="hasUsage ? (usageExpanded ? `Hide usage for ${profile.name}` : `Show usage for ${profile.name}`) : 'Usage unavailable'"
          :aria-expanded="hasUsage ? usageExpanded : false"
          :aria-controls="`usage-${profile.id}`"
          @click.stop="emit('toggleUsage', $event)"
        >
          <ChevronIcon :expanded="usageExpanded" />
        </button>
        <span v-else class="disclosure-placeholder" aria-hidden="true" />
        <span class="status-dot" aria-hidden="true" />
        <span class="profile-copy">
          <strong>{{ profile.name }}</strong>
          <span v-if="planPending" class="plan-pending" aria-label="Loading plan" />
          <small v-else>{{ subtitle }}</small>
        </span>
      </div>
      <ProfileRowActions
        :kind="profile.kind"
        @edit="emit('edit', $event)"
        @delete="emit('delete', $event)"
      />
    </div>
    <Transition name="usage-expand">
      <div
        v-if="profile.kind !== 'provider' && usageExpanded"
        :id="`usage-${profile.id}`"
        class="usage-wrap"
      >
        <UsageDisplay :usage="profile.usage" :busy="profile.busy" />
      </div>
    </Transition>
  </article>
</template>

<style scoped>
.profile-item + .profile-item { border-top: 1px solid var(--color-border-default); }
.profile-item { transition: background-color var(--duration-fast) var(--ease-standard); }
.profile-row { position: relative; display: grid; min-height: 68px; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 11px 15px; }
.row-hit-target { position: absolute; z-index: 0; inset: 0; padding: 0; border: 0; outline: none; background: transparent; cursor: default; }
.switchable .row-hit-target { cursor: pointer; }
.row-hit-target:focus-visible { box-shadow: inset 0 0 0 1px var(--color-focus); }
.identity { z-index: 1; display: grid; min-width: 0; grid-template-columns: 16px 10px minmax(0, 1fr); align-items: center; gap: 5px; pointer-events: none; }
.disclosure, .disclosure-placeholder { width: 24px; height: 28px; margin-left: -4px; }
.disclosure { z-index: 2; display: inline-flex; padding: 5px; align-items: center; justify-content: center; color: var(--color-profile-disclosure-icon); border: 0; border-radius: 5px; outline: none; background: transparent; pointer-events: auto; transition: color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard); }
.disclosure svg { width: 16px; height: 16px; }
.disclosure:focus-visible { box-shadow: inset 0 0 0 1px var(--color-focus); }
.disclosure.disabled { color: var(--color-text-tertiary); opacity: .55; cursor: default; }
.status-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--color-profile-status-inactive); }
.active .status-dot { background: var(--color-profile-status-active); }
.expired .status-dot { background: var(--color-profile-status-auth-required); }
.profile-copy { display: grid; min-width: 0; margin-left: 8px; gap: 3px; pointer-events: none; }
.profile-copy strong { overflow: hidden; font-size: 14px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.profile-copy small { overflow: hidden; width: fit-content; max-width: 100%; color: var(--color-text-secondary); font-size: 12px; line-height: 16px; text-overflow: ellipsis; white-space: nowrap; }
.plan-pending { position: relative; display: block; width: 112px; height: 16px; overflow: hidden; border-radius: 4px; background: var(--color-bg-control-hover); }
.plan-pending::after { position: absolute; inset: 0; background: linear-gradient(105deg, transparent 20%, var(--color-shimmer-light) 50%, transparent 80%); content: ''; transform: translateX(-100%); animation: plan-shimmer 1.25s linear infinite; }
.usage-wrap { padding: 0 12px 12px; overflow: hidden; }
.usage-expand-enter-active, .usage-expand-leave-active { max-height: 360px; overflow: hidden; transition: max-height var(--duration-slow) var(--ease-out), opacity var(--duration-normal) var(--ease-standard), transform 180ms var(--ease-out), padding-bottom var(--duration-slow) var(--ease-out); }
.usage-expand-enter-from, .usage-expand-leave-to { max-height: 0; padding-bottom: 0; opacity: 0; transform: translateY(-4px); }
@keyframes plan-shimmer { to { transform: translateX(100%); } }
@media (hover: hover) and (pointer: fine) {
  .profile-item:has(.row-hit-target:hover):not(:has(.row-actions:hover)) { background: var(--color-bg-row-hover); }
  .disclosure:hover:not(:disabled) { color: var(--color-text-primary); background: var(--color-bg-control-hover); }
}
@media (prefers-reduced-motion: reduce) {
  .profile-item, .disclosure, .usage-expand-enter-active, .usage-expand-leave-active { transition: none; }
  .plan-pending::after { animation: none; transform: none; }
}
</style>
