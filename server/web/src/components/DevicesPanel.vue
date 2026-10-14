<script setup lang="ts">
import { SquarePlus, Trash2, X } from "@lucide/vue";
import { computed, shallowRef } from "vue";
import type { Device, DeviceIssued } from "../api";
import { useRouteQuery } from "../composables/useRouteQuery";
import { formatDateTime } from "../utils/date";
import UIButton from "./ui/UIButton.vue";
import UIDialog from "./ui/UIDialog.vue";
import UIIconButton from "./ui/UIIconButton.vue";
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
  <section class="devices-view">
    <div class="toolbar">
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
    </div>
    <div class="table-card">
      <div class="list-header">
        Device <span>{{ devices.length }}</span>
      </div>
      <div v-if="!visible.length" class="empty">
        <strong>No devices found</strong
        ><span>{{
          query ? "Try another search." : "Add a device to connect Codex."
        }}</span>
      </div>
      <article
        v-for="device in visible"
        :key="device.device_id"
        class="device-row"
      >
        <i :class="{ off: !device.enabled }" /><span class="device-copy"
          ><strong>{{ device.name }}</strong
          ><small>{{
            device.last_used_at
              ? "Last used " + formatDateTime(device.last_used_at)
              : "Never used"
          }}</small></span
        ><code>{{ device.device_id.slice(0, 8) }}</code
        ><span class="row-actions"
          ><UIIconButton
            :accessible-label="`Delete ${device.name}`"
            title="Delete"
            tone="danger"
            size="small"
            icon-motion="none"
            @click="emit('delete', device.device_id)"
            ><template #icon><Trash2 /></template></UIIconButton
        ></span>
      </article>
    </div>
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
  </section>
</template>

<style scoped>
.devices-view {
  display: grid;
  align-content: start;
  gap: 12px;
}
.toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 46px;
  gap: 10px;
}
.table-card {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #151616;
}
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 14px;
  color: var(--muted);
  font-size: 12px;
  border-bottom: 1px solid var(--line);
}
.device-row {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto 28px;
  align-items: center;
  gap: 13px;
  min-height: 68px;
  padding: 11px 15px;
}
.device-row:hover {
  background: var(--hover);
}
.device-row:has(.row-actions:hover) {
  background: transparent;
}
.device-row + .device-row {
  border-top: 1px solid var(--line);
}
.device-row i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--success);
}
.device-row i.off {
  background: #858585;
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
  color: var(--muted);
  font-size: 12px;
  line-height: 16px;
}
.row-actions {
  display: inline-flex;
}
.empty {
  display: grid;
  gap: 6px;
  padding: 54px;
  color: var(--muted);
  text-align: center;
}
.empty strong {
  color: var(--text);
}
.device-form label {
  display: grid;
  gap: 7px;
  color: var(--muted);
  font-size: 12px;
}
.device-form input {
  width: 100%;
}
</style>
