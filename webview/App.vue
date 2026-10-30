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
.app { min-width: 240px; height: 100vh; overflow-x: auto; color: var(--color-text-primary); background: var(--color-bg-canvas); }
.message { margin: 0; padding: 12px; color: var(--color-text-secondary); line-height: 1.45; }
.error { color: var(--color-icon-button-danger-foreground); }
</style>
