import { readonly, shallowRef } from "vue";
import { api, type User, type UserEntities } from "../api";

export function useUsers() {
  const users = shallowRef<User[]>([]);
  const busy = shallowRef(false);
  const savedVersion = shallowRef(0);

  async function load() {
    users.value = (await api<UserEntities>("/users")).items;
  }

  async function save(path: string, method: "POST" | "PATCH", body: object) {
    busy.value = true;
    try {
      await api(path, { method, body: JSON.stringify(body) });
      await load();
      savedVersion.value += 1;
    } finally {
      busy.value = false;
    }
  }

  function create(body: object) {
    return save("/users", "POST", body);
  }

  function update(userId: string, body: object) {
    return save(`/users/${userId}`, "PATCH", body);
  }

  function reset() {
    users.value = [];
  }

  return {
    users: readonly(users),
    busy: readonly(busy),
    savedVersion: readonly(savedVersion),
    load,
    create,
    update,
    reset,
  };
}
