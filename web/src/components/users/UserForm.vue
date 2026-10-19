<script setup lang="ts">
import { reactive } from "vue";
import type { Role, User } from "../../api";
import UISelect from "../ui/UISelect.vue";
import type { SelectOption } from "../ui/UISelect.vue";

export interface UserFormValue {
  username?: string;
  nickname: string;
  password?: string;
  role: Role;
}

const props = defineProps<{
  formId: string;
  user?: User;
}>();
const emit = defineEmits<{ submit: [value: UserFormValue] }>();
const roleOptions = [
  { value: "user", label: "User" },
  { value: "administrator", label: "Administrator" },
] as const satisfies readonly SelectOption[];
const form = reactive({
  username: props.user?.username ?? "",
  nickname: props.user?.nickname ?? "",
  password: "",
  role: props.user?.role ?? ("user" as Role),
});

function submit() {
  emit("submit", {
    ...(!props.user ? { username: form.username } : {}),
    nickname: form.nickname,
    role: form.role,
    ...(form.password ? { password: form.password } : {}),
  });
}
</script>

<template>
  <form :id="formId" class="user-form" @submit.prevent="submit">
    <label
      >Username<input
        v-model="form.username"
        type="email"
        autocomplete="off"
        placeholder="name@example.com"
        :disabled="Boolean(user)"
        required
    /></label>
    <label
      >Nickname<input
        v-model="form.nickname"
        autocomplete="off"
        placeholder="Display name"
        required
    /></label>
    <label
      >Password<input
        v-model="form.password"
        type="password"
        minlength="8"
        autocomplete="new-password"
        :placeholder="
          user
            ? 'Leave blank to keep current password'
            : 'At least 8 characters'
        "
        :required="!user"
    /></label>
    <div class="form-field">
      <span class="field-label">Role</span>
      <UISelect
        v-model="form.role"
        aria-label="Role"
        :options="roleOptions"
      />
    </div>
  </form>
</template>

<style scoped>
.user-form {
  display: grid;
  gap: 15px;
}
.user-form label,
.form-field {
  display: grid;
  gap: 7px;
  color: var(--color-text-secondary);
  font-size: 12px;
}
.user-form input {
  width: 100%;
}
.user-form input:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
