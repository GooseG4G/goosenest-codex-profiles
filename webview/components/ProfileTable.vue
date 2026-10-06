<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import type { Profile, ProviderDraft } from '../types'
import TrashIcon from './icons/TrashIcon.vue'
import PersonAddIcon from './icons/PersonAddIcon.vue'
import UsersIcon from './icons/UsersIcon.vue'
import CloseIcon from './icons/CloseIcon.vue'
import ChevronIcon from './icons/ChevronIcon.vue'
import UIConfirmDialog from './ui/UIConfirmDialog.vue'
import UIIconButton from './ui/UIIconButton.vue'
import UIButton from './ui/UIButton.vue'

const props = defineProps<{
  profiles: readonly Profile[]
  awaitingSignIn: boolean
  addError: string
  activationFailureCount: number
  activationWaitingProfileId: string | null
}>()
const emit = defineEmits<{
  activate: [id: string]
  delete: [id: string]
  beginAdd: []
  addProvider: [draft: ProviderDraft]
  cancelAdd: []
  signIn: []
  retryAdd: []
}>()

const query = shallowRef('')
const pendingSwitchProfile = shallowRef<Profile | null>(null)
const isSwitchPending = shallowRef(false)
const pendingDeleteProfile = shallowRef<Profile | null>(null)
const isAddPending = shallowRef(false)
const isProviderFormOpen = shallowRef(false)
const providerName = shallowRef('')
const providerBaseUrl = shallowRef('')
const providerToken = shallowRef('')
const providerNameInput = useTemplateRef<HTMLInputElement>('providerNameInput')
const providerBaseUrlInput = useTemplateRef<HTMLInputElement>('providerBaseUrlInput')
const showProviderBaseUrlError = shallowRef(false)
const expandedUsageIds = shallowRef<Set<string>>(new Set())
const visibleProfiles = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase()
  if (!normalizedQuery) return props.profiles
  return props.profiles.filter((profile) =>
    [profile.name, profile.provider, profile.baseUrl, profile.envKey]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
  )
})
const canAddProvider = computed(() =>
  providerName.value.trim() !== '' && providerBaseUrl.value.trim() !== '' && providerToken.value.trim() !== ''
)
const hasOpenOverlay = computed(() =>
  isProviderFormOpen.value
  || isAddPending.value
  || props.awaitingSignIn
  || pendingSwitchProfile.value !== null
  || pendingDeleteProfile.value !== null
)

function requestActivation(profile: Profile) {
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
  if (profile.active) return
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

function blurActiveElement() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

function openProviderForm(event?: MouseEvent) {
  if (event?.currentTarget instanceof HTMLElement) event.currentTarget.blur()
  isProviderFormOpen.value = true
}

function closeProviderForm() {
  isProviderFormOpen.value = false
  providerName.value = ''
  providerBaseUrl.value = ''
  providerToken.value = ''
  showProviderBaseUrlError.value = false
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
  if (!canAddProvider.value) return
  if (!isValidProviderBaseUrl(providerBaseUrl.value.trim())) {
    showProviderBaseUrlError.value = true
    providerBaseUrlInput.value?.focus()
    return
  }
  emit('addProvider', {
    name: providerName.value.trim(),
    baseUrl: providerBaseUrl.value.trim(),
    token: providerToken.value.trim(),
  })
  closeProviderForm()
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

function toggleUsage(profile: Profile, event: MouseEvent) {
  if (event.detail > 0 && event.currentTarget instanceof HTMLElement) event.currentTarget.blur()
  const next = new Set(expandedUsageIds.value)
  if (next.has(profile.id)) next.delete(profile.id)
  else next.add(profile.id)
  expandedUsageIds.value = next
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

onMounted(() => window.addEventListener('keydown', handleUsageKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', handleUsageKeydown)
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
            :class="{ active: profile.active, switchable: !profile.active }"
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
            <div class="action">
              <UIIconButton
                v-if="!profile.active"
                accessible-label="Delete profile"
                class="delete-button"
                background="hover"
                surface-motion="scale"
                icon-motion="together"
                size="small"
                tone="danger"
                @click.stop="requestDeletion(profile)"
              >
                <template #icon><TrashIcon /></template>
              </UIIconButton>
              <span
                v-if="!profile.active"
                class="action-divider"
                aria-hidden="true"
              />
              <UIIconButton
                :accessible-label="getUsageWindows(profile).length === 0 ? 'Usage limits unavailable' : isUsageExpanded(profile) ? 'Hide usage limits' : 'Show usage limits'"
                :title="getUsageWindows(profile).length === 0 ? 'Usage limits unavailable' : isUsageExpanded(profile) ? 'Hide' : 'Show'"
                :disabled="getUsageWindows(profile).length === 0"
                class="usage-toggle"
                background="hover"
                surface-motion="scale"
                icon-motion="together"
                size="small"
                @click.stop="toggleUsage(profile, $event)"
                @keydown.stop
              >
                <template #icon><ChevronIcon :expanded="isUsageExpanded(profile)" /></template>
              </UIIconButton>
            </div>
          </div>
          <div v-if="isUsageExpanded(profile)" class="usage-widgets">
            <section v-for="window in getUsageWindows(profile)" :key="window.label" class="usage-widget">
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
          </div>
        </article>
        <div v-if="!visibleProfiles.length" class="empty">
          {{ props.profiles.length ? 'No profiles found' : 'No profiles yet' }}
        </div>
      </div>
    </div>

    <UIConfirmDialog
      :open="isAddPending"
      title="Add OpenAI profile?"
      message="The current profile will remain saved. VS Code will reload and wait for another Codex sign-in."
      confirm-label="Continue"
      @confirm="confirmAdd"
      @cancel="isAddPending = false"
    />
    <div
      v-if="isProviderFormOpen"
      class="backdrop"
      @click.self="closeProviderForm"
      @keydown.esc.stop.prevent="closeProviderForm"
    >
      <form class="provider-dialog" novalidate @submit.prevent="submitProvider">
        <h2 class="dialog-title">Add provider</h2>
        <label class="field">
          <span class="field-label">Name</span>
          <input ref="providerNameInput" v-model="providerName" class="field-input" type="text" autocomplete="off">
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
          <span
            v-if="showProviderBaseUrlError"
            id="provider-base-url-error"
            class="field-error"
            role="alert"
          >Please enter a URL.</span>
        </label>
        <label class="field">
          <span class="field-label">Token</span>
          <input v-model="providerToken" class="field-input" type="password" autocomplete="off">
        </label>
        <div class="actions">
          <UIButton @click="closeProviderForm">Cancel</UIButton>
          <UIButton
            type="submit"
            variant="primary"
            :disabled="!canAddProvider"
            :tooltip="canAddProvider ? undefined : 'Action unavailable'"
          >
            Add
          </UIButton>
        </div>
      </form>
    </div>
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
  padding: 10px;
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
  background: var(--vscode-editor-background);
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
  z-index: 1;
  top: 0;
  box-sizing: border-box;
  min-height: 30px;
  padding: 5px 12px;
  color: var(--vscode-descriptionForeground);
  border-bottom: 1px solid var(--vscode-widget-border);
  background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
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
.usage-toggle { --button-foreground: var(--vscode-descriptionForeground); opacity: 1; }
.usage-toggle :deep(.icon) { width: 16px; height: 16px; }
.profile-copy { display: flex; min-width: 0; flex-direction: column; justify-content: center; gap: 2px; }
.name { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.meta { overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.action { position: relative; z-index: 1; display: grid; grid-template-columns: 28px 8px 28px; align-items: center; justify-content: flex-end; white-space: nowrap; }
.action-divider { width: 1px; height: 16px; grid-column: 2; justify-self: center; background: var(--vscode-widget-border); }
.action .delete-button { grid-column: 1; }
.action .usage-toggle { grid-column: 3; }
.usage-toggle:disabled { cursor: not-allowed; }
.usage-widgets { display: flex; min-width: 0; flex-direction: column; gap: 8px; padding: 0 12px 12px; background: transparent; transition: background-color 120ms ease; }
.usage-widget { box-sizing: border-box; display: grid; width: 100%; min-width: 0; overflow: hidden; grid-template-columns: minmax(0, 1fr) minmax(72px, 120px) max-content; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--vscode-widget-border); border-radius: 7px; background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); }
.usage-copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.usage-title { overflow: hidden; color: var(--vscode-foreground); font-size: var(--vscode-font-size); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.usage-track { display: block; width: 100%; height: 8px; overflow: hidden; border-radius: 4px; background: rgb(127 127 127 / 18%); }
.usage-fill { display: block; height: 100%; border-radius: inherit; background: var(--vscode-foreground); opacity: .72; transition: width 180ms ease; }
.usage-remaining { min-width: 0; overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 11px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.usage-reset { overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 380px) {
  .usage-widget { grid-template-columns: minmax(0, 1fr) 58px; gap: 10px; }
  .usage-track { grid-row: 2; grid-column: 1 / -1; }
  .usage-remaining { grid-row: 1; grid-column: 2; }
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
.field { display: flex; flex-direction: column; gap: 5px; }
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
.field-error { padding: 6px 8px; color: var(--vscode-inputValidation-errorForeground, var(--vscode-errorForeground)); border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground)); border-radius: 4px; background: var(--vscode-inputValidation-errorBackground, var(--vscode-editorHoverWidget-background, var(--vscode-editorWidget-background))); font-size: 11px; line-height: 1.35; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
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
