<script setup lang="ts">
import { SquareArrowOutUpRight, X } from "@lucide/vue";
import type { DeviceFlow } from "../api";
import UIButton from "./ui/UIButton.vue";
import UICopyField from "./ui/UICopyField.vue";
import UIDialog from "./ui/UIDialog.vue";
import UIIconButton from "./ui/UIIconButton.vue";

defineProps<{
  open: boolean;
  flow?: DeviceFlow;
  pending: boolean;
  authOpened: boolean;
  profileName?: string;
}>();
defineEmits<{ close: []; start: []; authOpened: [] }>();
</script>

<template>
  <UIDialog
    :open="open"
    :title="
      flow ? 'Sign in to Codex' : profileName ? 'Sign in again' : 'Add profile'
    "
    :description="
      flow
        ? 'Continue in OpenAI and enter this one-time code.'
        : profileName
          ? `Sign in to reconnect ${profileName}.`
        : 'Start Codex sign-in to connect another profile.'
    "
    :close-disabled="pending"
    @close="$emit('close')"
  >
    <template #close="{ close }"
      ><UIIconButton
        accessible-label="Close"
        size="small"
        surface-motion="none"
        :disabled="pending"
        @click="close"
        ><template #icon><X /></template></UIIconButton
    ></template>
    <div v-if="flow" class="auth-content">
      <UICopyField
        :value="flow.one_time_code"
        label="Copy code"
        copied-label="Code copied"
        prominent
      />
      <p>
        {{ flow.status }} · expires in about
        {{ Math.max(1, Math.round(flow.expires_in / 60)) }} minutes
      </p>
    </div>
    <template #footer
      ><UIButton :disabled="pending" @click="$emit('close')">Cancel</UIButton
      ><UIButton
        v-if="flow"
        variant="primary"
        :href="flow.verification_url"
        target="_blank"
        rel="noopener noreferrer"
        :pending="authOpened && flow.status === 'pending'"
        @click="$emit('authOpened')"
        >OpenAI <SquareArrowOutUpRight /></UIButton
      ><UIButton
        v-else
        variant="primary"
        :pending="pending"
        @click="$emit('start')"
        >Sign in</UIButton
      ></template
    >
  </UIDialog>
</template>

<style scoped>
.auth-content {
  display: grid;
  gap: 12px;
}
.auth-content p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
}
</style>
