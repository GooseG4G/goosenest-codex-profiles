<script setup lang="ts">
import UIIconButton from './UIIconButton.vue'
import UICloseIcon from './UICloseIcon.vue'
withDefaults(defineProps<{ accessibleLabel?: string; title?: string; disabled?: boolean; pending?: boolean }>(), { accessibleLabel: 'Close', title: 'Close', disabled: false, pending: false })
defineEmits<{ click: [event: MouseEvent] }>()
</script>
<template><UIIconButton :accessible-label="accessibleLabel" :title="title" size="small" :disabled="disabled" :pending="pending" @click="$emit('click', $event)"><template #icon><UICloseIcon /></template></UIIconButton></template>
