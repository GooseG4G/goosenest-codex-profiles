<script setup lang="ts">
import ProfileTable from './components/ProfileTable.vue'
import { useAuthProfiles } from './composables/useAuthProfiles'

const {
  profiles, error, awaitingSignIn, addError,
  activate, deleteProfile, beginAdd, addProvider, cancelAdd, signIn, retryAdd,
} = useAuthProfiles()
</script>

<template>
  <main class="app">
    <p v-if="error" class="message error">{{ error }}</p>
    <ProfileTable
      :profiles="profiles"
      :awaiting-sign-in="awaitingSignIn"
      :add-error="addError"
      @activate="activate"
      @delete="deleteProfile"
      @begin-add="beginAdd"
      @add-provider="addProvider"
      @cancel-add="cancelAdd"
      @sign-in="signIn"
      @retry-add="retryAdd"
    />
  </main>
</template>

<style scoped>
.app { height: 100vh; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
.message { margin: 0; padding: 12px; color: var(--vscode-descriptionForeground); line-height: 1.45; }
.error { color: var(--vscode-errorForeground); }
</style>
