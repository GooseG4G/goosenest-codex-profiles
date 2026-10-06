<script setup lang="ts">
import { computed, onUnmounted, shallowRef, watch } from 'vue'
import type { Profile, ProviderDraft } from '../types'
import TrashIcon from './icons/TrashIcon.vue'
import PersonAddIcon from './icons/PersonAddIcon.vue'
import UsersIcon from './icons/UsersIcon.vue'
import CloseIcon from './icons/CloseIcon.vue'
import UIConfirmDialog from './ui/UIConfirmDialog.vue'
import UIIconButton from './ui/UIIconButton.vue'
import UIButton from './ui/UIButton.vue'

const props = defineProps<{ profiles: readonly Profile[]; awaitingSignIn: boolean; addError: string }>()
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
const pendingDeleteProfile = shallowRef<Profile | null>(null)
const isAddPending = shallowRef(false)
const isProviderFormOpen = shallowRef(false)
const providerName = shallowRef('')
const providerBaseUrl = shallowRef('')
const providerToken = shallowRef('')
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

function requestActivation(profile: Profile) {
  if (profile.active) return
  pendingSwitchProfile.value = profile
}

function cancelActivation() {
  pendingSwitchProfile.value = null
}

function confirmActivation() {
  if (!pendingSwitchProfile.value) return
  const profileId = pendingSwitchProfile.value.id
  pendingSwitchProfile.value = null
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
  window.setTimeout(blurActiveElement, 0)
}

function submitProvider() {
  if (!canAddProvider.value) return
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

function handleProviderFormKeydown(event: KeyboardEvent) {
  if (!isProviderFormOpen.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeProviderForm()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    submitProvider()
  }
}

watch(isProviderFormOpen, (open) => {
  if (open) window.addEventListener('keydown', handleProviderFormKeydown)
  else window.removeEventListener('keydown', handleProviderFormKeydown)
})

onUnmounted(() => window.removeEventListener('keydown', handleProviderFormKeydown))
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
      <table class="table">
        <thead class="table-header">
          <tr>
            <th class="identity">Profile</th>
            <th class="action"><span class="visually-hidden">Action</span></th>
          </tr>
        </thead>
        <tbody>
        <tr
          v-for="profile in visibleProfiles"
          :key="profile.id"
          class="profile-row"
          :class="{ active: profile.active, switchable: !profile.active }"
          :tabindex="profile.active ? undefined : 0"
          @click="requestActivation(profile)"
          @keydown.enter="requestActivation(profile)"
          @keydown.space.prevent="requestActivation(profile)"
        >
          <td class="identity">
            <span class="dot" aria-hidden="true" />
            <span class="profile-copy">
              <span class="name">{{ profile.name }}</span>
              <span class="meta">{{ getProfileMeta(profile) }}</span>
            </span>
          </td>
          <td class="action">
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
          </td>
        </tr>
        <tr v-if="!visibleProfiles.length">
          <td class="empty" colspan="2">{{ props.profiles.length ? 'No profiles found' : 'No profiles yet' }}</td>
        </tr>
        </tbody>
      </table>
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
    >
      <form class="provider-dialog" @submit.prevent="submitProvider">
        <h2 class="dialog-title">Add provider</h2>
        <label class="field">
          <span class="field-label">Name</span>
          <input v-model="providerName" class="field-input" type="text" autocomplete="off" autofocus>
        </label>
        <label class="field">
          <span class="field-label">Base URL</span>
          <input v-model="providerBaseUrl" class="field-input" type="url" autocomplete="off">
        </label>
        <label class="field">
          <span class="field-label">Token</span>
          <input v-model="providerToken" class="field-input" type="password" autocomplete="off">
        </label>
        <div class="actions">
          <UIButton @click="closeProviderForm">Cancel</UIButton>
          <UIButton
            variant="primary"
            :disabled="!canAddProvider"
            :tooltip="canAddProvider ? undefined : 'Action unavailable'"
            @click="submitProvider"
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
.table { width: 100%; border-collapse: collapse; table-layout: auto; }
.table-header { position: sticky; top: 0; z-index: 1; background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); }
.table th {
  height: 30px;
  padding: 5px 10px;
  color: var(--vscode-descriptionForeground);
  border-bottom: 1px solid var(--vscode-widget-border);
  font-size: 11px;
  font-weight: 600;
  text-align: left;
  user-select: none;
}
.table td { height: 40px; padding: 7px 10px; border-bottom: 1px solid var(--vscode-widget-border); }
.table tr:last-child td { border-bottom: 0; }
.profile-row { transition: background-color 120ms ease; }
.profile-row:hover:not(:has(.delete-button:hover)) { background: var(--vscode-list-hoverBackground); }
.profile-row.switchable { cursor: pointer; }
.profile-row.switchable:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.identity { overflow: hidden; }
td.identity { display: flex; align-items: center; gap: 7px; }
.dot { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: var(--vscode-descriptionForeground); }
.active .dot { background: var(--vscode-testing-iconPassed, #73c991); }
.profile-copy { display: flex; min-width: 0; flex-direction: column; justify-content: center; gap: 2px; }
.name { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.meta { overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.action { width: 1%; text-align: right !important; white-space: nowrap; }
.empty { color: var(--vscode-descriptionForeground); text-align: center; }
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
