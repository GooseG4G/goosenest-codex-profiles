<script setup lang="ts">
import UILineButton from './UILineButton.vue'

withDefaults(defineProps<{
  disabled?: boolean
  pending?: boolean
  type?: 'button' | 'submit'
}>(), {
  disabled: false,
  pending: false,
  type: 'button',
})
defineSlots<{ default?(): unknown }>()
defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <UILineButton :disabled="disabled" :pending="pending" :type="type" @click="$emit('click', $event)"><slot>Cancel</slot></UILineButton>
</template>
