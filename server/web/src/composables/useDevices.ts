import { readonly, shallowRef } from "vue";
import { api, type Device, type DeviceIssued } from "../api";

export function useDevices() {
  const devices = shallowRef<Device[]>([]);
  const issued = shallowRef<DeviceIssued>();
  const busy = shallowRef(false);

  async function load() {
    devices.value = await api<Device[]>("/me/devices");
  }
  async function issue(name: string) {
    busy.value = true;
    try {
      issued.value = await api<DeviceIssued>("/me/devices", {
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
      await api<void>(`/me/devices/${deviceId}`, { method: "DELETE" });
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
