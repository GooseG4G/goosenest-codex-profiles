<script setup lang="ts">
defineOptions({ inheritAttrs: false })
</script>

<template><span v-bind="$attrs" class="ui-icon" aria-hidden="true"><slot /></span></template>

<style scoped>
.ui-icon { display: inline-flex; width: 17px; height: 17px; flex: 0 0 auto; color: inherit; transition: color 160ms ease; }
.ui-icon :deep(svg) { display: block; width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
@media (prefers-reduced-motion: reduce) { .ui-icon { transition: none; } }
</style>
