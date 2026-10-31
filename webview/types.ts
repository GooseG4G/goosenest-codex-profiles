export type ProfileKind = 'default' | 'provider'
export type ProviderTransport = 'responses' | 'websocket'

export interface UsageWindow {
  usedPercent: number
  windowDurationMins: number | null
  resetsAt: number | null
}

export interface ProfileUsage {
  fetchedAt: string | null
  status?: 'fetching' | 'ready' | 'stale' | 'error'
  updatedAt?: string | null
  planType?: string | null
  ordinaryUsageAllowed?: boolean | null
  primary?: UsageWindow | null
  secondary?: UsageWindow | null
  error?: string
  errorCode?: 'AUTH_EXPIRED' | 'TIMEOUT' | 'NETWORK' | 'UNKNOWN'
}

export interface Profile {
  id: string
  kind: ProfileKind
  name: string
  active: boolean
  busy?: boolean
  baseUrl?: string
  envKey?: string
  provider?: string
  transport?: ProviderTransport
  usage?: ProfileUsage | null
  authExpired?: boolean
}

export interface ProviderDraft {
  name: string
  baseUrl: string
  token: string
  transport: ProviderTransport
}

export interface ProviderUpdate extends ProviderDraft {
  id: string
}
