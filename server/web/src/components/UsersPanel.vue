<script setup lang="ts">
import { Pencil, UserRoundPlus, X } from "@lucide/vue";
import { computed, shallowRef, watch } from "vue";
import type { User } from "../api";
import { useRouteQuery } from "../composables/useRouteQuery";
import UserForm, { type UserFormValue } from "./users/UserForm.vue";
import UIButton from "./ui/UIButton.vue";
import UIDialog from "./ui/UIDialog.vue";
import UIIconButton from "./ui/UIIconButton.vue";
import UISearchField from "./ui/UISearchField.vue";
const props = defineProps<{
  items: User[];
  busy: boolean;
  savedVersion: number;
}>();
const emit = defineEmits<{
  create: [value: UserFormValue];
  update: [userId: string, value: UserFormValue];
}>();
const open = shallowRef(false);
const selected = shallowRef<User>();
const query = useRouteQuery();
const formId = "user-editor-form";
const dialogTitle = computed(() => (selected.value ? "Edit user" : "Add user"));
const visible = computed(() => {
  const value = query.value.trim().toLocaleLowerCase();
  return value
    ? props.items.filter((user) =>
        [user.nickname, user.username, user.role].some((field) =>
          field.toLocaleLowerCase().includes(value),
        ),
      )
    : props.items;
});
function openAdd() {
  selected.value = undefined;
  open.value = true;
}
function openEdit(user: User) {
  selected.value = user;
  open.value = true;
}
function close() {
  if (props.busy) return;
  open.value = false;
  selected.value = undefined;
}
function save(value: UserFormValue) {
  if (selected.value) emit("update", selected.value.user_id, value);
  else emit("create", value);
}
watch(
  () => props.savedVersion,
  () => {
    open.value = false;
    selected.value = undefined;
  },
);
</script>
<template>
  <section class="users-view">
    <div class="toolbar">
      <UISearchField
        v-model="query"
        accessible-label="Search users"
        placeholder="Search users..."
      /><UIIconButton
        accessible-label="Add user"
        background="always"
        @click="openAdd"
        ><template #icon><UserRoundPlus /></template
      ></UIIconButton>
    </div>
    <div class="table">
      <div class="table-head">
        User <span>{{ items.length }}</span>
      </div>
      <div v-if="!visible.length" class="empty">No users found</div>
      <article v-for="user in visible" :key="user.user_id">
        <i /><span class="user-copy"
          ><strong>{{ user.nickname }}</strong
          ><small>{{ user.username }}</small></span
        ><span class="role">{{ user.role }}</span
        ><span class="row-actions"
          ><UIIconButton
            :accessible-label="`Edit ${user.nickname}`"
            title="Edit"
            size="small"
            icon-motion="none"
            @click="openEdit(user)"
            ><template #icon><Pencil /></template></UIIconButton
        ></span>
      </article>
    </div>
    <UIDialog
      :open="open"
      :title="dialogTitle"
      :close-disabled="busy"
      @close="close"
    >
      <template #close="{ close }"
        ><UIIconButton
          accessible-label="Close"
          size="small"
          surface-motion="none"
          :disabled="busy"
          @click="close"
          ><template #icon><X /></template></UIIconButton
      ></template>
      <UserForm
        v-if="open"
        :form-id="formId"
        :user="selected"
        @submit="save"
      />
      <template #footer="{ close }"
        ><UIButton :disabled="busy" @click="close">Cancel</UIButton
        ><UIButton
          type="submit"
          :form="formId"
          variant="primary"
          :pending="busy"
          >{{ selected ? "Save" : "Add user" }}</UIButton
        ></template
      >
    </UIDialog>
  </section>
</template>
<style scoped>
.users-view {
  display: grid;
  align-content: start;
  gap: 12px;
}
.toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 46px;
  gap: 10px;
}
.table {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #151616;
}
.table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 14px;
  color: var(--muted);
  font-size: 12px;
  border-bottom: 1px solid var(--line);
}
.table article {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto 28px;
  align-items: center;
  gap: 13px;
  min-height: 68px;
  padding: 11px 15px;
}
.table article:hover {
  background: var(--hover);
}
.table article + article {
  border-top: 1px solid var(--line);
}
.table article > i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--success);
}
.user-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.user-copy strong,
.user-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-copy strong {
  font-size: 14px;
  line-height: 18px;
}
.user-copy small {
  color: var(--muted);
  font-size: 12px;
  line-height: 16px;
}
.role {
  padding: 3px 8px;
  border-radius: 99px;
  background: #292a2b;
  color: #c5c5c5;
  font-size: 12px;
}
.row-actions {
  display: inline-flex;
}
.table article:has(.row-actions:hover) {
  background: transparent;
}
.empty {
  padding: 50px;
  color: var(--muted);
  text-align: center;
}
</style>
