<script setup lang="ts">
import { computed } from 'vue'
import type { Profile } from '../types'
import { ArrowLeftRight, ChevronDown } from '@lucide/vue'
import UIIconButton from './ui/UIIconButton.vue'
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
  if (props.profile.kind === 'provider') {
    const transport = props.profile.transport === 'websocket' ? 'WebSocket' : 'HTTP/SSE'
    return `${transport} · ${props.profile.baseUrl || 'Custom provider'}`
  }
  const plan = props.profile.usage?.planType?.trim()
  if (!plan) return 'Unknown'
  const formattedPlan = plan
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
  const lastUsed = props.profile.lastUsedAt
    ? formatRelativeAge(props.profile.lastUsedAt)
    : ''
  return lastUsed ? `${formattedPlan}, used ${lastUsed}` : formattedPlan
})

function formatRelativeAge(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return ''
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days}d${hours % 24 ? ` ${hours % 24}h` : ''} ago`
}

function toggleFromKeyboard(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  if (props.profile.kind === 'provider') {
    emit('activate')
  } else if (hasUsage.value) {
    emit('toggleUsage', event as unknown as MouseEvent)
  }
}
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
      @click="profile.kind === 'provider' ? emit('activate') : hasUsage && emit('toggleUsage', $event)"
      @keydown="toggleFromKeyboard"
      tabindex="0"
      :aria-expanded="profile.kind !== 'provider' && hasUsage ? usageExpanded : undefined"
      :aria-label="profile.kind === 'provider' ? `Use ${profile.name}` : hasUsage ? (usageExpanded ? `Hide usage for ${profile.name}` : `Show usage for ${profile.name}`) : undefined"
    >
      <div class="identity">
        <span
          v-if="profile.kind !== 'provider'"
          class="disclosure"
          :class="{ disabled: !hasUsage }"
          aria-hidden="true"
        >
          <ChevronDown :class="{ expanded: usageExpanded }" />
        </span>
        <UIIconButton
          v-else
          class="provider-switch"
          accessible-label="Use profile"
          title="Use profile"
          background="never"
          surface-motion="scale"
          icon-motion="together"
          size="small"
          :disabled="profile.active"
          @click.stop="emit('activate')"
        >
          <template #icon><ArrowLeftRight /></template>
        </UIIconButton>
        <span class="status-dot" aria-hidden="true" />
        <span class="profile-copy">
          <strong>{{ profile.name }}</strong>
          <span v-if="planPending" class="plan-pending" aria-label="Loading plan" />
          <small v-else>{{ subtitle }}</small>
        </span>
      </div>
      <ProfileRowActions
        :kind="profile.kind"
        :active="profile.active"
        @activate="emit('activate')"
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
.profile-row:focus-visible { outline: 1px solid var(--color-focus); outline-offset: -1px; }
.identity { z-index: 1; display: grid; min-width: 0; grid-template-columns: 16px 10px minmax(0, 1fr); align-items: center; gap: 5px; pointer-events: none; }
.disclosure, .provider-switch { width: 24px; height: 28px; margin-left: -4px; }
.disclosure { z-index: 2; display: inline-flex; padding: 5px; align-items: center; justify-content: center; color: var(--color-profile-disclosure-icon); border: 0; border-radius: 5px; outline: none; background: transparent; pointer-events: auto; transition: color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard); }
.disclosure svg { width: 16px; height: 16px; transition: transform var(--duration-fast) var(--ease-standard); }
.disclosure svg.expanded { transform: rotate(180deg); }
.disclosure:focus-visible { box-shadow: inset 0 0 0 1px var(--color-focus); }
.disclosure.disabled { color: var(--color-text-tertiary); opacity: .55; cursor: default; }
.provider-switch { width: 22px; padding: 4px; pointer-events: auto; }
.provider-switch :deep(.icon) { width: 14px; height: 14px; }
.status-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--color-profile-status-inactive); }
.active .status-dot { background: var(--color-profile-status-active); }
.expired .status-dot { background: var(--color-profile-status-auth-required); }
.profile-copy { display: grid; min-width: 0; margin-left: 8px; gap: 3px; pointer-events: none; }
.profile-copy strong { overflow: hidden; font-size: 14px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.profile-copy small { overflow: hidden; width: fit-content; max-width: 100%; color: var(--color-text-secondary); font-size: 12px; line-height: 16px; text-overflow: ellipsis; white-space: nowrap; }
.plan-pending { position: relative; display: block; width: 32px; height: 10px; overflow: hidden; border-radius: 3px; background: var(--color-bg-control-hover); }
.plan-pending::after { position: absolute; inset: 0; background: linear-gradient(105deg, transparent 20%, var(--color-shimmer-light) 50%, transparent 80%); content: ''; transform: translateX(-100%); animation: plan-shimmer 1.25s linear infinite; }
.usage-wrap { padding: 0 12px 12px; overflow: hidden; }
.usage-expand-enter-active, .usage-expand-leave-active { max-height: 360px; overflow: hidden; transition: max-height var(--duration-slow) var(--ease-out), opacity var(--duration-normal) var(--ease-standard), transform 180ms var(--ease-out), padding-bottom var(--duration-slow) var(--ease-out); }
.usage-expand-enter-from, .usage-expand-leave-to { max-height: 0; padding-bottom: 0; opacity: 0; transform: translateY(-4px); }
@keyframes plan-shimmer { to { transform: translateX(100%); } }
@media (hover: hover) and (pointer: fine) {
  .profile-row:hover:not(:has(.row-actions:hover)) ~ .usage-wrap,
  .profile-item:has(.profile-row:hover):not(:has(.row-actions:hover)) { background: var(--color-bg-row-hover); }
  .profile-row:hover:not(:has(.row-actions:hover)) .disclosure,
  .profile-row:hover:not(:has(.row-actions:hover)) .provider-switch { color: var(--color-text-primary); background: transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .profile-item, .disclosure, .usage-expand-enter-active, .usage-expand-leave-active { transition: none; }
  .plan-pending::after { animation: none; transform: none; }
}
</style>
