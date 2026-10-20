import { onUnmounted, readonly, shallowRef, watch, type WatchSource } from "vue";
import type { Profile } from "../api";

export function usePendingPlanShimmer(
  profiles: WatchSource<readonly Profile[]>,
  pendingProfileIds: WatchSource<ReadonlySet<string>>,
) {
  const visibleIds = shallowRef(new Set<string>());
  const timers = new Map<string, number>();

  watch(
    [profiles, pendingProfileIds],
    ([items, pendingIds]) => {
      for (const profile of items) {
        const id = profile.profile_id;
        if (profile.plan_type?.trim()) {
          const timer = timers.get(id);
          if (timer !== undefined) window.clearTimeout(timer);
          timers.delete(id);
          if (!visibleIds.value.has(id)) continue;
          const next = new Set(visibleIds.value);
          next.delete(id);
          visibleIds.value = next;
          continue;
        }
        if (pendingIds.has(id)) {
          visibleIds.value = new Set(visibleIds.value).add(id);
          continue;
        }
        if (!visibleIds.value.has(id) || timers.has(id)) continue;
        timers.set(
          id,
          window.setTimeout(() => {
            const next = new Set(visibleIds.value);
            next.delete(id);
            visibleIds.value = next;
            timers.delete(id);
          }, 1250),
        );
      }
    },
    { immediate: true, deep: true },
  );

  onUnmounted(() => {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();
  });

  return readonly(visibleIds);
}
