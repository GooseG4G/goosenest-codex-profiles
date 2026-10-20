<script setup lang="ts">
import UIActionItem from "./UIActionItem.vue";

defineProps<{
  accessibleLabel: string;
  expanded: boolean;
  controls: string;
}>();

defineEmits<{ toggle: [] }>();
</script>

<template>
  <UIActionItem
    :accessible-label="accessibleLabel"
    :aria-expanded="expanded"
    :aria-controls="controls"
    @activate="$emit('toggle')"
  />
</template>
