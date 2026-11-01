<script setup lang="ts">defineOptions({ name: 'UICollectionItemIdentity' }); defineProps<{ disclosure?: boolean }>()</script>
<template>
  <div class="list-identity" :class="{ 'has-disclosure': disclosure }">
    <span v-if="disclosure" class="list-disclosure"><slot name="disclosure" /></span>
    <span class="list-status"><slot name="status" /></span>
    <span class="list-copy"><slot /></span>
  </div>
</template>
<style scoped>
.list-identity { display: grid; min-width: 0; grid-template-columns: 10px minmax(0, 1fr); align-items: center; gap: 13px; }
.list-identity.has-disclosure { grid-template-columns: 16px 10px minmax(0, 1fr); gap: 5px; }
.list-disclosure, .list-status, .list-copy { display: contents; }
.list-identity.has-disclosure .list-disclosure { display: inline-flex; transform: translateX(-4px); }
.list-identity.has-disclosure .list-copy { display: block; min-width: 0; margin-left: 8px; }
</style>
