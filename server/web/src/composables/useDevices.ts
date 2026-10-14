import { readonly, shallowRef } from "vue";
import {
  api,
  type Device,
  type DeviceEntities,
  type DeviceIssued,
} from "../api";

export function useDevices(userId: () => string | undefined) {
  const devices = shallowRef<Device[]>([]);
  const issued = shallowRef<DeviceIssued>();
  const busy = shallowRef(false);

  function path(suffix = "") {
    const currentUserId = userId();
    if (!currentUserId) throw new Error("Current user is unavailable");
    return `/users/${currentUserId}/devices${suffix}`;
  }

  async function load() {
    const response = await api<DeviceEntities>(path());
    devices.value = response.items;
  }
  async function issue(name: string) {
    busy.value = true;
    try {
      issued.value = await api<DeviceIssued>(path(), {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      devices.value = [...devices.value, issued.value];
    } finally {
      busy.value = false;
    }
  }
  async function remove(deviceId: string) {
    busy.value = true;
    try {
      await api<void>(path(`/${deviceId}`), { method: "DELETE" });
      devices.value = devices.value.filter(
        (device) => device.device_id !== deviceId,
      );
    } finally {
      busy.value = false;
    }
  }
  function clearIssued() {
    issued.value = undefined;
  }
  function reset() {
    devices.value = [];
    issued.value = undefined;
  }
  return {
    devices: readonly(devices),
    issued: readonly(issued),
    busy: readonly(busy),
    load,
    issue,
    remove,
    clearIssued,
    reset,
  };
}
