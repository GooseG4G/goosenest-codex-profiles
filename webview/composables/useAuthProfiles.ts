import { computed, onMounted, onUnmounted, readonly, shallowRef } from 'vue'
import type { Profile, ProviderDraft } from '../types'
import { vscode } from '../vscode'

export function useAuthProfiles() {
  const profiles = shallowRef<Profile[]>(window.__CODEX_PROFILES_INITIAL_STATE__?.profiles ?? [])
  const error = shallowRef('')
  const awaitingSignIn = shallowRef(window.__CODEX_PROFILES_INITIAL_STATE__?.awaitingSignIn ?? false)
  const addError = shallowRef(window.__CODEX_PROFILES_INITIAL_STATE__?.addError ?? '')
  const activationFailureCount = shallowRef(0)
  const activationWaitingProfileId = shallowRef<string | null>(null)
  const orderedProfiles = computed(() => [...profiles.value].sort((left, right) => Number(right.active) - Number(left.active)))

  function post(type: string, payload: object = {}) {
    error.value = ''
    vscode.postMessage({ type, ...payload })
  }

  function handleMessage(event: MessageEvent) {
    const message = event.data
    if (message.type === 'state') {
      profiles.value = message.profiles
      awaitingSignIn.value = Boolean(message.awaitingSignIn)
      addError.value = String(message.addError || '')
    } else if (message.type === 'error') {
      error.value = String(message.message || 'Unknown error')
    } else if (message.type === 'activationFailed') {
      activationWaitingProfileId.value = null
      activationFailureCount.value += 1
    } else if (message.type === 'activationWaiting') {
      activationWaitingProfileId.value = String(message.id || '') || null
    }
  }

  onMounted(() => {
    window.addEventListener('message', handleMessage)
    post('ready')
    delete window.__CODEX_PROFILES_INITIAL_STATE__
  })
  onUnmounted(() => window.removeEventListener('message', handleMessage))

  return {
    profiles: readonly(orderedProfiles), error: readonly(error), awaitingSignIn: readonly(awaitingSignIn),
    addError: readonly(addError), activationFailureCount: readonly(activationFailureCount),
    activationWaitingProfileId: readonly(activationWaitingProfileId),
    activate: (id: string) => post('activate', { id }),
    deleteProfile: (id: string) => post('delete', { id }),
    beginAdd: () => post('beginAdd'),
    addProvider: (draft: ProviderDraft) => post('addProvider', draft),
    cancelAdd: () => post('cancelAdd'),
    signIn: () => post('signIn'),
    retryAdd: () => post('retryAdd'),
    setExpandedUsage: (ids: string[]) => post('setExpandedUsage', { ids }),
  }
}
