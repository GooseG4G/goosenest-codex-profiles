<script setup lang="ts">
import { reactive } from "vue";
import UIButton from "./ui/UIButton.vue";
defineProps<{ pending: boolean }>();
const emit = defineEmits<{ submit: [username: string, password: string] }>();
const form = reactive({ username: "", password: "" });
</script>
<template>
  <form
    class="login"
    @submit.prevent="emit('submit', form.username, form.password)"
  >
    <div class="login-brand">
      <b>G</b
      ><span><strong>Goosenest</strong><small>Codex profiles</small></span>
    </div>
    <label
      ><span>Username</span
      ><input
        v-model="form.username"
        type="email"
        placeholder="name@example.com"
        autocomplete="username"
        required /></label
    ><label
      ><span>Password</span
      ><input
        v-model="form.password"
        type="password"
        placeholder="Password"
        autocomplete="current-password"
        required /></label
    ><UIButton type="submit" variant="primary" :pending="pending"
      >Sign in</UIButton
    >
  </form>
</template>
<style scoped>
.login {
  width: min(360px, calc(100vw - 32px));
  display: grid;
  gap: 14px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
}
.login-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 5px;
}
.login-brand > b {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: #ededed;
  color: #171819;
}
.login-brand > span {
  display: grid;
  gap: 1px;
}
.login-brand small {
  color: var(--muted);
  font-size: 12px;
}
.login label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
}
.login input {
  width: 100%;
}
.login :deep(.ui-button) {
  width: 100%;
  margin-top: 3px;
}
</style>
