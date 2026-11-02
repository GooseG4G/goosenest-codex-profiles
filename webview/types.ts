export type ProfileKind = 'default' | 'provider'
export type ProviderTransport = 'responses' | 'websocket'

export interface UsageWindow {
  usedPercent: number
  windowDurationMins: number | null
  resetsAt: number | null
}

export interface UsageResetCredit {
  id: string
  status: string
  resetType?: string | null
  title?: string | null
  description?: string | null
  grantedAt?: number | null
  expiresAt?: number | null
}

export interface ProfileUsage {
  fetchedAt: string | null
  status?: 'fetching' | 'ready' | 'stale' | 'error'
  updatedAt?: string | null
  planType?: string | null
  ordinaryUsageAllowed?: boolean | null
  primary?: UsageWindow | null
  secondary?: UsageWindow | null
  resetCredits?: readonly UsageResetCredit[]
  availableResetCount?: number
  pendingResetId?: string | null
  pendingResetRequestId?: string | null
  error?: string
  errorCode?: 'AUTH_EXPIRED' | 'TIMEOUT' | 'NETWORK' | 'UNKNOWN'
}

export type ProfileUsageLimits = Pick<ProfileUsage, 'primary' | 'secondary' | 'status' | 'fetchedAt' | 'updatedAt' | 'error' | 'errorCode'>
export type ProfileUsageResets = Pick<ProfileUsage, 'resetCredits' | 'availableResetCount' | 'pendingResetId' | 'pendingResetRequestId' | 'status' | 'fetchedAt' | 'updatedAt' | 'error' | 'errorCode'>

export interface ProfileUsageResources {
  limits: ProfileUsageLimits | null
  resets: ProfileUsageResets | null
}
export interface ProfilePlan {
  planType?: string | null
  updatedAt?: string | null
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
  usage?: ProfileUsageResources | null
  plan?: ProfilePlan | null
  authExpired?: boolean
  lastUsedAt?: string | null
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
