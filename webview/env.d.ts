declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

declare function acquireVsCodeApi<State = unknown>(): {
  postMessage(message: unknown): void
  getState(): State | undefined
  setState(state: State): void
}

interface Window {
  __CODEX_PROFILES_INITIAL_STATE__?: {
    profiles: Array<{
      id: string
      kind: 'default' | 'provider'
      name: string
      active: boolean
      baseUrl?: string
      envKey?: string
      provider?: string
    }>
    awaitingSignIn?: boolean
    addError?: string | null
  }
}
