export type Role = "user" | "administrator";
export interface Principal {
  user_id: string;
  username: string;
  role: Role;
}
export interface User extends Principal {
  nickname: string;
}
export interface Profile {
  profile_id: string;
  name: string;
  enabled: boolean;
  auth_status: string;
  usage?: Record<string, unknown> | null;
  usage_updated_at: string | null;
  usage_resets?: UsageResets;
  last_used_at: string | null;
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
      outcome: "reset" | "nothingToReset" | "noCredit" | "alreadyRedeemed";
    };
export interface StreamEvent {
  stream_id: string;
  event: ServerEvent;
}
export interface Device {
  device_id: string;
  user_id: string;
  name: string;
  enabled: boolean;
  created_at: string;
  last_used_at: string | null;
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
