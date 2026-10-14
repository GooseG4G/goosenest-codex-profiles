import {
  onScopeDispose,
  readonly,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from "vue";

interface DelayedVisibilityOptions {
  delay?: number;
  minimumVisible?: number;
}

export function useDelayedVisibility(
  source: MaybeRefOrGetter<boolean>,
  options: DelayedVisibilityOptions = {},
) {
  const { delay = 180, minimumVisible = 320 } = options;
  const visible = shallowRef(false);
  let shownAt = 0;
  let showTimer: number | undefined;
  let hideTimer: number | undefined;

  function clearShowTimer() {
    if (showTimer !== undefined) window.clearTimeout(showTimer);
    showTimer = undefined;
  }

  function clearHideTimer() {
    if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }

  watch(
    () => toValue(source),
    (active) => {
      if (active) {
        clearHideTimer();
        if (visible.value || showTimer !== undefined) return;
        showTimer = window.setTimeout(() => {
          showTimer = undefined;
          if (!toValue(source)) return;
          shownAt = performance.now();
          visible.value = true;
        }, delay);
        return;
      }

      clearShowTimer();
      if (!visible.value) return;
      const remaining = Math.max(
        0,
        minimumVisible - (performance.now() - shownAt),
      );
      hideTimer = window.setTimeout(() => {
        hideTimer = undefined;
        visible.value = false;
      }, remaining);
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    clearShowTimer();
    clearHideTimer();
  });

  return readonly(visible);
}
