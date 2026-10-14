<script setup lang="ts">
import { nextTick, onUnmounted, useId, useTemplateRef, watch } from "vue";
import { restoreFocus } from "../../utils/focus";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    closeDisabled?: boolean;
    width?: "small" | "medium";
  }>(),
  {
    description: undefined,
    closeDisabled: false,
    width: "medium",
  },
);
const emit = defineEmits<{ close: [] }>();
const panel = useTemplateRef<HTMLElement>("panel");
const titleId = useId();
const descriptionId = useId();
let returnFocus: HTMLElement | null = null;

function close() {
  if (!props.closeDisabled) emit("close");
}
function focusableElements() {
  if (!panel.value) return [];
  return Array.from(
    panel.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])',
    ),
  );
}
function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== "Tab") return;
  const elements = focusableElements();
  if (!elements.length) {
    event.preventDefault();
    panel.value?.focus();
    return;
  }
  const first = elements[0],
    last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      returnFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      await nextTick();
      focusableElements()[0]?.focus() ?? panel.value?.focus();
    } else {
      await nextTick();
      restoreFocus(returnFocus);
      returnFocus = null;
    }
  },
);
onUnmounted(() => restoreFocus(returnFocus));
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog-layer">
      <div v-if="open" class="backdrop" @mousedown.self="close">
        <section
          ref="panel"
          class="dialog"
          :class="`width-${width}`"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="description ? descriptionId : undefined"
          tabindex="-1"
          @keydown="handleKeydown"
        >
          <header class="header">
            <h2 :id="titleId">{{ title }}</h2>
            <slot name="close" :close="close" />
          </header>
          <p v-if="description" :id="descriptionId" class="description">
            {{ description }}
          </p>
          <div class="content"><slot /></div>
          <footer v-if="$slots.footer" class="footer">
            <slot name="footer" :close="close" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: #050607c7;
  backdrop-filter: blur(1px);
}
.dialog {
  width: min(408px, 100%);
  padding: 17px;
  border: 1px solid #343638;
  border-radius: 7px;
  outline: none;
  background: #191a1b;
  box-shadow: 0 18px 48px #0008;
}
.width-small {
  width: min(370px, 100%);
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 30px;
  gap: 14px;
}
.header h2 {
  margin: 0;
  font-size: 15px;
  line-height: 20px;
}
.description {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.content {
  margin-top: 14px;
}
.content:empty {
  display: none;
}
.footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.dialog-layer-enter-active,
.dialog-layer-leave-active {
  transition: opacity 150ms ease;
}
.dialog-layer-enter-active .dialog,
.dialog-layer-leave-active .dialog {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}
.dialog-layer-enter-from,
.dialog-layer-leave-to {
  opacity: 0;
}
.dialog-layer-enter-from .dialog,
.dialog-layer-leave-to .dialog {
  opacity: 0;
  transform: translateY(6px) scale(0.985);
}
@media (prefers-reduced-motion: reduce) {
  .dialog-layer-enter-active,
  .dialog-layer-leave-active,
  .dialog-layer-enter-active .dialog,
  .dialog-layer-leave-active .dialog {
    transition: none;
  }
}
</style>
