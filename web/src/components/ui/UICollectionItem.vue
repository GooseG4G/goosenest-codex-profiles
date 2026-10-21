<script setup lang="ts">
defineOptions({ inheritAttrs: false });

defineSlots<{
  interaction?(): unknown;
  default(): unknown;
  aside?(): unknown;
  actions?(): unknown;
  details?(): unknown;
}>();
</script>

<template>
  <article
    v-bind="$attrs"
    class="collection-item"
    :class="{ 'has-interaction': $slots.interaction }"
  >
    <div class="collection-row">
      <slot name="interaction" />
      <div class="collection-identity"><slot /></div>
      <div v-if="$slots.aside" class="collection-aside"><slot name="aside" /></div>
      <div v-if="$slots.actions" class="collection-actions"><slot name="actions" /></div>
    </div>
    <div v-if="$slots.details" class="collection-details"><slot name="details" /></div>
  </article>
</template>

<style scoped>
.collection-item + .collection-item { border-top: 1px solid var(--color-border-default); }
.collection-item { transition: background-color var(--duration-fast) var(--ease-standard); }
.collection-row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 13px; min-height: 68px; padding: 11px 15px; }
.collection-item.has-interaction .collection-row { grid-template-columns: minmax(0, 1fr) auto; gap: 10px; }
.collection-identity { min-width: 0; }
.collection-aside, .collection-actions { z-index: 2; display: inline-flex; }
.collection-details { transition: background-color var(--duration-fast) var(--ease-standard); }
@media (hover: hover) and (pointer: fine) {
  .collection-item:has(.collection-row:hover):not(:has(.collection-actions:hover)) {
    background: var(--color-bg-row-hover);
  }
}
@media (prefers-reduced-motion: reduce) { .collection-item, .collection-details { transition: none; } }
</style>
