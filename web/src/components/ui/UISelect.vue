<script setup lang="ts">
import { Check, ChevronDown } from "@lucide/vue";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  shallowRef,
  useId,
  useTemplateRef,
} from "vue";
import { useEscapeLayer } from "../../composables/useEscapeLayer";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    options: readonly SelectOption[];
    disabled?: boolean;
    placeholder?: string;
  }>(),
  { disabled: false, placeholder: "Select an option" },
);
const model = defineModel<string>({ required: true });
const root = useTemplateRef<HTMLElement>("root");
const trigger = useTemplateRef<HTMLButtonElement>("trigger");
const open = shallowRef(false);
const activeIndex = shallowRef(-1);
const listboxId = useId();
const selected = computed(() =>
  props.options.find((option) => option.value === model.value),
);

function optionId(index: number) {
  return `${listboxId}-option-${index}`;
}
function availableIndex(index: number, direction: 1 | -1): number {
  if (!props.options.length) return -1;
  let next = index;
  for (let attempt = 0; attempt < props.options.length; attempt += 1) {
    next = (next + direction + props.options.length) % props.options.length;
    if (!props.options[next]?.disabled) return next;
  }
  return -1;
}
function selectedIndex() {
  return props.options.findIndex((option) => option.value === model.value);
}
async function show(direction: 1 | -1 = 1) {
  if (props.disabled || open.value) return;
  const current = selectedIndex();
  activeIndex.value =
    current >= 0 && !props.options[current]?.disabled
      ? current
      : availableIndex(direction === 1 ? -1 : 0, direction);
  open.value = true;
  await nextTick();
  document
    .getElementById(optionId(activeIndex.value))
    ?.scrollIntoView({ block: "nearest" });
}
function close({ restoreFocus = false } = {}) {
  if (!open.value) return;
  open.value = false;
  activeIndex.value = -1;
  if (restoreFocus) nextTick(() => trigger.value?.focus());
}
function choose(index: number) {
  const option = props.options[index];
  if (!option || option.disabled) return;
  model.value = option.value;
  close({ restoreFocus: true });
}
function onTriggerClick() {
  if (open.value) close();
  else void show();
}
function onKeydown(event: KeyboardEvent) {
  if (props.disabled) return;
  if (event.key === "Escape" && open.value) {
    event.preventDefault();
    close({ restoreFocus: true });
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    if (!open.value) {
      void show(direction);
      return;
    }
    activeIndex.value = availableIndex(activeIndex.value, direction);
    document
      .getElementById(optionId(activeIndex.value))
      ?.scrollIntoView({ block: "nearest" });
    return;
  }
  if ((event.key === "Enter" || event.key === " ") && open.value) {
    event.preventDefault();
    choose(activeIndex.value);
  }
}
function onDocumentPointerDown(event: PointerEvent) {
  if (open.value && !root.value?.contains(event.target as Node)) close();
}

useEscapeLayer(open, () => close({ restoreFocus: true }));
document.addEventListener("pointerdown", onDocumentPointerDown);
onBeforeUnmount(() =>
  document.removeEventListener("pointerdown", onDocumentPointerDown),
);
</script>

<template>
  <div
    ref="root"
    class="select-control"
    :class="{ disabled, open }"
    @keydown="onKeydown"
  >
    <button
      ref="trigger"
      v-bind="$attrs"
      class="select-trigger"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listboxId"
      :aria-activedescendant="
        open && activeIndex >= 0 ? optionId(activeIndex) : undefined
      "
      :disabled="disabled"
      @click="onTriggerClick"
    >
      <span :class="{ placeholder: !selected }">{{
        selected?.label ?? placeholder
      }}</span>
      <ChevronDown aria-hidden="true" />
    </button>
    <Transition name="select-options">
      <div v-if="open" :id="listboxId" class="select-options" role="listbox">
        <button
          v-for="(option, index) in options"
          :id="optionId(index)"
          :key="option.value"
          class="select-option"
          :class="{ active: index === activeIndex }"
          type="button"
          role="option"
          :aria-selected="option.value === model"
          :disabled="option.disabled"
          @pointermove="activeIndex = index"
          @click="choose(index)"
        >
          <span>{{ option.label }}</span>
          <Check v-if="option.value === model" aria-hidden="true" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.select-control {
  position: relative;
  min-width: 0;
}
.select-trigger {
  width: 100%;
  height: 38px;
  padding: 0 11px 0 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 16px;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  outline: none;
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  text-align: left;
  transition:
    border-color 140ms ease,
    background-color 140ms ease;
}
.select-trigger > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.select-trigger .placeholder {
  color: var(--color-text-tertiary);
}
.select-trigger svg {
  width: 16px;
  height: 16px;
  color: var(--color-text-secondary);
  stroke-width: 1.6;
  transition: transform var(--duration-normal) var(--ease-standard);
}
.select-control.open .select-trigger,
.select-trigger:focus-visible {
  border-color: var(--color-border-strong);
  background: var(--color-bg-raised);
}
.select-control.open .select-trigger svg {
  transform: rotate(180deg);
}
.select-options {
  position: absolute;
  z-index: 70;
  top: calc(100% + 6px);
  right: 0;
  left: 0;
  padding: 5px;
  display: grid;
  gap: 2px;
  border: 1px solid var(--color-border-strong);
  border-radius: 7px;
  background: var(--color-bg-overlay);
  box-shadow: var(--shadow-overlay);
}
.select-option {
  width: 100%;
  min-height: 34px;
  padding: 0 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 16px;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 5px;
  outline: none;
  background: transparent;
  color: var(--color-text-secondary);
  text-align: left;
}
.select-option.active {
  background: var(--color-bg-control-hover);
  color: var(--color-text-primary);
}
.select-option svg {
  width: 15px;
  height: 15px;
  color: var(--color-success);
  stroke-width: 2;
}
.select-option:disabled,
.select-control.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.select-options-enter-active,
.select-options-leave-active {
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}
.select-options-enter-from,
.select-options-leave-to {
  opacity: 0;
  transform: translateY(-3px) scale(0.985);
}
@media (hover: hover) and (pointer: fine) {
  .select-control:not(.disabled) .select-trigger:hover {
    border-color: var(--color-border-strong);
    background: var(--color-bg-raised);
  }
}
@media (prefers-reduced-motion: reduce) {
  .select-trigger,
  .select-trigger svg,
  .select-options-enter-active,
  .select-options-leave-active {
    transition: none;
  }
}
</style>
