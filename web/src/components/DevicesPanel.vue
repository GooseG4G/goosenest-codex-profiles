<script setup lang="ts">
import { SquarePlus, Trash2, X } from "@lucide/vue";
import { computed, shallowRef } from "vue";
import type { Device, DeviceIssued } from "../api";
import { useRouteQuery } from "../composables/useRouteQuery";
import { formatDateTime } from "../utils/date";
import UIButton from "./ui/UIButton.vue";
import UIDialog from "./ui/UIDialog.vue";
import UIIconButton from "./ui/UIIconButton.vue";
import UICollectionItemIdentity from "./ui/UICollectionItemIdentity.vue";
import UICollectionView from "./ui/UICollectionView.vue";
import UICollectionItem from "./ui/UICollectionItem.vue";
import UICopyField from "./ui/UICopyField.vue";
import UISearchField from "./ui/UISearchField.vue";

const props = defineProps<{
  devices: readonly Device[];
  issued?: DeviceIssued;
  busy: boolean;
}>();
const emit = defineEmits<{
  issue: [name: string];
  clearIssued: [];
  delete: [deviceId: string];
}>();
const query = useRouteQuery();
const open = shallowRef(false);
const deviceName = shallowRef("");
const visible = computed(() => {
  const q = query.value.trim().toLowerCase();
  return q
    ? props.devices.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.device_id.toLowerCase().includes(q),
      )
    : props.devices;
});
const dialogOpen = computed(() => open.value || Boolean(props.issued));
const dialogTitle = computed(() =>
  props.issued ? "Copy your secret" : "Issue access secret",
);

function submit() {
  const name = deviceName.value.trim();
  if (!name) return;
  emit("issue", name);
}
function close() {
  if (props.busy) return;
  if (props.issued) emit("clearIssued");
  open.value = false;
  deviceName.value = "";
}
</script>

<template>
  <UICollectionView heading="Device" :empty="!visible.length" empty-text="No devices found">
    <template #toolbar>
      <UISearchField
        v-model="query"
        accessible-label="Search devices"
        placeholder="Search devices..."
      /><UIIconButton
        accessible-label="Add device"
        background="always"
        @click="open = true"
        ><template #icon><SquarePlus /></template
      ></UIIconButton>
    </template>
      <UICollectionItem
        v-for="device in visible"
        :key="device.device_id"
        class="device-row"
      >
        <UICollectionItemIdentity><template #status><i :class="{ off: !device.enabled }" /></template><span class="device-copy"
          ><strong>{{ device.name }}</strong
          ><small>{{
            device.last_used_at
              ? "Last used " + formatDateTime(device.last_used_at)
              : "Never used"
          }}</small></span></UICollectionItemIdentity
        ><template #aside><code>{{ device.device_id.slice(0, 8) }}</code></template>
        <template #actions><span class="row-actions"><UIIconButton
            :accessible-label="`Delete ${device.name}`"
            title="Delete"
            tone="danger"
            size="small"
            icon-motion="none"
            motion-preset="surface"
            @click="emit('delete', device.device_id)"
            ><template #icon><Trash2 /></template></UIIconButton></span></template>
      </UICollectionItem>
    </UICollectionView>
    <UIDialog
      :open="dialogOpen"
      :title="dialogTitle"
      :description="
        issued
          ? 'This secret is shown once. Store it somewhere safe.'
          : undefined
      "
      :close-disabled="busy"
      @close="close"
    >
      <template #close="{ close: closeDialog }"
        ><UIIconButton
          accessible-label="Close"
          size="small"
          surface-motion="none"
          :disabled="busy"
          @click="closeDialog"
          ><template #icon><X /></template></UIIconButton
      ></template>
      <template v-if="issued"
        ><UICopyField
          :value="issued.secret"
          label="Copy secret"
          copied-label="Secret copied"
      /></template>
      <form
        v-else
        id="device-form"
        class="device-form"
        @submit.prevent="submit"
      >
        <label
          >Device name<input
            v-model="deviceName"
            placeholder="Work laptop"
            autocomplete="off"
            required
        /></label>
      </form>
      <template #footer="{ close: closeDialog }"
        ><template v-if="issued"
          ><UIButton variant="primary" @click="closeDialog"
            >Done</UIButton
          ></template
        ><template v-else
          ><UIButton :disabled="busy" @click="closeDialog">Cancel</UIButton
          ><UIButton
            type="submit"
            form="device-form"
            variant="primary"
            :pending="busy"
            >Issue secret</UIButton
          ></template
        ></template
      >
    </UIDialog>
</template>

<style scoped>
.device-row i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--color-device-status-online);
}
.device-row i.off {
  background: var(--color-device-status-offline);
}
.device-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.device-copy strong {
  overflow: hidden;
  font-size: 14px;
  line-height: 18px;
  text-overflow: ellipsis;
}
.device-copy small,
.device-row code {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 16px;
}
.row-actions {
  display: inline-flex;
}
.device-form label {
  display: grid;
  gap: 7px;
  color: var(--color-text-secondary);
  font-size: 12px;
}
.device-form input {
  width: 100%;
}
</style>
