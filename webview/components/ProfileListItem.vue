<script setup lang="ts">
import { computed } from 'vue'
import { RefreshCw } from '@lucide/vue'
import type { Profile } from '../types'
import { useCollapseAnimation } from '../composables/useCollapseAnimation'
import ProfileRowActions from './ProfileRowActions.vue'
import ProviderDetails from './ProviderDetails.vue'
import UsageDisplay from './UsageDisplay.vue'
import UsageResetWidget from './UsageResetWidget.vue'
import UIActionItem from './ui/UIActionItem.vue'
import UIChevronIcon from './ui/UIChevronIcon.vue'
import UICollectionItem from './ui/UICollectionItem.vue'
import UICollectionItemIdentity from './ui/UICollectionItemIdentity.vue'
import UIDisclosureItem from './ui/UIDisclosureItem.vue'

const props = defineProps<{ profile: Profile; expanded: boolean; resetPendingId?: string }>()
const emit = defineEmits<{
  activate: []
  edit: [event: MouseEvent]
  delete: [event: MouseEvent]
  toggleDetails: [event?: MouseEvent | KeyboardEvent]
  useReset: [id: string]
}>()
const detailsAnimation = useCollapseAnimation()
const needsAuthentication = computed(() => Boolean(props.profile.authExpired))
const hasUsage = computed(() => props.profile.kind !== 'provider' && Boolean(props.profile.usage?.limits?.primary || props.profile.usage?.limits?.secondary))
const hasDetails = computed(() => !needsAuthentication.value && (props.profile.kind === 'provider' || hasUsage.value))
const subtitle = computed(() => {
  const relativeAge = props.profile.active ? 'just now' : props.profile.lastUsedAt ? formatRelativeAge(props.profile.lastUsedAt) : ''
  if (props.profile.kind === 'provider') {
    const domain = providerDomain(props.profile.baseUrl)
    return relativeAge ? `${domain}, used ${relativeAge}` : domain
  }
  const plan = props.profile.plan?.planType?.trim()
  if (!plan) return 'Unknown'
  const formattedPlan = plan.split(/[-_\s]+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ')
  return relativeAge ? `${formattedPlan}, used ${relativeAge}` : formattedPlan
})

function providerDomain(baseUrl?: string) {
  if (!baseUrl) return 'Custom provider'
  try { return new URL(baseUrl).hostname || baseUrl } catch { return baseUrl }
}
function formatRelativeAge(value: string) {
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
function toggle(event?: MouseEvent | KeyboardEvent) {
  if (!hasDetails.value) return
  emit('toggleDetails', event)
}
function toggleKeyboard(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  toggle(event)
}
</script>

<template>
  <UICollectionItem class="profile-item" @keydown="toggleKeyboard">
    <template #interaction>
      <UIActionItem
        v-if="needsAuthentication"
        :accessible-label="`Sign in to ${profile.name} again`"
        @activate="emit('activate')"
      />
      <UIDisclosureItem
        v-else-if="hasDetails"
        :accessible-label="`${expanded ? 'Hide' : 'Show'} details for ${profile.name}`"
        :expanded="expanded"
        :controls="`details-${profile.id}`"
        @toggle="toggle"
      />
      <UIActionItem v-else :accessible-label="profile.name" aria-hidden="true" tabindex="-1" />
    </template>
    <UICollectionItemIdentity disclosure>
      <template #disclosure>
        <span class="disclosure" :class="{ disabled: !hasDetails }" aria-hidden="true">
          <RefreshCw v-if="needsAuthentication" class="reauth-icon" />
          <UIChevronIcon v-else :expanded="expanded" />
        </span>
      </template>
      <template #status><span class="status-dot" :class="{ active: profile.active, expired: profile.authExpired }" aria-hidden="true" /></template>
      <span class="profile-copy">
        <strong>{{ profile.name }}</strong>
        <small>{{ subtitle }}</small>
      </span>
    </UICollectionItemIdentity>
    <template #actions>
      <ProfileRowActions :active="profile.active" @activate="emit('activate')" @delete="emit('delete', $event)" />
    </template>
    <template v-if="hasDetails" #details>
      <Transition :css="false" @enter="(element, done) => detailsAnimation.animate(element, true, done)" @leave="(element, done) => detailsAnimation.animate(element, false, done)">
        <div v-if="expanded" :id="`details-${profile.id}`" class="details-collapse">
          <div class="details-wrap">
            <ProviderDetails v-if="profile.kind === 'provider'" :profile="profile" @edit="emit('edit', $event)" />
            <template v-else>
              <UsageDisplay :usage="profile.usage?.limits" :busy="profile.busy" />
              <UsageResetWidget
                :credits="profile.usage?.resets?.resetCredits"
                :available-count="profile.usage?.resets?.availableResetCount"
                :stale="profile.usage?.resets?.status === 'stale'"
                :pending-id="profile.usage?.resets?.pendingResetId || resetPendingId"
                @use-reset="emit('useReset', $event)"
              />
            </template>
          </div>
        </div>
      </Transition>
    </template>
  </UICollectionItem>
</template>

<style scoped>
.profile-item { transition: background-color var(--duration-fast) var(--ease-standard); }
.profile-copy { display: grid; min-width: 0; gap: 3px; pointer-events: none; }
.profile-copy strong, .profile-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.profile-copy strong { font-size: 14px; line-height: 18px; }
.profile-copy small { width: fit-content; max-width: 100%; color: var(--color-text-secondary); font-size: 12px; line-height: 16px; }
.status-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--color-profile-status-inactive); }
.status-dot.active { background: var(--color-profile-status-active); }
.status-dot.expired { background: var(--color-profile-status-auth-required); }
.reauth-icon { width: 17px; height: 17px; animation: profile-reauth-spin .9s linear infinite; }
@keyframes profile-reauth-spin { to { transform: rotate(360deg); } }
.disclosure { display: inline-flex; width: 24px; height: 28px; margin-left: -4px; align-items: center; justify-content: center; color: var(--color-profile-disclosure-icon); border-radius: 5px; }
.disclosure.disabled { color: var(--color-text-tertiary); opacity: .55; }
.details-collapse { display: grid; overflow: hidden; opacity: 1; }
.details-wrap { display: grid; min-height: 0; gap: 8px; padding: 0 12px 12px; overflow: hidden; }
@media (hover: hover) and (pointer: fine) {
  .profile-item:hover .disclosure:not(.disabled) { color: var(--color-text-primary); }
}
@media (prefers-reduced-motion: reduce) { .profile-item { animation: none; transition: none; } }
</style>
