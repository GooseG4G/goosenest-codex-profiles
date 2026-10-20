import { onMounted, onUnmounted, readonly, shallowRef } from "vue";

export function useMinuteClock() {
  const now = shallowRef(Date.now());
  let timer: number | undefined;

  onMounted(() => {
    timer = window.setInterval(() => {
      now.value = Date.now();
    }, 60_000);
  });

  onUnmounted(() => {
    if (timer !== undefined) window.clearInterval(timer);
  });

  return readonly(now);
}
