<script setup lang="ts">
import ProfileTable from './components/ProfileTable.vue'
import { useAuthProfiles } from './composables/useAuthProfiles'

const { profiles, error, activate, deleteProfile } = useAuthProfiles()
</script>

<template>
  <main class="app">
    <p v-if="error" class="message error">{{ error }}</p>
    <p v-if="!profiles.length" class="message">auth.json was not found. Sign in to Codex and refresh this view.</p>
    <ProfileTable v-else :profiles="profiles" @activate="activate" @delete="deleteProfile" />
  </main>
</template>

<style scoped>
.app { height: 100vh; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
.message { margin: 0; padding: 12px; color: var(--vscode-descriptionForeground); line-height: 1.45; }
.error { color: var(--vscode-errorForeground); }
</style>
