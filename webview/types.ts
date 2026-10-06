export type ProfileKind = 'default' | 'provider'

export interface UsageWindow {
  usedPercent: number
  windowDurationMins: number | null
  resetsAt: number | null
}

export interface ProfileUsage {
  checkedAt: string
  planType?: string | null
  ordinaryUsageAllowed?: boolean | null
  primary?: UsageWindow | null
  secondary?: UsageWindow | null
  error?: string
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
}

export interface ProviderDraft {
  name: string
  baseUrl: string
  token: string
}
