export type Role = "user" | "administrator";
export interface Meta {
  type: string;
  href: string;
  total?: number | null;
}
export interface Principal {
  user_id: string;
  username: string;
  role: Role;
}
export interface User extends Principal {
  meta: Meta;
  nickname: string;
}
export interface UserEntities {
  meta: Meta;
  items: User[];
}
export interface Profile {
  meta: Meta;
  profile_id: string;
  name: string;
  enabled: boolean;
  auth_status: string;
  usage?: Record<string, unknown> | null;
  usage_updated_at: string | null;
  subscription_expires_at: string | null;
  usage_resets?: UsageResets;
  last_used_at: string | null;
}
export interface ProfileEntities {
  meta: Meta;
  items: Profile[];
}
export interface UsageWindow {
  used_percent: number;
  window_duration_minutes: number | null;
  resets_at: number | null;
}
export interface UsageLimits {
  primary: UsageWindow | null;
  secondary: UsageWindow | null;
  updated_at: string | null;
  stale: boolean;
  refreshing: boolean;
}
export interface UsageResetCredit {
  reset_id: string;
  status: "available" | "redeeming" | "redeemed" | "unknown";
  reset_type: "codexRateLimits" | "unknown";
  title: string | null;
  description: string | null;
  granted_at: number;
  expires_at: number | null;
}
export interface UsageResets {
  available_count: number;
  credits: readonly UsageResetCredit[] | null;
  updated_at: string | null;
  stale: boolean;
  refreshing: boolean;
}
export interface UsageResetRequest {
  task_id: string;
  idempotency_key: string;
  status: "queued";
}
export type UsageResetOutcome =
  | "reset"
  | "nothingToReset"
  | "noCredit"
  | "alreadyRedeemed";
export type ServerEvent =
  | {
      version: 1;
      type: "profile.usage.updated";
      profile_id: string;
      occurred_at: string;
    }
  | {
      version: 1;
      type: "profile.usage.reset.completed";
      profile_id: string;
      occurred_at: string;
      outcome: UsageResetOutcome;
    }
  | {
      version: 1;
      type: "profile.auth.changed";
      profile_id: string;
      auth_status: "authorized" | "expired";
      flow_id?: string | null;
    };
export interface StreamEvent {
  stream_id: string;
  event: ServerEvent;
}
export interface Device {
  meta: Meta;
  device_id: string;
  user_id: string;
  name: string;
  enabled: boolean;
  created_at: string;
  last_used_at: string | null;
}
export interface DeviceEntities {
  meta: Meta;
  items: Device[];
}
export interface DeviceIssued extends Device {
  secret: string;
}
export interface DeviceFlow {
  uid: string;
  one_time_code: string;
  verification_url: string;
  expires_in: number;
  status: "pending" | "authorized" | "expired" | "failed";
  profile_id?: string;
  detail?: string;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail || response.statusText || "Request failed");
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
