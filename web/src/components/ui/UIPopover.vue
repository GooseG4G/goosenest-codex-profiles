<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  shallowRef,
  useId,
  useTemplateRef,
} from "vue";
import { useEscapeLayer } from "../../composables/useEscapeLayer";
import { restoreFocus } from "../../utils/focus";

const props = withDefaults(
  defineProps<{
    placement?: "above-start" | "above-end" | "below-start" | "below-end";
    mobilePlacement?: "above-start" | "above-end" | "below-start" | "below-end";
    disabled?: boolean;
  }>(),
  { placement: "above-start", mobilePlacement: undefined, disabled: false },
);
defineSlots<{
  trigger(props: {
    open: boolean;
    toggle: () => void;
    triggerId: string;
    panelId: string;
  }): unknown;
  default(props: { close: () => void }): unknown;
}>();

const root = useTemplateRef<HTMLElement>("root");
const panel = useTemplateRef<HTMLElement>("panel");
const open = shallowRef(false);
const triggerId = useId();
const panelId = useId();

function focusableItems() {
  if (!panel.value) return [];
  return Array.from(
    panel.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled),a[href],[role="menuitem"]:not([aria-disabled="true"]),[tabindex]:not([tabindex="-1"])',
    ),
  );
}

async function show() {
  if (props.disabled || open.value) return;
  open.value = true;
  await nextTick();
  focusableItems()[0]?.focus();
}

function close(options: { restoreFocus?: boolean } = {}) {
  if (!open.value) return;
  open.value = false;
  if (options.restoreFocus !== false) {
    nextTick(() => restoreFocus(document.getElementById(triggerId)));
  }
}

function toggle() {
  if (open.value) close();
  else void show();
}

function onDocumentPointerDown(event: PointerEvent) {
  if (open.value && !root.value?.contains(event.target as Node)) {
    close({ restoreFocus: false });
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const items = focusableItems();
  if (!items.length) return;
  event.preventDefault();
  const current = items.indexOf(document.activeElement as HTMLElement);
  const direction = event.key === "ArrowDown" ? 1 : -1;
  const next = current < 0 ? 0 : (current + direction + items.length) % items.length;
  items[next]?.focus();
}
useEscapeLayer(open, close);

document.addEventListener("pointerdown", onDocumentPointerDown);
onBeforeUnmount(() =>
  document.removeEventListener("pointerdown", onDocumentPointerDown),
);
</script>

<template>
  <div ref="root" class="popover-root" @keydown="onKeydown">
    <slot
      name="trigger"
      :open="open"
      :toggle="toggle"
      :trigger-id="triggerId"
      :panel-id="panelId"
    />
    <Transition name="popover">
      <div
        v-if="open"
        :id="panelId"
        ref="panel"
        class="popover-panel"
        :class="[
          `placement-${placement}`,
          mobilePlacement && `mobile-placement-${mobilePlacement}`,
        ]"
        role="menu"
        :aria-labelledby="triggerId"
      >
        <slot :close="close" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.popover-root {
  position: relative;
  min-width: 0;
}
.popover-panel {
  position: absolute;
  z-index: 50;
  min-width: 180px;
  padding: 5px;
  border: 1px solid var(--color-border-strong);
  border-radius: 7px;
  background: var(--color-bg-overlay);
  box-shadow: var(--shadow-overlay);
}
.placement-above-start {
  bottom: calc(100% + 7px);
  left: 0;
}
.placement-above-end {
  right: 0;
  bottom: calc(100% + 7px);
}
.placement-below-start {
  top: calc(100% + 7px);
  left: 0;
}
.placement-below-end {
  top: calc(100% + 7px);
  right: 0;
}
.popover-enter-active,
.popover-leave-active {
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}
.popover-enter-from,
.popover-leave-to {
  opacity: 0;
  transform: translateY(3px) scale(0.985);
}
@media (prefers-reduced-motion: reduce) {
  .popover-enter-active,
  .popover-leave-active {
    transition: none;
  }
}
@media (max-width: 760px) {
  .mobile-placement-above-start {
    inset: auto auto calc(100% + 7px) 0;
  }
  .mobile-placement-above-end {
    inset: auto 0 calc(100% + 7px) auto;
  }
  .mobile-placement-below-start {
    inset: calc(100% + 7px) auto auto 0;
  }
  .mobile-placement-below-end {
    inset: calc(100% + 7px) 0 auto auto;
  }
}
</style>
