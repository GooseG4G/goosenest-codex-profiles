<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, X } from "@lucide/vue";
import type { NotificationItem } from "../../composables/useNotifications";
import { shallowRef } from "vue";
import UIIconButton from "./UIIconButton.vue";

defineProps<{ items: readonly NotificationItem[] }>();
const emit = defineEmits<{ dismiss: [id: number] }>();
const swipe = shallowRef<{ id: number; pointerId: number; startX: number; offsetX: number }>();

function onPointerDown(itemId: number, event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  swipe.value = { id: itemId, pointerId: event.pointerId, startX: event.clientX, offsetX: 0 };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function onPointerMove(event: PointerEvent) {
  if (!swipe.value || swipe.value.pointerId !== event.pointerId) return;
  swipe.value = { ...swipe.value, offsetX: event.clientX - swipe.value.startX };
}
function onPointerEnd(event: PointerEvent) {
  if (!swipe.value || swipe.value.pointerId !== event.pointerId) return;
  const current = swipe.value;
  swipe.value = undefined;
  if (Math.abs(current.offsetX) >= 72) emit("dismiss", current.id);
}
function toastStyle(itemId: number) {
  const offsetX = swipe.value?.id === itemId ? swipe.value.offsetX : 0;
  return { "--toast-swipe-x": `${offsetX}px` };
}
</script>

<template>
  <Teleport to="body">
    <div
      class="toast-region"
      aria-live="polite"
      aria-relevant="additions removals"
    >
      <TransitionGroup name="toast">
        <section
          v-for="item in items"
          :key="item.id"
          class="toast"
          :class="`tone-${item.tone}`"
          :role="item.tone === 'error' ? 'alert' : 'status'"
          aria-atomic="true"
          :style="toastStyle(item.id)"
          @pointerdown="onPointerDown(item.id, $event)"
          @pointermove="onPointerMove"
          @pointerup="onPointerEnd"
          @pointercancel="onPointerEnd"
        >
          <span class="status-icon" aria-hidden="true">
            <CircleCheck v-if="item.tone === 'success'" />
            <CircleAlert v-else-if="item.tone === 'error'" />
            <Info v-else />
          </span>
          <span class="message">{{ item.message }}</span>
          <UIIconButton
            accessible-label="Dismiss notification"
            size="small"
            surface-motion="none"
            @click="$emit('dismiss', item.id)"
            ><template #icon><X /></template
          ></UIIconButton>
        </section>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-region {
  position: fixed;
  z-index: 1000;
  top: 18px;
  left: 50%;
  display: grid;
  width: min(380px, calc(100vw - 28px));
  gap: 8px;
  pointer-events: none;
  transform: translateX(-50%);
}
.toast {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 30px;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 8px 8px 8px 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: 7px;
  background: var(--color-bg-overlay);
  box-shadow: var(--shadow-overlay);
  pointer-events: auto;
  touch-action: pan-y;
  transform: translateX(var(--toast-swipe-x, 0));
  transition: transform 120ms ease;
}
.status-icon {
  display: inline-flex;
  color: var(--color-toast-info);
}
.status-icon svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.tone-error .status-icon {
  color: var(--color-toast-danger);
}
.tone-success .status-icon {
  color: var(--color-toast-success);
}
.message {
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.4;
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
  .toast {
    transition: none;
  }
}
</style>
