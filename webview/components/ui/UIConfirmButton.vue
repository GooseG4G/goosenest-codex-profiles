<script setup lang="ts">
import UILineButton from './UILineButton.vue'

withDefaults(defineProps<{
  disabled?: boolean
  pending?: boolean
}>(), {
  disabled: false,
  pending: false,
})

defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <UILineButton variant="primary" :disabled="disabled" :pending="pending" @click="$emit('click', $event)">
    <slot />
  </UILineButton>
</template>
