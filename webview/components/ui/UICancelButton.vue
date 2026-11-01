<script setup lang="ts">
import UILineButton from './UILineButton.vue'

defineProps<{ disabled?: boolean }>()
defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <UILineButton :disabled="disabled" @click="$emit('click', $event)">Cancel</UILineButton>
</template>
