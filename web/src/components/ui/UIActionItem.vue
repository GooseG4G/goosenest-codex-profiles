<script setup lang="ts">
defineOptions({ name: "UIActionItem", inheritAttrs: false });

defineProps<{ accessibleLabel: string }>();
defineEmits<{ activate: [] }>();
</script>

<template>
  <button
    v-bind="$attrs"
    class="item-action"
    :aria-label="accessibleLabel"
    @mousedown.prevent
    @click="$emit('activate')"
  />
</template>

<style scoped>
.item-action {
  position: absolute;
  inset: 0;
  z-index: 0;
  border: 0;
  background: transparent;
}
.item-action:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--color-focus) 76%, transparent);
}
</style>
