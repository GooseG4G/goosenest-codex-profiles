<script setup lang="ts">
import UILineButton from './UILineButton.vue'

withDefaults(defineProps<{
  variant?: 'primary' | 'danger'
  disabled?: boolean
  pending?: boolean
  type?: 'button' | 'submit'
}>(), {
  variant: 'primary',
  disabled: false,
  pending: false,
  type: 'button',
})

defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <UILineButton :variant="variant" :disabled="disabled" :pending="pending" :type="type" @click="$emit('click', $event)">
    <slot />
  </UILineButton>
</template>
