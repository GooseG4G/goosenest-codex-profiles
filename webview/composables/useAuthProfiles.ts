import { computed, onMounted, onUnmounted, readonly, shallowRef } from 'vue'
import type { Profile, ProviderDraft } from '../types'

const vscode = acquireVsCodeApi()

export function useAuthProfiles() {
  const profiles = shallowRef<Profile[]>(window.__CODEX_PROFILES_INITIAL_STATE__?.profiles ?? [])
  const error = shallowRef('')
  const awaitingSignIn = shallowRef(window.__CODEX_PROFILES_INITIAL_STATE__?.awaitingSignIn ?? false)
  const addError = shallowRef(window.__CODEX_PROFILES_INITIAL_STATE__?.addError ?? '')
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
    addError: readonly(addError),
    activate: (id: string) => post('activate', { id }),
    deleteProfile: (id: string) => post('delete', { id }),
    beginAdd: () => post('beginAdd'),
    addProvider: (draft: ProviderDraft) => post('addProvider', draft),
    cancelAdd: () => post('cancelAdd'),
    signIn: () => post('signIn'),
    retryAdd: () => post('retryAdd'),
  }
}
