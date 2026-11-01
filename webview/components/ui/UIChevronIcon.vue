<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import UIIcon from './UIIcon.vue'
withDefaults(defineProps<{ expanded?: boolean }>(), { expanded: false })
</script>
<template><UIIcon class="chevron-icon" :class="{ expanded }"><ChevronDown /></UIIcon></template>
<style scoped>
.chevron-icon { transition: transform var(--duration-normal) var(--ease-standard); }
.chevron-icon.expanded { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { .chevron-icon { transition: none; } }
</style>
