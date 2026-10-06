export type ProfileKind = 'default' | 'provider'

export interface Profile {
  id: string
  kind: ProfileKind
  name: string
  active: boolean
  baseUrl?: string
  envKey?: string
  provider?: string
}

export interface ProviderDraft {
  name: string
  baseUrl: string
  token: string
}
