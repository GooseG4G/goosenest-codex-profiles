import { onUnmounted, readonly, shallowRef } from "vue";

export type NotificationTone = "error" | "success" | "info";
export interface NotificationItem {
  id: number;
  message: string;
  tone: NotificationTone;
}

const MAX_VISIBLE_NOTIFICATIONS = 5;

export function useNotifications() {
  const items = shallowRef<NotificationItem[]>([]);
  const timers = new Map<number, number>();
  let nextId = 1;

  function dismiss(id: number) {
    const timer = timers.get(id);
    if (timer) window.clearTimeout(timer);
    timers.delete(id);
    items.value = items.value.filter((item) => item.id !== id);
  }

  function push(
    message: string,
    tone: NotificationTone = "info",
    timeout = 5000,
  ) {
    const id = nextId++;
    const overflow = Math.max(
      0,
      items.value.length + 1 - MAX_VISIBLE_NOTIFICATIONS,
    );
    for (const item of items.value.slice(0, overflow)) dismiss(item.id);
    items.value = [...items.value, { id, message, tone }];
    timers.set(
      id,
      window.setTimeout(() => dismiss(id), timeout),
    );
  }

  function error(reason: unknown, fallback: string) {
    push(reason instanceof Error ? reason.message : fallback, "error", 7000);
  }

  onUnmounted(() => timers.forEach((timer) => window.clearTimeout(timer)));
  return { items: readonly(items), push, error, dismiss };
}
