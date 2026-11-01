<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef, watch, type CSSProperties } from 'vue'
import type { Profile, ProviderDraft, ProviderTransport, ProviderUpdate } from '../types'
import UIConfirmDialog from './ui/UIConfirmDialog.vue'
import DeviceAuthDialog from './DeviceAuthDialog.vue'
import UISearch from './ui/UISearch.vue'
import UIToolbarButton from './ui/UIToolbarButton.vue'
import ProfileListItem from './ProfileListItem.vue'
import UICancelButton from './ui/UICancelButton.vue'
import UIConfirmButton from './ui/UIConfirmButton.vue'
import { vscode } from '../vscode'
import { UserRoundPlus, UsersRound, X } from '@lucide/vue'

const props = defineProps<{
  profiles: readonly Profile[]
  error: string
  awaitingSignIn: boolean
  addError: string
  deviceAuth: { userCode: string; verificationUrl: string; error?: string } | null
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
  copyDeviceCode: []
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
const providerTransport = shallowRef<ProviderTransport>('responses')
const initialProviderName = shallowRef('')
const initialProviderBaseUrl = shallowRef('')
const initialProviderTransport = shallowRef<ProviderTransport>('responses')
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
  || providerTransport.value !== initialProviderTransport.value
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
  initialProviderTransport.value = 'responses'
}

function openProviderEditor(profile: Profile, event?: MouseEvent) {
  event?.stopPropagation()
  if (event?.currentTarget instanceof HTMLElement) event.currentTarget.blur()
  editingProviderId.value = profile.id
  providerName.value = profile.name
  providerBaseUrl.value = profile.baseUrl ?? ''
  providerToken.value = ''
  providerTransport.value = profile.transport ?? 'responses'
  initialProviderName.value = profile.name.trim()
  initialProviderBaseUrl.value = (profile.baseUrl ?? '').trim()
  initialProviderTransport.value = providerTransport.value
  showProviderBaseUrlError.value = false
  isProviderFormOpen.value = true
}

function closeProviderForm() {
  isProviderFormOpen.value = false
  providerName.value = ''
  providerBaseUrl.value = ''
  providerToken.value = ''
  providerTransport.value = 'responses'
  initialProviderTransport.value = 'responses'
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
    transport: providerTransport.value,
  }
  if (editingProviderId.value) {
    emit('updateProvider', { id: editingProviderId.value, ...draft })
  } else {
    emit('addProvider', draft)
  }
}

function isProfileExpanded(profile: Profile) {
  return expandedUsageIds.value.has(profile.id)
}

function toggleProfileDetails(profile: Profile, event?: MouseEvent | KeyboardEvent) {
  if (event instanceof MouseEvent && event.detail > 0 && event.currentTarget instanceof HTMLElement) event.currentTarget.blur()
  const opening = !expandedUsageIds.value.has(profile.id)
  expandedUsageIds.value = opening ? new Set([profile.id]) : new Set()
}

function publishExpandedUsage() {
  const expandedDefaultProfileIds = [...expandedUsageIds.value].filter((id) =>
    props.profiles.some((profile) => profile.id === id && profile.kind !== 'provider'),
  )
  emit('expandedUsageChange', document.hidden ? [] : expandedDefaultProfileIds)
}

function persistUiState() {
  vscode.setState({ query: query.value, expandedUsageIds: [...expandedUsageIds.value] })
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

watch(
  () => props.profiles.find((profile) => profile.active)?.id ?? null,
  (activeId) => {
    if (activeId && pendingSwitchProfile.value?.id === activeId) {
      pendingSwitchProfile.value = null
      isSwitchPending.value = false
    }
  },
)

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
  emit('expandedUsageChange', [])
})
</script>

<template>
  <div class="profiles-view">
    <div class="search-toolbar">
      <div class="search-card">
        <UISearch
          v-model="query"
          id="profile-search"
          accessible-label="Search profiles by email"
          placeholder="Search..."
          autocomplete="off"
          spellcheck="false"
        />
        <UIToolbarButton
          v-if="query"
          accessible-label="Clear search"
          title="Clear search"
          class="clear-search-button"
          size="small"
          @click="query = ''"
        ><template #icon><X /></template></UIToolbarButton>
      </div>
      <UIToolbarButton
        accessible-label="Add profile"
        title="Add profile"
        @click="isAddPending = true"
      ><template #icon><UserRoundPlus /></template></UIToolbarButton>
      <UIToolbarButton
        accessible-label="Add provider"
        title="Add provider"
        @click="openProviderForm"
      ><template #icon><UsersRound /></template></UIToolbarButton>
    </div>

    <div class="table-card">
      <div class="list-header">Profiles</div>
      <div class="profile-list">
        <ProfileListItem
          v-for="profile in visibleProfiles"
          :key="profile.id"
          :profile="profile"
          :expanded="isProfileExpanded(profile)"
          @activate="requestActivation(profile)"
          @edit="openProviderEditor(profile, $event)"
          @delete="requestDeletion(profile)"
          @toggle-details="toggleProfileDetails(profile, $event)"
        />
        <div v-if="!visibleProfiles.length" class="empty">
          {{ props.profiles.length ? 'No profiles found' : 'No profiles yet' }}
        </div>
      </div>
    </div>

    <UIConfirmDialog
      :open="pendingReauthProfile !== null"
      title="Authentication expired"
      :description="`Authentication for ${pendingReauthProfile?.name ?? 'this profile'} has expired. Sign in again to refresh it.`"
      confirm-label="Re-authenticate"
      @confirm="confirmReauth"
      @close="pendingReauthProfile = null"
    />
    <UIConfirmDialog
      :open="isAddPending"
      title="Add OpenAI profile?"
      description="An isolated device-code sign-in will run in the background. The current profile and running chats will not be changed."
      confirm-label="Continue"
      @confirm="confirmAdd"
      @close="isAddPending = false"
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
        <fieldset class="field transport-field">
          <legend class="field-label">Transport</legend>
          <div class="transport-switch" role="group" aria-label="Provider transport">
            <span
              class="transport-selection"
              :class="{ websocket: providerTransport === 'websocket' }"
              aria-hidden="true"
            />
            <button
              type="button"
              class="transport-option"
              :class="{ selected: providerTransport === 'responses' }"
              :aria-pressed="providerTransport === 'responses'"
              @click="providerTransport = 'responses'"
            >HTTP/SSE</button>
            <button
              type="button"
              class="transport-option"
              :class="{ selected: providerTransport === 'websocket' }"
              :aria-pressed="providerTransport === 'websocket'"
              @click="providerTransport = 'websocket'"
            >WebSocket</button>
          </div>
        </fieldset>
        <div class="actions">
          <UICancelButton @click="closeProviderForm" />
          <UIConfirmButton
            type="submit"
            :disabled="!canAddProvider"
          >
            {{ editingProviderId ? 'Save' : 'Add' }}
          </UIConfirmButton>
        </div>
        </form>
      </div>
    </Transition>
    <DeviceAuthDialog
      :open="props.awaitingSignIn"
      :user-code="props.deviceAuth?.userCode"
      :verification-url="props.deviceAuth?.verificationUrl"
      :error="props.deviceAuth?.error || props.addError"
      @open-browser="emit('signIn')"
      @copy-code="emit('copyDeviceCode')"
      @cancel="emit('cancelAdd')"
      @retry="emit('retryAdd')"
    />
    <UIConfirmDialog
      :open="pendingSwitchProfile !== null"
      title="Switch profile?"
      :description="`Use ${pendingSwitchProfile?.name ?? ''} for new Codex requests? Existing WebSocket connections remain pinned to their current profile.`"
      confirm-label="Switch"
      :pending="isSwitchPending"
      @confirm="confirmActivation"
      @close="cancelActivation"
    />
    <UIConfirmDialog
      :open="pendingDeleteProfile !== null"
      title="Delete profile?"
      :description="`Delete ${pendingDeleteProfile?.name ?? ''} from saved profiles? This cannot be undone.`"
      confirm-label="Delete"
      @confirm="confirmDeletion"
      @close="cancelDeletion"
    />
  </div>
</template>

<style scoped>
.profiles-view {
  box-sizing: border-box;
  display: flex;
  height: 100%;
  min-width: 240px;
  min-height: 0;
  flex-direction: column;
  padding: 6px 12px;
  overflow: hidden;
}
.search-toolbar {
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 10px;
}
.search-card {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
}
.search-card :deep(.search-field) { width: 100%; }
.clear-search-button {
  position: absolute;
  z-index: 1;
  top: 9px;
  right: 8px;
  width: 28px;
  height: 28px;
}
.clear-search-button :deep(.toolbar-button-surface) { border-color: transparent; background: transparent; }
.table-card {
  max-height: calc(100vh - 82px);
  overflow: auto;
  overflow-anchor: none;
  scrollbar-width: none;
  border: 1px solid var(--color-border-default);
  border-radius: 7px;
  background: var(--color-bg-sunken);
}
.table-card::-webkit-scrollbar { display: none; }
.list-header {
  position: sticky;
  z-index: 5;
  top: 0;
  box-sizing: border-box;
  min-height: 36px;
  padding: 8px 12px;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border-default);
  background-color: var(--color-bg-table-header);
  box-shadow: none;
  isolation: isolate;
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
  user-select: none;
}
.empty { padding: 14px 10px; color: var(--color-text-secondary); text-align: center; }
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
  color: var(--vscode-foreground, var(--color-text-primary));
  border: 1px solid var(--vscode-widget-border, var(--color-border-default));
  border-radius: 8px;
  background: var(--vscode-editorWidget-background, var(--color-bg-dialog));
  box-shadow: 0 10px 32px rgb(0 0 0 / 32%);
}
.dialog-title { margin: 0 0 2px; font-size: 15px; font-weight: 600; }
.field { position: relative; display: flex; flex-direction: column; gap: 5px; }
.field-label { color: var(--vscode-descriptionForeground, var(--color-text-secondary)); font-size: 11px; font-weight: 600; }
.transport-field { min-width: 0; margin: 0; padding: 0; border: 0; }
.transport-field > .field-label { margin-bottom: 5px; }
.transport-switch { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 2px; border: 1px solid var(--vscode-widget-border, var(--color-border-default)); border-radius: 999px; background: var(--vscode-input-background, var(--color-bg-surface)); }
.transport-selection { position: absolute; z-index: 0; top: 2px; bottom: 2px; left: 2px; width: calc(50% - 3px); border-radius: 999px; background: var(--vscode-button-background, var(--color-button-primary-background)); box-shadow: 0 1px 2px rgb(0 0 0 / 22%); transition: transform 220ms cubic-bezier(.22,1,.36,1); }
.transport-selection.websocket { transform: translateX(calc(100% + 2px)); }
.transport-option { position: relative; z-index: 1; min-height: 32px; padding: 5px 10px; color: var(--vscode-descriptionForeground, var(--color-text-secondary)); border: 0; border-radius: 999px; outline: none; background: transparent; cursor: pointer; font-size: 11px; transition: color 140ms ease, transform 180ms cubic-bezier(.22,1,.36,1); }
.transport-option.selected { color: var(--vscode-button-foreground, var(--color-text-on-emphasis)); }
.transport-option:hover:not(.selected) { color: var(--vscode-foreground, var(--color-text-primary)); background: transparent; }
.transport-option:active { transform: scale(.98); }
.transport-option:focus-visible { box-shadow: inset 0 0 0 1px var(--vscode-focusBorder); }
.field-input {
  box-sizing: border-box;
  width: 100%;
  height: 38px;
  padding: 6px 10px;
  color: var(--vscode-input-foreground, var(--color-text-primary));
  border: 1px solid var(--vscode-widget-border, var(--color-border-default));
  border-radius: 7px;
  outline: none;
  background: var(--vscode-input-background, var(--color-bg-surface));
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
  .field-error-enter-active, .field-error-leave-active, .provider-layer-enter-active, .provider-layer-leave-active, .provider-layer-enter-active .provider-dialog, .provider-layer-leave-active .provider-dialog, .transport-selection, .transport-option { transition: none; }
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
