<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef, watch, type CSSProperties } from 'vue'
import type { Profile, ProviderDraft, ProviderUpdate } from '../types'
import PersonAddIcon from './icons/PersonAddIcon.vue'
import UsersIcon from './icons/UsersIcon.vue'
import CloseIcon from './icons/CloseIcon.vue'
import UIConfirmDialog from './ui/UIConfirmDialog.vue'
import UIIconButton from './ui/UIIconButton.vue'
import ProfileRowActions from './ProfileRowActions.vue'
import UIButton from './ui/UIButton.vue'
import { vscode } from '../vscode'

const props = defineProps<{
  profiles: readonly Profile[]
  error: string
  awaitingSignIn: boolean
  addError: string
  activationFailureCount: number
  activationWaitingProfileId: string | null
  providerUpdateCount: number
}>()
const emit = defineEmits<{
  activate: [id: string]
  delete: [id: string]
  beginAdd: []
  addProvider: [draft: ProviderDraft]
  updateProvider: [update: ProviderUpdate]
  cancelAdd: []
  signIn: []
  retryAdd: []
  reauthenticate: [id: string]
  expandedUsageChange: [ids: string[]]
}>()

const restoredUiState = vscode.getState()
const query = shallowRef(restoredUiState?.query ?? '')
const pendingSwitchProfile = shallowRef<Profile | null>(null)
const pendingReauthProfile = shallowRef<Profile | null>(null)
const isSwitchPending = shallowRef(false)
const pendingDeleteProfile = shallowRef<Profile | null>(null)
const isAddPending = shallowRef(false)
const isProviderFormOpen = shallowRef(false)
const editingProviderId = shallowRef<string | null>(null)
const providerName = shallowRef('')
const providerBaseUrl = shallowRef('')
const providerToken = shallowRef('')
const initialProviderName = shallowRef('')
const initialProviderBaseUrl = shallowRef('')
const providerNameInput = useTemplateRef<HTMLInputElement>('providerNameInput')
const providerBaseUrlInput = useTemplateRef<HTMLInputElement>('providerBaseUrlInput')
const providerNameError = useTemplateRef<HTMLSpanElement>('providerNameError')
const providerBaseUrlError = useTemplateRef<HTMLSpanElement>('providerBaseUrlError')
const showProviderBaseUrlError = shallowRef(false)
const showProviderNameError = shallowRef(false)
const providerNameErrorStyle = shallowRef<CSSProperties>()
const providerBaseUrlErrorStyle = shallowRef<CSSProperties>()
const providerSubmitPending = shallowRef(false)
const expandedUsageIds = shallowRef<Set<string>>(new Set(restoredUiState?.expandedUsageIds ?? []))
const usageShimmerIds = shallowRef<Set<string>>(new Set())
const finishingUsageShimmerIds = new Set<string>()
const fadingUsageShimmerIds = shallowRef<Set<string>>(new Set())
const usageShimmerTimers = new Map<string, number>()
const usageShimmerStartedAt = new Map<string, number>()
const usageShimmerStructure = new Map<string, string>()
const usageShimmerDurationMs = 2200
const usageShimmerFadeMs = 320
const visibleProfiles = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase()
  if (!normalizedQuery) return props.profiles
  return props.profiles.filter((profile) =>
    [profile.name, profile.provider, profile.baseUrl, profile.envKey]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
  )
})
const isEditingProvider = computed(() => editingProviderId.value !== null)
const providerFieldsChanged = computed(() =>
  providerName.value.trim() !== initialProviderName.value
  || providerBaseUrl.value.trim() !== initialProviderBaseUrl.value
  || providerToken.value.trim() !== ''
)
const hasDuplicateProviderName = computed(() => {
  const normalizedName = providerName.value.trim().toLocaleLowerCase()
  return normalizedName !== '' && props.profiles.some((profile) =>
    profile.kind === 'provider'
    && profile.id !== editingProviderId.value
    && profile.name.trim().toLocaleLowerCase() === normalizedName
  )
})
const hasProviderFieldError = computed(() =>
  hasDuplicateProviderName.value
  || (providerBaseUrl.value.trim() !== '' && !isValidProviderBaseUrl(providerBaseUrl.value.trim()))
)
const canAddProvider = computed(() => {
  const requiredFieldsPresent = providerName.value.trim() !== '' && providerBaseUrl.value.trim() !== ''
  if (!requiredFieldsPresent || hasProviderFieldError.value || providerSubmitPending.value) return false
  if (!isEditingProvider.value) return providerToken.value.trim() !== ''
  return providerFieldsChanged.value
})
const providerNameErrorMessage = computed(() =>
  props.error.toLocaleLowerCase().includes('provider named')
    ? props.error
    : 'A provider with this name already exists.'
)

function measureText(element: HTMLElement, value: string) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return 0
  context.font = getComputedStyle(element).font
  return context.measureText(value).width
}

function getFieldErrorStyle(input: HTMLInputElement | null, error: HTMLSpanElement | null, value: string) {
  if (!input || !error) return undefined
  const fieldWidth = input.clientWidth
  const edge = 8
  const textAnchor = Math.max(edge, Math.min(fieldWidth - edge, measureText(input, value) * 0.75 + 10))
  const naturalWidth = Math.ceil(measureText(error, error.textContent ?? '')) + 20
  const popoverWidth = Math.min(fieldWidth, naturalWidth)
  const left = Math.max(0, Math.min(fieldWidth - popoverWidth, textAnchor - popoverWidth * 0.25))
  return {
    '--error-left': `${left}px`,
    '--error-width': `${popoverWidth}px`,
    whiteSpace: naturalWidth <= fieldWidth ? 'nowrap' : 'normal',
    overflowWrap: naturalWidth <= fieldWidth ? 'normal' : 'anywhere',
  } as CSSProperties
}

async function updateProviderErrorPositions() {
  await nextTick()
  if (showProviderNameError.value) {
    providerNameErrorStyle.value = getFieldErrorStyle(providerNameInput.value, providerNameError.value, providerName.value)
  }
  if (showProviderBaseUrlError.value) {
    providerBaseUrlErrorStyle.value = getFieldErrorStyle(providerBaseUrlInput.value, providerBaseUrlError.value, providerBaseUrl.value)
  }
}
const hasOpenOverlay = computed(() =>
  isProviderFormOpen.value
  || isAddPending.value
  || props.awaitingSignIn
  || pendingSwitchProfile.value !== null
  || pendingReauthProfile.value !== null
  || pendingDeleteProfile.value !== null
)

function requestActivation(profile: Profile) {
  if (profile.authExpired) {
    pendingReauthProfile.value = profile
    return
  }
  if (profile.active) return
  isSwitchPending.value = false
  pendingSwitchProfile.value = profile
}

function cancelActivation() {
  if (isSwitchPending.value) return
  pendingSwitchProfile.value = null
}

function confirmActivation() {
  if (!pendingSwitchProfile.value) return
  const profileId = pendingSwitchProfile.value.id
  emit('activate', profileId)
}

function requestDeletion(profile: Profile) {
  pendingDeleteProfile.value = profile
}

function cancelDeletion() {
  pendingDeleteProfile.value = null
}

function confirmDeletion() {
  if (!pendingDeleteProfile.value) return
  const profileId = pendingDeleteProfile.value.id
  pendingDeleteProfile.value = null
  emit('delete', profileId)
}

function confirmAdd() {
  isAddPending.value = false
  emit('beginAdd')
}

function confirmReauth() {
  const profileId = pendingReauthProfile.value?.id
  pendingReauthProfile.value = null
  if (profileId) emit('reauthenticate', profileId)
}

function blurActiveElement() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

function openProviderForm(event?: MouseEvent) {
  if (event?.currentTarget instanceof HTMLElement) event.currentTarget.blur()
  isProviderFormOpen.value = true
  editingProviderId.value = null
  initialProviderName.value = ''
  initialProviderBaseUrl.value = ''
}

function openProviderEditor(profile: Profile, event?: MouseEvent) {
  event?.stopPropagation()
  if (event?.currentTarget instanceof HTMLElement) event.currentTarget.blur()
  editingProviderId.value = profile.id
  providerName.value = profile.name
  providerBaseUrl.value = profile.baseUrl ?? ''
  providerToken.value = ''
  initialProviderName.value = profile.name.trim()
  initialProviderBaseUrl.value = (profile.baseUrl ?? '').trim()
  showProviderBaseUrlError.value = false
  isProviderFormOpen.value = true
}

function closeProviderForm() {
  isProviderFormOpen.value = false
  providerName.value = ''
  providerBaseUrl.value = ''
  providerToken.value = ''
  editingProviderId.value = null
  showProviderBaseUrlError.value = false
  showProviderNameError.value = false
  providerSubmitPending.value = false
  window.setTimeout(blurActiveElement, 0)
}

function isValidProviderBaseUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function submitProvider() {
  const normalizedName = providerName.value.trim().toLocaleLowerCase()
  const duplicate = props.profiles.some((profile) =>
    profile.kind === 'provider'
    && profile.id !== editingProviderId.value
    && profile.name.trim().toLocaleLowerCase() === normalizedName
  )
  if (duplicate) {
    showProviderNameError.value = true
    providerNameInput.value?.focus()
    return
  }
  if (!isValidProviderBaseUrl(providerBaseUrl.value.trim())) {
    showProviderBaseUrlError.value = true
    providerBaseUrlInput.value?.focus()
    return
  }
  if (!canAddProvider.value) return
  providerSubmitPending.value = true
  const draft = {
    name: providerName.value.trim(),
    baseUrl: providerBaseUrl.value.trim(),
    token: providerToken.value.trim(),
  }
  if (editingProviderId.value) {
    emit('updateProvider', { id: editingProviderId.value, ...draft })
  } else {
    emit('addProvider', draft)
  }
}

function getProfileMeta(profile: Profile) {
  if (profile.kind === 'provider') return profile.baseUrl ?? ''
  return 'OpenAI'
}

function getUsageWindows(profile: Profile) {
  const windows = [profile.usage?.primary, profile.usage?.secondary].filter((window) => window != null)
  return windows
    .map((window) => ({
      ...window,
      label: window.windowDurationMins === 300
        ? '5-hour usage limit'
        : window.windowDurationMins === 10080
          ? 'Weekly usage limit'
          : window.windowDurationMins
            ? `${Math.round(window.windowDurationMins / 60)}-hour usage limit`
            : 'Usage limit',
    }))
    .sort((left, right) => (left.windowDurationMins ?? 0) - (right.windowDurationMins ?? 0))
}

function isUsageExpanded(profile: Profile) {
  return expandedUsageIds.value.has(profile.id)
}

function canShowUsage(profile: Profile) {
  return profile.kind !== 'provider' && getUsageWindows(profile).length > 0
}

function isUsageRefreshing(profile: Profile) {
  const updatedAt = Date.parse(profile.usage?.updatedAt ?? '')
  return Boolean(profile.busy) && (!Number.isFinite(updatedAt) || Date.now() - updatedAt >= 180_000)
}

function usageStatusLabel(profile: Profile) {
  return profile.usage?.updatedAt ? 'Updating usage limits...' : 'Fetching usage limits...'
}

function isUsageShimmering(profile: Profile) {
  return usageShimmerIds.value.has(profile.id)
}

function isUsageShimmerFading(profile: Profile) {
  return fadingUsageShimmerIds.value.has(profile.id)
}

function setUsageShimmer(profileId: string, visible: boolean) {
  const next = new Set(usageShimmerIds.value)
  if (visible) {
    if (!next.has(profileId)) usageShimmerStartedAt.set(profileId, performance.now())
    next.add(profileId)
  } else {
    next.delete(profileId)
    usageShimmerStartedAt.delete(profileId)
    usageShimmerStructure.delete(profileId)
  }
  usageShimmerIds.value = next
}

function finishUsageShimmer(profileId: string) {
  const timer = usageShimmerTimers.get(profileId)
  if (timer !== undefined) window.clearTimeout(timer)
  usageShimmerTimers.delete(profileId)
  finishingUsageShimmerIds.delete(profileId)
  const fading = new Set(fadingUsageShimmerIds.value)
  fading.delete(profileId)
  fadingUsageShimmerIds.value = fading
  setUsageShimmer(profileId, false)
}

function beginUsageShimmerFade(profileId: string) {
  if (!usageShimmerIds.value.has(profileId) || fadingUsageShimmerIds.value.has(profileId)) return
  finishingUsageShimmerIds.delete(profileId)
  fadingUsageShimmerIds.value = new Set(fadingUsageShimmerIds.value).add(profileId)
  const timer = usageShimmerTimers.get(profileId)
  if (timer !== undefined) window.clearTimeout(timer)
  usageShimmerTimers.set(profileId, window.setTimeout(() => {
    finishUsageShimmer(profileId)
  }, usageShimmerFadeMs))
}

function syncUsageShimmers(profiles: readonly Profile[]) {
  const profileIds = new Set(profiles.map((profile) => profile.id))
  for (const profile of profiles) {
    if (isUsageRefreshing(profile)) {
      const timer = usageShimmerTimers.get(profile.id)
      if (timer !== undefined) window.clearTimeout(timer)
      usageShimmerTimers.delete(profile.id)
      finishingUsageShimmerIds.delete(profile.id)
      const fading = new Set(fadingUsageShimmerIds.value)
      fading.delete(profile.id)
      fadingUsageShimmerIds.value = fading
      if (!usageShimmerIds.value.has(profile.id)) {
        usageShimmerStructure.set(profile.id, getUsageWindows(profile).map((window) => window.label).join('|'))
        setUsageShimmer(profile.id, true)
      }
      continue
    }

    if (!usageShimmerIds.value.has(profile.id) || finishingUsageShimmerIds.has(profile.id)) continue
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishUsageShimmer(profile.id)
      continue
    }

    finishingUsageShimmerIds.add(profile.id)
    const structure = getUsageWindows(profile).map((window) => window.label).join('|')
    const structureChanged = structure !== usageShimmerStructure.get(profile.id)
    if (structureChanged) {
      usageShimmerStructure.set(profile.id, structure)
      usageShimmerStartedAt.set(profile.id, performance.now())
    }
    const startedAt = usageShimmerStartedAt.get(profile.id) ?? performance.now()
    const elapsedInCycle = (performance.now() - startedAt) % usageShimmerDurationMs
    const remainingInCycle = structureChanged ? usageShimmerDurationMs : usageShimmerDurationMs - elapsedInCycle
    const timer = window.setTimeout(() => {
      beginUsageShimmerFade(profile.id)
    }, remainingInCycle + 32)
    usageShimmerTimers.set(profile.id, timer)
  }

  for (const profileId of usageShimmerIds.value) {
    if (profileIds.has(profileId)) continue
    finishUsageShimmer(profileId)
  }
}

function toggleUsage(profile: Profile, event: MouseEvent) {
  if (event.detail > 0 && event.currentTarget instanceof HTMLElement) event.currentTarget.blur()
  const opening = !expandedUsageIds.value.has(profile.id)
  expandedUsageIds.value = opening ? new Set([profile.id]) : new Set()
}

function publishExpandedUsage() {
  emit('expandedUsageChange', document.hidden ? [] : [...expandedUsageIds.value])
}

function persistUiState() {
  vscode.setState({ query: query.value, expandedUsageIds: [...expandedUsageIds.value] })
}

function getRemainingPercent(usedPercent: number) {
  return Math.max(0, 100 - usedPercent)
}

function formatResetTime(resetsAt: number | null) {
  if (!resetsAt) return 'Reset time unavailable'
  return `Resets ${new Date(resetsAt * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })}`
}

function handleUsageKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || hasOpenOverlay.value || expandedUsageIds.value.size === 0) return
  event.preventDefault()
  expandedUsageIds.value = new Set()
}

function dismissProviderFieldError(event: MouseEvent) {
  const target = event.target
  if (target !== providerBaseUrlInput.value) showProviderBaseUrlError.value = false
  if (target !== providerNameInput.value) showProviderNameError.value = false
}

watch(() => props.activationFailureCount, () => {
  isSwitchPending.value = false
})

watch(() => props.activationWaitingProfileId, (profileId) => {
  if (profileId && pendingSwitchProfile.value?.id === profileId) {
    isSwitchPending.value = true
  }
})

watch(isProviderFormOpen, async (open) => {
  if (!open) return
  await nextTick()
  providerNameInput.value?.focus()
})

watch(providerBaseUrl, (value) => {
  if (showProviderBaseUrlError.value && isValidProviderBaseUrl(value.trim())) {
    showProviderBaseUrlError.value = false
  }
})
watch(providerName, (value) => {
  const normalizedName = value.trim().toLocaleLowerCase()
  const duplicate = normalizedName !== '' && props.profiles.some((profile) =>
    profile.kind === 'provider'
    && profile.id !== editingProviderId.value
    && profile.name.trim().toLocaleLowerCase() === normalizedName
  )
  showProviderNameError.value = duplicate
})
watch(
  [showProviderNameError, showProviderBaseUrlError, providerName, providerBaseUrl],
  updateProviderErrorPositions,
)
watch(() => props.error, (value) => {
  showProviderNameError.value = value.toLocaleLowerCase().includes('provider named')
  if (value) providerSubmitPending.value = false
})
watch(() => props.providerUpdateCount, () => {
  if (providerSubmitPending.value && editingProviderId.value) closeProviderForm()
})
watch(() => props.profiles, syncUsageShimmers, { immediate: true })

watch(query, persistUiState)
watch(expandedUsageIds, () => {
  persistUiState()
  publishExpandedUsage()
})

onMounted(() => {
  window.addEventListener('keydown', handleUsageKeydown)
  document.addEventListener('mousedown', dismissProviderFieldError)
  document.addEventListener('visibilitychange', publishExpandedUsage)
  window.addEventListener('resize', updateProviderErrorPositions)
  publishExpandedUsage()
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleUsageKeydown)
  document.removeEventListener('mousedown', dismissProviderFieldError)
  document.removeEventListener('visibilitychange', publishExpandedUsage)
  window.removeEventListener('resize', updateProviderErrorPositions)
  for (const timer of usageShimmerTimers.values()) window.clearTimeout(timer)
  emit('expandedUsageChange', [])
})
</script>

<template>
  <div class="profiles-view">
    <div class="search-toolbar">
      <div class="search-card">
        <label class="visually-hidden" for="profile-search">Search profiles by email</label>
        <input
          id="profile-search"
          v-model="query"
          class="search-input"
          type="text"
          placeholder="Search..."
          autocomplete="off"
          spellcheck="false"
        >
        <UIIconButton
          v-if="query"
          accessible-label="Clear search"
          title="Clear search"
          class="clear-search-button"
          background="never"
          surface-motion="scale"
          icon-motion="together"
          size="small"
          @click="query = ''"
        >
          <template #icon><CloseIcon /></template>
        </UIIconButton>
      </div>
      <UIIconButton
        accessible-label="Add profile"
        title="Add profile"
        class="add-button"
        background="always"
        surface-motion="none"
        icon-motion="together"
        size="medium"
        @click="isAddPending = true"
      >
        <template #icon><PersonAddIcon /></template>
      </UIIconButton>
      <UIIconButton
        accessible-label="Add provider"
        title="Add provider"
        class="add-button"
        background="always"
        surface-motion="none"
        icon-motion="together"
        size="medium"
        @click="openProviderForm"
      >
        <template #icon><UsersIcon /></template>
      </UIIconButton>
    </div>

    <div class="table-card">
      <div class="list-header">Profile</div>
      <div class="profile-list">
        <article v-for="profile in visibleProfiles" :key="profile.id" class="profile-item">
          <div
            class="profile-row"
            :class="{ active: profile.active, expired: profile.authExpired, switchable: !profile.active }"
          >
            <button
              class="row-hit-target"
              type="button"
              :aria-label="profile.active ? `Active profile ${profile.name}` : `Switch to ${profile.name}`"
              :tabindex="profile.active ? -1 : 0"
              @click="requestActivation(profile)"
            />
            <div class="identity">
              <span class="status-stack">
                <span class="dot" aria-hidden="true" />
              </span>
              <span class="profile-copy">
                <span class="name">{{ profile.name }}</span>
                <span class="meta">{{ getProfileMeta(profile) }}</span>
              </span>
            </div>
            <ProfileRowActions
              :kind="profile.kind"
              :can-show-usage="canShowUsage(profile)"
              :usage-expanded="isUsageExpanded(profile)"
              @edit="openProviderEditor(profile, $event)"
              @delete="requestDeletion(profile)"
              @toggle-usage="toggleUsage(profile, $event)"
            />
          </div>
          <Transition name="usage-expand">
            <div v-if="isUsageExpanded(profile)" class="usage-widgets">
              <section
                v-for="window in getUsageWindows(profile)"
                :key="window.label"
                class="usage-widget"
                :class="{ refreshing: isUsageShimmering(profile), 'shimmer-fading': isUsageShimmerFading(profile) }"
              >
                <span class="usage-copy">
                  <span class="usage-title">{{ window.label }}</span>
                  <span class="usage-reset">{{ formatResetTime(window.resetsAt) }}</span>
                </span>
                <span class="usage-track" aria-hidden="true">
                  <span
                    class="usage-fill"
                    :style="{ width: `${getRemainingPercent(window.usedPercent)}%` }"
                  />
                </span>
                <span class="usage-remaining">{{ getRemainingPercent(window.usedPercent) }}% left</span>
              </section>
              <section
                v-if="getUsageWindows(profile).length === 0"
                class="usage-widget usage-placeholder"
                :class="{ refreshing: isUsageShimmering(profile), 'shimmer-fading': isUsageShimmerFading(profile) }"
              >
                <span class="usage-copy">
                  <span class="usage-title">Usage limits</span>
                  <span class="usage-reset">{{ isUsageRefreshing(profile) ? usageStatusLabel(profile) : profile.usage?.errorCode === 'AUTH_EXPIRED' ? 'Expired' : 'Usage limits unavailable' }}</span>
                </span>
              </section>
            </div>
          </Transition>
        </article>
        <div v-if="!visibleProfiles.length" class="empty">
          {{ props.profiles.length ? 'No profiles found' : 'No profiles yet' }}
        </div>
      </div>
    </div>

    <UIConfirmDialog
      :open="pendingReauthProfile !== null"
      title="Authentication expired"
      :message="`Authentication for ${pendingReauthProfile?.name ?? 'this profile'} has expired. Sign in again to refresh it.`"
      confirm-label="Re-authenticate"
      cancel-label="Cancel"
      @confirm="confirmReauth"
      @cancel="pendingReauthProfile = null"
    />
    <UIConfirmDialog
      :open="isAddPending"
      title="Add OpenAI profile?"
      message="The current profile will remain saved. VS Code will reload and wait for another Codex sign-in."
      confirm-label="Continue"
      @confirm="confirmAdd"
      @cancel="isAddPending = false"
    />
    <Transition name="provider-layer">
      <div
        v-if="isProviderFormOpen"
        class="backdrop"
        @click.self="closeProviderForm"
        @keydown.esc.stop.prevent="closeProviderForm"
      >
        <form class="provider-dialog" novalidate @submit.prevent="submitProvider">
        <h2 class="dialog-title">{{ editingProviderId ? 'Edit provider' : 'Add provider' }}</h2>
        <label class="field">
          <span class="field-label">Name</span>
          <input
            ref="providerNameInput"
            v-model="providerName"
            class="field-input"
            type="text"
            autocomplete="off"
            :aria-invalid="showProviderNameError || undefined"
            :aria-describedby="showProviderNameError ? 'provider-name-error' : undefined"
          >
          <Transition name="field-error">
            <span v-if="showProviderNameError" id="provider-name-error" ref="providerNameError" class="field-error" role="alert" :style="providerNameErrorStyle">{{ providerNameErrorMessage }}</span>
          </Transition>
        </label>
        <label class="field">
          <span class="field-label">Base URL</span>
          <input
            ref="providerBaseUrlInput"
            v-model="providerBaseUrl"
            class="field-input"
            type="url"
            autocomplete="off"
            :aria-invalid="showProviderBaseUrlError || undefined"
            :aria-describedby="showProviderBaseUrlError ? 'provider-base-url-error' : undefined"
            @blur="showProviderBaseUrlError = providerBaseUrl.trim() !== '' && !isValidProviderBaseUrl(providerBaseUrl.trim())"
          >
          <Transition name="field-error">
            <span
              v-if="showProviderBaseUrlError"
              id="provider-base-url-error"
              ref="providerBaseUrlError"
              class="field-error"
              role="alert"
              :style="providerBaseUrlErrorStyle"
            >Please enter a URL.</span>
          </Transition>
        </label>
        <label class="field">
          <span class="field-label">Token</span>
          <input v-model="providerToken" class="field-input" type="password" autocomplete="new-password" :placeholder="editingProviderId ? 'Enter a new token' : ''">
        </label>
        <div class="actions">
          <UIButton @click="closeProviderForm">Cancel</UIButton>
          <UIButton
            type="submit"
            variant="primary"
            :disabled="!canAddProvider"
            :tooltip="canAddProvider ? undefined : 'Action unavailable'"
          >
            {{ editingProviderId ? 'Save' : 'Add' }}
          </UIButton>
        </div>
        </form>
      </div>
    </Transition>
    <UIConfirmDialog
      :open="props.awaitingSignIn"
      :title="props.addError ? 'Authentication problem' : 'Waiting for sign-in'"
      :message="props.addError || 'Open Codex and sign in. The profile will be added automatically when authentication completes.'"
      confirm-label="Open Codex"
      cancel-label="Cancel"
      :secondary-label="props.addError ? 'Retry' : undefined"
      @confirm="emit('signIn')"
      @cancel="emit('cancelAdd')"
      @secondary="emit('retryAdd')"
    />
    <UIConfirmDialog
      :open="pendingSwitchProfile !== null"
      title="Switch profile?"
      :message="`Switch to ${pendingSwitchProfile?.name ?? ''}? VS Code will reload immediately.`"
      confirm-label="Switch"
      :confirm-pending="isSwitchPending"
      @confirm="confirmActivation"
      @cancel="cancelActivation"
    />
    <UIConfirmDialog
      :open="pendingDeleteProfile !== null"
      title="Delete profile?"
      :message="`Delete ${pendingDeleteProfile?.name ?? ''} from saved profiles? This cannot be undone.`"
      confirm-label="Delete"
      @confirm="confirmDeletion"
      @cancel="cancelDeletion"
    />
  </div>
</template>

<style scoped>
.profiles-view {
  box-sizing: border-box;
  display: flex;
  height: 100%;
  min-width: 320px;
  min-height: 0;
  flex-direction: column;
  padding: 6px;
  overflow: hidden;
}
.search-toolbar {
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 10px;
}
.search-card {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--vscode-widget-border);
  border-radius: 7px;
  background-color: var(--vscode-sideBar-background, var(--vscode-editor-background));
}
.search-card:focus-within { border-color: var(--vscode-focusBorder); }
.add-button {
  --button-background: var(--vscode-editor-background);
  --button-hover-background: var(--vscode-toolbar-hoverBackground);
  box-sizing: border-box;
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  border-color: var(--vscode-widget-border);
  border-radius: 7px;
}
.add-button :deep(.icon) { width: 18px; height: 18px; }
.search-input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 28px;
  padding: 4px 8px;
  color: var(--vscode-input-foreground);
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
}
.search-input::placeholder { color: var(--vscode-input-placeholderForeground); }
.clear-search-button {
  --button-foreground: var(--vscode-descriptionForeground);
  flex: 0 0 28px;
}
.clear-search-button:hover { --button-foreground: var(--vscode-errorForeground); }
.table-card {
  max-height: calc(100vh - 82px);
  overflow: auto;
  scrollbar-width: none;
  border: 1px solid var(--vscode-widget-border);
  border-radius: 7px;
  background: var(--vscode-editor-background);
}
.table-card::-webkit-scrollbar { display: none; }
.list-header {
  position: sticky;
  z-index: 5;
  top: 0;
  box-sizing: border-box;
  min-height: 36px;
  padding: 8px 12px;
  color: var(--vscode-descriptionForeground);
  border-bottom: 1px solid color-mix(in srgb, var(--vscode-widget-border) 70%, transparent);
  background-color: var(--vscode-sideBar-background, var(--vscode-editor-background));
  box-shadow: none;
  isolation: isolate;
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
  user-select: none;
}
.profile-item { border-bottom: 1px solid var(--vscode-widget-border); }
.profile-item:last-child { border-bottom: 0; }
.profile-row { position: relative; box-sizing: border-box; display: grid; min-height: 54px; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; padding: 12px; transition: background-color 120ms ease; }
.profile-row:has(.row-hit-target:hover) { background: var(--app-row-hover-background); }
.profile-item:has(.row-hit-target:hover) .usage-widgets { background: var(--app-row-hover-background); }
.row-hit-target { position: absolute; z-index: 0; inset: 0; padding: 0; border: 0; outline: none; background: transparent; cursor: default; }
.switchable .row-hit-target { cursor: pointer; }
.row-hit-target:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.identity { position: relative; z-index: 1; display: flex; min-width: 0; align-items: center; gap: 10px; overflow: hidden; pointer-events: none; }
.status-stack { display: flex; width: 12px; flex: 0 0 12px; align-items: center; justify-content: center; }
.dot { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: var(--vscode-descriptionForeground); }
.active .dot { background: var(--vscode-testing-iconPassed, #73c991); }
.expired .dot { background: var(--vscode-editorWarning-foreground, #cca700); }
.profile-copy { display: flex; min-width: 0; flex-direction: column; justify-content: center; gap: 2px; }
.name { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.meta { overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.usage-widgets { display: flex; min-width: 0; flex-direction: column; gap: 8px; padding: 0 12px 12px; background: transparent; transition: background-color 120ms ease; }
.usage-expand-enter-active, .usage-expand-leave-active { max-height: 360px; overflow: hidden; transition: max-height 220ms ease, opacity 160ms ease, transform 180ms ease, padding-bottom 220ms ease; }
.usage-expand-enter-from, .usage-expand-leave-to { max-height: 0; padding-bottom: 0; opacity: 0; transform: translateY(-4px); }
.usage-widget { position: relative; box-sizing: border-box; display: grid; width: 100%; min-width: 0; overflow: hidden; grid-template-columns: minmax(0, 1fr) minmax(72px, 120px) max-content; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--vscode-widget-border); border-radius: 7px; background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); }
.usage-placeholder { min-height: 66px; grid-template-columns: minmax(0, 1fr); }
.usage-widget.refreshing::before { position: absolute; z-index: 1; inset: 0; content: ''; pointer-events: none; background: var(--vscode-list-hoverBackground, var(--vscode-toolbar-hoverBackground)); opacity: .6; transition: opacity 320ms ease; will-change: opacity; }
@starting-style { .usage-widget.refreshing::before { opacity: 0; } }
.usage-widget.refreshing::after { position: absolute; z-index: 2; top: 0; bottom: 0; left: -82%; width: 72%; content: ''; pointer-events: none; background: var(--vscode-list-hoverBackground, var(--vscode-toolbar-hoverBackground)); opacity: 0; mask-image: linear-gradient(90deg, transparent 0%, rgb(0 0 0 / 18%) 34%, rgb(0 0 0 / 72%) 68%, black 100%); transform: translate3d(0, 0, 0); will-change: transform, opacity; animation: usage-shimmer 2.2s linear infinite; }
.usage-widget.refreshing.shimmer-fading::before { opacity: 0; }
.usage-widget.refreshing.shimmer-fading::after { animation: none; opacity: 0; }
@keyframes usage-shimmer {
  0% { opacity: 0; transform: translate3d(0, 0, 0); }
  10% { opacity: .45; }
  50% { opacity: 1; }
  90% { opacity: .45; }
  100% { opacity: 0; transform: translate3d(254%, 0, 0); }
}
.usage-copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.usage-title { overflow: hidden; color: var(--vscode-foreground); font-size: var(--vscode-font-size); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.usage-track { display: block; width: 100%; height: 8px; overflow: hidden; border-radius: 4px; background: rgb(127 127 127 / 18%); }
.usage-fill { display: block; height: 100%; border-radius: inherit; background: var(--vscode-foreground); opacity: .72; transition: width 560ms cubic-bezier(.22, 1, .36, 1); }
.usage-remaining { min-width: 0; overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 11px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.usage-reset { overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 380px) {
  .usage-widget { grid-template-columns: minmax(0, 1fr) 58px; gap: 10px; }
  .usage-track { grid-row: 2; grid-column: 1 / -1; }
  .usage-remaining { grid-row: 1; grid-column: 2; }
}
@media (prefers-reduced-motion: reduce) {
  .usage-expand-enter-active, .usage-expand-leave-active { transition: none; }
  .usage-widget.refreshing::before { animation: none; opacity: 1; }
  .usage-widget.refreshing::after { display: none; }
}
.empty { padding: 14px 10px; color: var(--vscode-descriptionForeground); text-align: center; }
.backdrop {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(0 0 0 / 48%);
}
.provider-dialog {
  box-sizing: border-box;
  display: flex;
  width: min(100%, 360px);
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  color: var(--vscode-foreground);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 8px;
  background: var(--vscode-editorWidget-background);
  box-shadow: 0 10px 32px rgb(0 0 0 / 32%);
}
.dialog-title { margin: 0 0 2px; font-size: 15px; font-weight: 600; }
.field { position: relative; display: flex; flex-direction: column; gap: 5px; }
.field-label { color: var(--vscode-descriptionForeground); font-size: 11px; font-weight: 600; }
.field-input {
  box-sizing: border-box;
  width: 100%;
  height: 38px;
  padding: 6px 10px;
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 7px;
  outline: none;
  background: var(--vscode-editor-background);
  font: inherit;
}
.field-input:focus { border-color: var(--vscode-focusBorder); }
.field-input[aria-invalid="true"] { border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground)); }
.field-error { position: absolute; z-index: 2; top: calc(100% + 5px); left: var(--error-left, 0); box-sizing: border-box; display: block; width: var(--error-width, 100%); max-width: 100%; padding: 6px 8px; color: var(--vscode-inputValidation-errorForeground, var(--vscode-errorForeground)); border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground)); border-radius: 4px; background: var(--vscode-inputValidation-errorBackground, var(--vscode-editorHoverWidget-background, var(--vscode-editorWidget-background))); box-shadow: 0 4px 12px rgb(0 0 0 / 24%); font-size: 11px; line-height: 1.35; pointer-events: none; }
.field-error::before { position: absolute; top: -5px; left: 25%; width: 8px; height: 8px; content: ''; border-top: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground)); border-left: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground)); background: var(--vscode-inputValidation-errorBackground, var(--vscode-editorHoverWidget-background, var(--vscode-editorWidget-background))); transform: rotate(45deg); }
.field-error-enter-active, .field-error-leave-active { transition: opacity 120ms ease, transform 120ms ease; }
.field-error-enter-from, .field-error-leave-to { opacity: 0; transform: translateY(-3px); }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.provider-layer-enter-active { transition: opacity 180ms ease; }
.provider-layer-leave-active { transition: opacity 140ms ease; }
.provider-layer-enter-active .provider-dialog { transition: opacity 180ms ease, transform 180ms ease; }
.provider-layer-leave-active .provider-dialog { transition: opacity 140ms ease, transform 140ms ease; }
.provider-layer-enter-from, .provider-layer-leave-to { opacity: 0; }
.provider-layer-enter-from .provider-dialog, .provider-layer-leave-to .provider-dialog { opacity: 0; transform: translateY(5px) scale(.98); }
@media (prefers-reduced-motion: reduce) {
  .field-error-enter-active, .field-error-leave-active, .provider-layer-enter-active, .provider-layer-leave-active, .provider-layer-enter-active .provider-dialog, .provider-layer-leave-active .provider-dialog { transition: none; }
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
