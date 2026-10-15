import { onUnmounted, readonly, shallowRef } from "vue";
import {
  api,
  type DeviceFlow,
  type Profile,
  type ProfileEntities,
  type StreamEvent,
  type UsageLimits,
  type UsageResetOutcome,
  type UsageResetRequest,
  type UsageResets,
} from "../api";

export function useProfiles() {
  const profiles = shallowRef<Profile[]>([]),
    flow = shallowRef<DeviceFlow>(),
    authOpened = shallowRef(false),
    busy = shallowRef(false),
    pollError = shallowRef<unknown>(),
    resetPending = shallowRef<string>(),
    resetCompleted = shallowRef<{
      profileId: string;
      outcome: UsageResetOutcome;
      sequence: number;
    }>();
  let authTimer: number | undefined,
    usageTimer: number | undefined,
    resetTimer: number | undefined,
    reconnectTimer: number | undefined,
    hotProfileId: string | undefined,
    usageGeneration = 0,
    reconnectAttempt = 0,
    lastStreamId = "$",
    socket: WebSocket | undefined,
    usageRequest: Promise<void> | undefined,
    usageAbort: AbortController | undefined,
    resetSequence = 0;
  async function load() {
    profiles.value = (await api<ProfileEntities>("/profiles")).items;
    connectEvents();
  }
  async function startAuth(profileId?: string) {
    busy.value = true;
    pollError.value = undefined;
    authOpened.value = false;
    stop();
    try {
      const query = profileId
        ? `?profile_id=${encodeURIComponent(profileId)}`
        : "";
      flow.value = await api<DeviceFlow>(`/device/auth${query}`, {
        method: "POST",
      });
      authTimer = window.setInterval(poll, 1500);
    } finally {
      busy.value = false;
    }
  }
  async function poll() {
    if (!flow.value) return;
    try {
      const next = await api<DeviceFlow>(`/device/auth/${flow.value.uid}`, {
        method: "POST",
      });
      flow.value = { ...flow.value, ...next };
      if (next.status === "pending") return;
      stop();
      if (next.status === "authorized") {
        await load();
      } else {
        pollError.value = new Error(
          next.detail ||
            (next.status === "expired"
              ? "The Codex sign-in code expired"
              : "Codex sign-in failed"),
        );
      }
    } catch (reason) {
      stop();
      pollError.value = reason;
      flow.value = {
        ...flow.value,
        status: "failed",
        detail: reason instanceof Error ? reason.message : "Sign-in failed",
      };
    }
  }
  function stop() {
    if (authTimer) window.clearInterval(authTimer);
    authTimer = undefined;
  }
  function closeFlow() {
    const uid = flow.value?.uid;
    stop();
    flow.value = undefined;
    pollError.value = undefined;
    authOpened.value = false;
    if (uid)
      void api(`/device/auth/${uid}`, { method: "DELETE" }).catch(() => {
        // Server-side expiry remains the fallback; closing the UI stays immediate.
      });
  }
  function finishFlow() {
    const uid = flow.value?.uid;
    stop();
    flow.value = undefined;
    pollError.value = undefined;
    authOpened.value = false;
    if (uid)
      void api(`/device/auth/${uid}`, { method: "DELETE" }).catch(() => {
        // Completed flows also expire server-side; this eagerly releases memory.
      });
  }
  function markAuthOpened() {
    if (flow.value?.status === "pending") authOpened.value = true;
  }
  function replaceProfile(profile: Profile) {
    profiles.value = profiles.value.map((item) =>
      item.profile_id === profile.profile_id ? profile : item,
    );
  }
  function clearUsageTimer() {
    if (usageTimer) window.clearTimeout(usageTimer);
    usageTimer = undefined;
  }
  async function consumeReset(profileId: string, resetId: string) {
    if (resetPending.value) return;
    resetPending.value = `${profileId}:${resetId}`;
    try {
      await api<UsageResetRequest>(
        `/profiles/${profileId}/usage/resets/${encodeURIComponent(resetId)}`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        },
      );
      if (resetTimer) window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        resetPending.value = undefined;
        resetTimer = undefined;
      }, 120_000);
    } catch (reason) {
      resetPending.value = undefined;
      throw reason;
    }
  }
  function applyUsage(
    profileId: string,
    limits: UsageLimits,
    resets: UsageResets,
  ) {
    const profile = profiles.value.find((item) => item.profile_id === profileId);
    if (!profile) return;
    const windowValue = (value: UsageLimits["primary"]) =>
      value
        ? {
            usedPercent: value.used_percent,
            windowDurationMins: value.window_duration_minutes,
            resetsAt: value.resets_at,
          }
        : undefined;
    replaceProfile({
      ...profile,
      usage: {
        ...profile.usage,
        primary: windowValue(limits.primary),
        secondary: windowValue(limits.secondary),
      },
      usage_updated_at: limits.updated_at,
      usage_resets: resets,
    });
  }
  function refreshHotProfile(profileId: string, generation: number) {
    if (
      document.hidden ||
      hotProfileId !== profileId ||
      generation !== usageGeneration
    )
      return Promise.resolve();
    if (usageRequest) return usageRequest;
    clearUsageTimer();
    const controller = new AbortController();
    usageAbort = controller;
    usageRequest = (async () => {
      try {
        const options = { signal: controller.signal };
        const [limits, resets] = await Promise.all([
          api<UsageLimits>(`/profiles/${profileId}/usage/limits`, options),
          api<UsageResets>(`/profiles/${profileId}/usage/resets`, options),
        ]);
        if (generation === usageGeneration && hotProfileId === profileId)
          applyUsage(profileId, limits, resets);
      } catch {
        // Keep the last successful snapshot and retry on the next hot tick.
      } finally {
        usageRequest = undefined;
        if (usageAbort === controller) usageAbort = undefined;
        if (
          hotProfileId === profileId &&
          generation === usageGeneration &&
          !document.hidden
        )
          usageTimer = window.setTimeout(
            () => void refreshHotProfile(profileId, generation),
            60_000,
          );
      }
    })();
    return usageRequest;
  }
  function clearReconnectTimer() {
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  function closeEvents() {
    clearReconnectTimer();
    const active = socket;
    socket = undefined;
    if (active && active.readyState < WebSocket.CLOSING) active.close(1000);
  }
  function connectEvents() {
    if (document.hidden || socket) return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/api/v1/events?after=${encodeURIComponent(lastStreamId)}`;
    const next = new WebSocket(url);
    socket = next;
    next.addEventListener("open", () => {
      reconnectAttempt = 0;
    });
    next.addEventListener("message", (message) => {
      try {
        const payload = JSON.parse(String(message.data)) as StreamEvent;
        if (!payload.stream_id || !payload.event) return;
        lastStreamId = payload.stream_id;
        if (payload.event.type === "profile.auth.changed") {
          if (
            payload.event.auth_status === "authorized" &&
            payload.event.flow_id &&
            payload.event.flow_id === flow.value?.uid
          ) {
            stop();
            flow.value = {
              ...flow.value,
              status: "authorized",
              profile_id: payload.event.profile_id,
            };
          }
          if (payload.event.profile_id === hotProfileId)
            setHotProfile(undefined);
          void load();
        } else if (payload.event.type === "profile.usage.reset.completed") {
          if (resetPending.value?.startsWith(`${payload.event.profile_id}:`))
            resetPending.value = undefined;
          if (resetTimer) window.clearTimeout(resetTimer);
          resetTimer = undefined;
          resetSequence += 1;
          resetCompleted.value = {
            profileId: payload.event.profile_id,
            outcome: payload.event.outcome,
            sequence: resetSequence,
          };
          if (payload.event.profile_id === hotProfileId)
            void refreshHotProfile(hotProfileId, usageGeneration);
        } else if (payload.event.profile_id === hotProfileId) {
          void refreshHotProfile(hotProfileId, usageGeneration);
        }
      } catch {
        // Ignore malformed events; the REST heartbeat remains authoritative.
      }
    });
    next.addEventListener("close", () => {
      if (socket === next) socket = undefined;
      if (document.hidden) return;
      const delay = Math.min(1_000 * 2**reconnectAttempt, 15_000);
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(connectEvents, delay);
    });
  }
  function setHotProfile(profileId?: string) {
    if (hotProfileId === profileId) return;
    clearUsageTimer();
    usageAbort?.abort();
    usageAbort = undefined;
    usageRequest = undefined;
    hotProfileId = profileId;
    usageGeneration += 1;
    closeEvents();
    reconnectAttempt = 0;
    if (!document.hidden) {
      connectEvents();
      if (profileId) void refreshHotProfile(profileId, usageGeneration);
    }
  }
  function handleVisibilityChange() {
    clearUsageTimer();
    usageAbort?.abort();
    usageAbort = undefined;
    usageRequest = undefined;
    closeEvents();
    usageGeneration += 1;
    if (!document.hidden) {
      connectEvents();
      if (hotProfileId) void refreshHotProfile(hotProfileId, usageGeneration);
    }
  }
  document.addEventListener("visibilitychange", handleVisibilityChange);
  onUnmounted(() => {
    closeFlow();
    if (resetTimer) window.clearTimeout(resetTimer);
    clearUsageTimer();
    closeEvents();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });
  return {
    profiles: readonly(profiles),
    flow: readonly(flow),
    authOpened: readonly(authOpened),
    busy: readonly(busy),
    pollError: readonly(pollError),
    resetPending: readonly(resetPending),
    resetCompleted: readonly(resetCompleted),
    load,
    setHotProfile,
    startAuth,
    closeFlow,
    finishFlow,
    markAuthOpened,
    consumeReset,
  };
}
