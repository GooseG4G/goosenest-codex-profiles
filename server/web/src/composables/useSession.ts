import { readonly, shallowRef } from "vue";
import { api, type Principal } from "../api";

export function useSession() {
  const principal = shallowRef<Principal>();
  const loading = shallowRef(true);
  async function restore() {
    try {
      principal.value = await api<Principal>("/sessions/me");
    } catch {
      principal.value = undefined;
    } finally {
      loading.value = false;
    }
  }
  async function login(username: string, password: string) {
    principal.value = await api<Principal>("/sessions/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  }
  async function logout() {
    await api<void>("/sessions/current", { method: "DELETE" });
    principal.value = undefined;
  }
  return {
    principal: readonly(principal),
    loading: readonly(loading),
    restore,
    login,
    logout,
  };
}
