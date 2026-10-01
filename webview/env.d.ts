declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

declare function acquireVsCodeApi(): { postMessage(message: unknown): void }

interface Window {
  __CODEX_PROFILES_INITIAL_STATE__?: {
    profiles: Array<{ id: string; name: string; active: boolean }>
  }
}
