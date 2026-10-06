<script setup lang="ts">
defineProps<{ expanded?: boolean }>()
</script>

<template>
  <svg :class="{ expanded }" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M4.5 6.25 8 9.75l3.5-3.5"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.4"
    />
  </svg>
</template>

<style scoped>
svg {
  transform: rotate(0);
  transform-box: view-box;
  transform-origin: 50% 50%;
  transition: transform 180ms ease;
}
svg.expanded { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { svg { transition: none; } }
</style>
