<script setup lang="ts">
defineProps<{
  heading: string;
  empty: boolean;
  emptyText: string;
}>();

defineSlots<{
  toolbar(): unknown;
  default(): unknown;
}>();
</script>

<template>
  <section class="collection-view">
    <div class="collection-toolbar"><slot name="toolbar" /></div>
    <div class="collection-list">
      <div class="collection-heading">{{ heading }}</div>
      <div v-if="empty" class="collection-empty">{{ emptyText }}</div>
      <slot v-else />
    </div>
  </section>
</template>

<style scoped>
.collection-view {
  display: grid;
  align-content: start;
  gap: 12px;
  width: 100%;
}
.collection-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 46px;
  gap: 10px;
}
.collection-list {
  overflow: hidden;
  border: 1px solid var(--color-border-default);
  border-radius: 7px;
  background: var(--color-bg-sunken);
}
.collection-heading {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 14px;
  border-bottom: 1px solid var(--color-border-default);
  background: var(--color-bg-table-header);
  color: var(--color-text-secondary);
  font-size: 12px;
}
.collection-empty {
  padding: 44px 14px;
  color: var(--color-text-secondary);
  text-align: center;
}
</style>
