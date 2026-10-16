import { onUnmounted, readonly, shallowRef } from "vue";
import {
  api,
  type DeviceFlow,
  type Profile,
  type ProfilePlan,
  type ProfileEntities,
  type StreamEvent,
  type UsageLimits,
  type UsageResetOutcome,
  type UsageResetRequest,
  type UsageResets,
} from "../api";
import { useEventStream } from "./useEventStream";

export function useProfiles() {
  const profiles = shallowRef<Profile[]>([]),
    planPendingProfileIds = shallowRef<ReadonlySet<string>>(new Set()),
    enabledPendingProfileIds = shallowRef<ReadonlySet<string>>(new Set()),
    resetsByProfileId = shallowRef<
      Readonly<Record<string, UsageResets | undefined>>
    >({}),
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
    hotProfileId: string | undefined,
    usageGeneration = 0,
    usageRequest: Promise<void> | undefined,
    usageAbort: AbortController | undefined,
    planRequests = new Map<string, Promise<void>>(),
    resetSequence = 0;
  const { connect: connectEvents, disconnect: disconnectEvents } =
    useEventStream<StreamEvent>({
      path: "/api/v1/events",
      storageKey: "goosenest:event-stream:last-id",
      onEvent: handleServerEvent,
    });
  async function load() {
    profiles.value = (await api<ProfileEntities>("/profiles")).items;
    const profileIds = new Set(profiles.value.map((profile) => profile.profile_id));
    resetsByProfileId.value = Object.fromEntries(
      Object.entries(resetsByProfileId.value).filter(([profileId]) =>
        profileIds.has(profileId),
      ),
    );
    connectEvents();
    for (const profile of profiles.value) {
      const planUpdatedAt = Date.parse(profile.plan_updated_at ?? "");
      const planIsStale =
        !Number.isFinite(planUpdatedAt) || Date.now() - planUpdatedAt >= 60_000;
      if (
        profile.enabled &&
        profile.auth_status === "authorized" &&
        planIsStale
      )
        void refreshPlan(profile.profile_id);
    }
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
  async function setEnabled(profileId: string, enabled: boolean) {
    if (enabledPendingProfileIds.value.has(profileId)) return;
    enabledPendingProfileIds.value = new Set(enabledPendingProfileIds.value).add(
      profileId,
    );
    try {
      const profile = await api<Profile>(`/profiles/${profileId}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      replaceProfile(profile);
      if (!enabled && hotProfileId === profileId) setHotProfile(undefined);
    } finally {
      const next = new Set(enabledPendingProfileIds.value);
      next.delete(profileId);
      enabledPendingProfileIds.value = next;
    }
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
    });
    resetsByProfileId.value = {
      ...resetsByProfileId.value,
      [profileId]: resets,
    };
  }
  function setPlanPending(profileId: string, pending: boolean) {
    const next = new Set(planPendingProfileIds.value);
    if (pending) next.add(profileId);
    else next.delete(profileId);
    planPendingProfileIds.value = next;
  }
  function refreshPlan(profileId: string) {
    const active = planRequests.get(profileId);
    if (active) return active;
    setPlanPending(profileId, true);
    const request = api<ProfilePlan>(`/profiles/${profileId}/plan`)
      .then((plan) => {
        const profile = profiles.value.find(
          (item) => item.profile_id === profileId,
        );
        if (!profile) return;
        replaceProfile({
          ...profile,
          plan_type: plan.plan_type,
          plan_updated_at: plan.updated_at,
        });
      })
      .catch(() => {
        // A missing plan is a stable unavailable state, not endless loading.
      })
      .finally(() => {
        planRequests.delete(profileId);
        setPlanPending(profileId, false);
      });
    planRequests.set(profileId, request);
    return request;
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
  function handleServerEvent(payload: StreamEvent) {
    if (!payload.event) return;
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
      if (payload.event.profile_id === hotProfileId) setHotProfile(undefined);
      void load();
    } else if (payload.event.type === "profile.usage.updated") {
      if (payload.event.profile_id === hotProfileId)
        void refreshHotProfile(hotProfileId, usageGeneration);
    } else if (payload.event.type === "profile.plan.updated") {
      void refreshPlan(payload.event.profile_id);
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
    }
  }
  function setHotProfile(profileId?: string) {
    if (hotProfileId === profileId) return;
    clearUsageTimer();
    usageAbort?.abort();
    usageAbort = undefined;
    usageRequest = undefined;
    hotProfileId = profileId;
    usageGeneration += 1;
    if (!document.hidden) {
      if (profileId) void refreshHotProfile(profileId, usageGeneration);
    }
  }
  function handleVisibilityChange() {
    clearUsageTimer();
    usageAbort?.abort();
    usageAbort = undefined;
    usageRequest = undefined;
    usageGeneration += 1;
    if (!document.hidden) {
      if (hotProfileId) void refreshHotProfile(hotProfileId, usageGeneration);
    }
  }
  document.addEventListener("visibilitychange", handleVisibilityChange);
  onUnmounted(() => {
    closeFlow();
    if (resetTimer) window.clearTimeout(resetTimer);
    clearUsageTimer();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });
  return {
    profiles: readonly(profiles),
    planPendingProfileIds: readonly(planPendingProfileIds),
    enabledPendingProfileIds: readonly(enabledPendingProfileIds),
    resetsByProfileId: readonly(resetsByProfileId),
    flow: readonly(flow),
    authOpened: readonly(authOpened),
    busy: readonly(busy),
    pollError: readonly(pollError),
    resetPending: readonly(resetPending),
    resetCompleted: readonly(resetCompleted),
    load,
    connectEvents,
    disconnectEvents,
    setEnabled,
    setHotProfile,
    startAuth,
    closeFlow,
    finishFlow,
    markAuthOpened,
    consumeReset,
  };
}
