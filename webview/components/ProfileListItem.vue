<script setup lang="ts">
import { computed } from 'vue'
import type { Profile } from '../types'
import { useCollapseAnimation } from '../composables/useCollapseAnimation'
import ProfileRowActions from './ProfileRowActions.vue'
import ProviderDetails from './ProviderDetails.vue'
import UsageDisplay from './UsageDisplay.vue'
import UIActionItem from './ui/UIActionItem.vue'
import UIChevronIcon from './ui/UIChevronIcon.vue'
import UICollectionItem from './ui/UICollectionItem.vue'
import UICollectionItemIdentity from './ui/UICollectionItemIdentity.vue'
import UIDisclosureItem from './ui/UIDisclosureItem.vue'

const props = defineProps<{ profile: Profile; expanded: boolean }>()
const emit = defineEmits<{
  activate: []
  edit: [event: MouseEvent]
  delete: [event: MouseEvent]
  toggleDetails: [event?: MouseEvent | KeyboardEvent]
}>()
const detailsAnimation = useCollapseAnimation()
const hasUsage = computed(() => props.profile.kind !== 'provider' && Boolean(props.profile.usage?.primary || props.profile.usage?.secondary))
const hasDetails = computed(() => props.profile.kind === 'provider' || hasUsage.value)
const planPending = computed(() => props.profile.kind !== 'provider' && Boolean(props.profile.busy) && !props.profile.usage?.planType)

const subtitle = computed(() => {
  const relativeAge = props.profile.active ? 'just now' : props.profile.lastUsedAt ? formatRelativeAge(props.profile.lastUsedAt) : ''
  if (props.profile.kind === 'provider') {
    const domain = providerDomain(props.profile.baseUrl)
    return relativeAge ? `${domain}, used ${relativeAge}` : domain
  }
  const plan = props.profile.usage?.planType?.trim()
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
      <UIDisclosureItem
        v-if="hasDetails"
        :accessible-label="`${expanded ? 'Hide' : 'Show'} details for ${profile.name}`"
        :expanded="expanded"
        :controls="`details-${profile.id}`"
        @toggle="toggle"
      />
      <UIActionItem v-else :accessible-label="profile.name" aria-hidden="true" tabindex="-1" />
    </template>
    <UICollectionItemIdentity disclosure>
      <template #disclosure>
        <span class="disclosure" :class="{ disabled: !hasDetails }" aria-hidden="true"><UIChevronIcon :expanded="expanded" /></span>
      </template>
      <template #status><span class="status-dot" :class="{ active: profile.active, expired: profile.authExpired }" aria-hidden="true" /></template>
      <span class="profile-copy">
        <strong>{{ profile.name }}</strong>
        <span v-if="planPending" class="plan-pending" aria-label="Loading plan" />
        <small v-else>{{ subtitle }}</small>
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
            <UsageDisplay v-else :usage="profile.usage" :busy="profile.busy" />
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
.disclosure { display: inline-flex; width: 24px; height: 28px; margin-left: -4px; align-items: center; justify-content: center; color: var(--color-profile-disclosure-icon); border-radius: 5px; }
.disclosure.disabled { color: var(--color-text-tertiary); opacity: .55; }
.plan-pending { position: relative; display: block; width: 32px; height: 10px; overflow: hidden; border-radius: 3px; background: var(--color-bg-control-hover); }
.plan-pending::after { position: absolute; inset: 0; background: linear-gradient(105deg, transparent 20%, var(--color-shimmer-light) 50%, transparent 80%); content: ''; animation: plan-shimmer 1.25s linear infinite; }
.details-collapse { display: grid; overflow: hidden; opacity: 1; }
.details-wrap { min-height: 0; padding: 0 12px 12px; overflow: hidden; }
@keyframes plan-shimmer { to { transform: translateX(100%); } }
@media (hover: hover) and (pointer: fine) {
  .profile-item:hover { background: var(--color-bg-row-hover); }
}
@media (prefers-reduced-motion: reduce) { .profile-item, .plan-pending::after { animation: none; transition: none; } }
</style>
