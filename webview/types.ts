export type ProfileKind = 'default' | 'provider'

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
  usage?: ProfileUsage | null
  authExpired?: boolean
}

export interface ProviderDraft {
  name: string
  baseUrl: string
  token: string
}

export interface ProviderUpdate extends ProviderDraft {
  id: string
}
