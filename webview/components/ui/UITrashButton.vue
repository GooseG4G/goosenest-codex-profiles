<script setup lang="ts">
import UIIconButton from './UIIconButton.vue'
import UITrashIcon from './UITrashIcon.vue'
withDefaults(defineProps<{ accessibleLabel: string; title?: string; disabled?: boolean; pending?: boolean }>(), { title: 'Delete', disabled: false, pending: false })
defineEmits<{ click: [event: MouseEvent] }>()
</script>
<template><UIIconButton :accessible-label="accessibleLabel" :title="title" tone="danger" background="hover" surface-motion="scale" icon-motion="none" size="small" :disabled="disabled" :pending="pending" @click="$emit('click', $event)"><template #icon><UITrashIcon /></template></UIIconButton></template>
