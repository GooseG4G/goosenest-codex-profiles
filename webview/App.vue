<script setup lang="ts">
import ProfileTable from './components/ProfileTable.vue'
import { useAuthProfiles } from './composables/useAuthProfiles'

const {
  profiles, error, awaitingSignIn, addError,
  activationFailureCount, activationWaitingProfileId, providerUpdateCount,
  activate, deleteProfile, beginAdd, addProvider, updateProvider, cancelAdd, signIn, retryAdd, setExpandedUsage,
  reauthenticate,
} = useAuthProfiles()
</script>

<template>
  <main class="app">
    <p v-if="error && !error.toLocaleLowerCase().includes('provider named')" class="message error">{{ error }}</p>
    <ProfileTable
      :profiles="profiles"
      :error="error"
      :awaiting-sign-in="awaitingSignIn"
      :add-error="addError"
      :activation-failure-count="activationFailureCount"
      :activation-waiting-profile-id="activationWaitingProfileId"
      :provider-update-count="providerUpdateCount"
      @activate="activate"
      @delete="deleteProfile"
      @begin-add="beginAdd"
      @add-provider="addProvider"
      @update-provider="updateProvider"
      @cancel-add="cancelAdd"
      @sign-in="signIn"
      @retry-add="retryAdd"
      @reauthenticate="reauthenticate"
      @expanded-usage-change="setExpandedUsage"
    />
  </main>
</template>

<style scoped>
:global(html), :global(body), :global(#app) { box-sizing: border-box; width: 100%; height: 100%; padding: 0; margin: 0; }
.app { --app-row-hover-background: color-mix(in srgb, var(--vscode-list-hoverBackground) 55%, transparent); min-width: 240px; height: 100vh; overflow-x: auto; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
.message { margin: 0; padding: 12px; color: var(--vscode-descriptionForeground); line-height: 1.45; }
.error { color: var(--vscode-errorForeground); }
</style>
