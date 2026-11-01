<script setup lang="ts">
import UILineButton from './UILineButton.vue'

withDefaults(defineProps<{
  disabled?: boolean
  pending?: boolean
  type?: 'button' | 'submit'
}>(), { disabled: false, pending: false, type: 'button' })

defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <UILineButton variant="danger" :disabled="disabled" :pending="pending" :type="type" @click="$emit('click', $event)">
    <slot />
  </UILineButton>
</template>
