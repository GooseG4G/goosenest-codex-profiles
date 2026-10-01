<script setup lang="ts">
withDefaults(defineProps<{ animated?: boolean }>(), { animated: true })
</script>

<template>
  <svg class="switch-icon" :class="{ animated }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path class="arrow arrow-forward" d="M4 7h14m-3-3 3 3-3 3" />
    <path class="arrow arrow-back" d="M20 17H6m3 3-3-3 3-3" />
  </svg>
</template>

<style scoped>
.arrow { transition: transform 150ms cubic-bezier(.2, .8, .2, 1); }
:global(.icon-button:hover) .animated .arrow-forward { transform: translateX(1.5px); }
:global(.icon-button:hover) .animated .arrow-back { transform: translateX(-1.5px); }
:global(.icon-button:active) .animated .arrow-forward { transform: translateX(-1px); }
:global(.icon-button:active) .animated .arrow-back { transform: translateX(1px); }
@media (prefers-reduced-motion: reduce) { .arrow { transition: none; } }
</style>
