<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import type { Profile } from '../types'
import TrashIcon from './icons/TrashIcon.vue'
import UIConfirmDialog from './ui/UIConfirmDialog.vue'
import UIIconButton from './ui/UIIconButton.vue'

const props = defineProps<{ profiles: readonly Profile[] }>()
const emit = defineEmits<{ activate: [id: string]; delete: [id: string] }>()

const query = shallowRef('')
const pendingSwitchProfile = shallowRef<Profile | null>(null)
const pendingDeleteProfile = shallowRef<Profile | null>(null)
const visibleProfiles = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase()
  if (!normalizedQuery) return props.profiles
  return props.profiles.filter((profile) => profile.name.toLocaleLowerCase().includes(normalizedQuery))
})

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
</script>

<template>
  <div class="profiles-view">
    <div class="search-card">
      <label class="visually-hidden" for="profile-search">Search profiles by email</label>
      <input
        id="profile-search"
        v-model="query"
        class="search-input"
        type="search"
        placeholder="Search..."
        autocomplete="off"
        spellcheck="false"
      >
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
            <span class="name" :title="profile.name">{{ profile.name }}</span>
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
          <td class="empty" colspan="2">No profiles found</td>
        </tr>
        </tbody>
      </table>
    </div>

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
.search-card {
  margin-bottom: 10px;
  padding: 8px;
  border: 1px solid var(--vscode-widget-border);
  border-radius: 7px;
  background: var(--vscode-editor-background);
}
.search-card:focus-within { border-color: var(--vscode-focusBorder); }
.search-input {
  box-sizing: border-box;
  width: 100%;
  height: 28px;
  padding: 4px 8px;
  color: var(--vscode-input-foreground);
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
}
.search-input::placeholder { color: var(--vscode-input-placeholderForeground); }
.search-input::-webkit-search-cancel-button { cursor: pointer; }
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
.name { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.action { width: 1%; text-align: right !important; white-space: nowrap; }
.empty { color: var(--vscode-descriptionForeground); text-align: center; }
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
