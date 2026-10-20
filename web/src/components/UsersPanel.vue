<script setup lang="ts">
import { Pencil, UserRoundPlus, X } from "@lucide/vue";
import { computed, shallowRef, watch } from "vue";
import type { User } from "../api";
import { useRouteQuery } from "../composables/useRouteQuery";
import UserForm, { type UserFormValue } from "./users/UserForm.vue";
import UIButton from "./ui/UIButton.vue";
import UIDialog from "./ui/UIDialog.vue";
import UIIconButton from "./ui/UIIconButton.vue";
import UICollectionItemIdentity from "./ui/UICollectionItemIdentity.vue";
import UICollectionView from "./ui/UICollectionView.vue";
import UICollectionItem from "./ui/UICollectionItem.vue";
import UISearchField from "./ui/UISearchField.vue";
const props = defineProps<{
  items: readonly User[];
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
  <UICollectionView heading="User" :empty="!visible.length" empty-text="No users found">
    <template #toolbar>
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
    </template>
      <UICollectionItem v-for="user in visible" :key="user.user_id" class="users-view-row">
        <UICollectionItemIdentity><template #status><i /></template><span class="user-copy"
          ><strong>{{ user.nickname }}</strong
          ><small>{{ user.username }}</small></span></UICollectionItemIdentity
        ><template #aside><span class="role">{{ user.role }}</span></template>
        <template #actions><span class="row-actions"><UIIconButton
            :accessible-label="`Edit ${user.nickname}`"
            title="Edit"
            size="small"
            icon-motion="none"
            motion-preset="surface"
            @click="openEdit(user)"
            ><template #icon><Pencil /></template></UIIconButton></span></template>
      </UICollectionItem>
    </UICollectionView>
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
</template>
<style scoped>
.users-view-row i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--color-user-status-active);
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
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 16px;
}
.role {
  padding: 3px 8px;
  border-radius: 99px;
  background: var(--color-user-role-badge-background);
  color: var(--color-user-role-badge-foreground);
  font-size: 12px;
}
.row-actions {
  display: inline-flex;
}
</style>
