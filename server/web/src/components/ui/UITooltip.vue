<script setup lang="ts">
import {
  nextTick,
  onUnmounted,
  shallowRef,
  useTemplateRef,
  watch,
  type CSSProperties,
} from "vue";

const props = withDefaults(
  defineProps<{
    anchor: HTMLElement | null;
    id: string;
    text: string;
    open: boolean;
    instant?: boolean;
    placement?: "above" | "horizontal";
  }>(),
  { placement: "above", instant: false },
);
const tooltip = useTemplateRef<HTMLSpanElement>("tooltip");
const position = shallowRef<CSSProperties>({ top: "0", left: "0" });

function updatePosition() {
  if (!props.anchor || !tooltip.value) return;
  const anchor = props.anchor.getBoundingClientRect(),
    tip = tooltip.value.getBoundingClientRect(),
    gap = 7,
    edge = 7;
  let top = anchor.top - tip.height - gap,
    left = anchor.left + (anchor.width - tip.width) / 2;
  if (props.placement === "horizontal") {
    const placeRight =
      window.innerWidth - anchor.right >= tip.width + gap ||
      anchor.left < window.innerWidth - anchor.right;
    top = anchor.top + (anchor.height - tip.height) / 2;
    left = placeRight ? anchor.right + gap : anchor.left - tip.width - gap;
  } else if (top < edge) top = anchor.bottom + gap;
  position.value = {
    top: `${Math.max(edge, Math.min(top, window.innerHeight - tip.height - edge))}px`,
    left: `${Math.max(edge, Math.min(left, window.innerWidth - tip.width - edge))}px`,
  };
}
watch(
  () => props.open,
  async (open, _previous, onCleanup) => {
    if (!open) return;
    await nextTick();
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    onCleanup(() => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    });
  },
);
watch(
  () => [props.anchor, props.text],
  async () => {
    if (props.open) {
      await nextTick();
      updatePosition();
    }
  },
);
onUnmounted(() => {
  window.removeEventListener("resize", updatePosition);
  window.removeEventListener("scroll", updatePosition, true);
});
</script>

<template>
  <Teleport to="body"
    ><Transition name="tooltip"
      ><span
        v-if="open"
        :id="id"
        ref="tooltip"
        class="tooltip"
        :class="{ instant }"
        role="tooltip"
        :style="position"
        >{{ text }}</span
      ></Transition
    ></Teleport
  >
</template>

<style scoped>
.tooltip {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  max-width: min(240px, calc(100vw - 14px));
  padding: 5px 8px;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  background: var(--color-bg-overlay);
  box-shadow: var(--shadow-overlay);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.3;
  white-space: nowrap;
  pointer-events: none;
}
.tooltip-enter-active {
  transition: opacity 80ms ease 420ms;
}
.tooltip-enter-active.tooltip.instant {
  transition-delay: 0ms;
}
.tooltip-leave-active {
  transition: opacity 70ms ease;
}
.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .tooltip-enter-active,
  .tooltip-leave-active {
    transition: none;
  }
}
</style>
