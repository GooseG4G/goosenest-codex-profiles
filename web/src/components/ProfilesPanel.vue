<script setup lang="ts">
import { UserRoundPlus } from "@lucide/vue";
import { computed, onBeforeUnmount, shallowRef } from "vue";
import type { Profile, UsageResets } from "../api";
import { useEscapeLayer } from "../composables/useEscapeLayer";
import { useRouteQuery } from "../composables/useRouteQuery";
import ProfileListItem from "./profiles/ProfileListItem.vue";
import UICollectionView from "./ui/UICollectionView.vue";
import UIIconButton from "./ui/UIIconButton.vue";
import UISearchField from "./ui/UISearchField.vue";

const props = defineProps<{
  items: readonly Profile[];
  resetsByProfileId: Readonly<Record<string, UsageResets | undefined>>;
  busy: boolean;
  resetPending?: string;
  enabledPendingProfileIds: ReadonlySet<string>;
}>();

const emit = defineEmits<{
  startAuth: [];
  reauthorize: [profileId: string];
  delete: [profileId: string];
  hotProfileChange: [profileId?: string];
  useReset: [profileId: string, resetId: string];
  enabledChange: [profileId: string, enabled: boolean];
}>();

const query = useRouteQuery();
const expanded = shallowRef<string>();
const visible = computed(() => {
  const value = query.value.trim().toLocaleLowerCase();
  return value
    ? props.items.filter((profile) =>
        profile.name.toLocaleLowerCase().includes(value),
      )
    : props.items;
});

function closeExpanded() {
  expanded.value = undefined;
  emit("hotProfileChange", undefined);
}

function activate(profile: Profile) {
  if (profile.auth_status !== "authorized") {
    emit("reauthorize", profile.profile_id);
    return;
  }
  expanded.value =
    expanded.value === profile.profile_id ? undefined : profile.profile_id;
  emit("hotProfileChange", expanded.value);
}

function resetPendingId(profileId: string): string | undefined {
  return props.resetPending?.startsWith(`${profileId}:`)
    ? props.resetPending.slice(profileId.length + 1)
    : undefined;
}

useEscapeLayer(() => Boolean(expanded.value), closeExpanded);
onBeforeUnmount(() => emit("hotProfileChange", undefined));
</script>

<template>
  <UICollectionView
    heading="Profile"
    :empty="!visible.length"
    empty-text="No profiles found"
  >
    <template #toolbar>
      <UISearchField
        v-model="query"
        accessible-label="Search profiles"
        placeholder="Search profiles..."
      />
      <UIIconButton
        accessible-label="Add profile"
        background="always"
        :disabled="busy"
        @click="emit('startAuth')"
      >
        <template #icon><UserRoundPlus /></template>
      </UIIconButton>
    </template>
    <ProfileListItem
      v-for="profile in visible"
      :key="profile.profile_id"
      :profile="profile"
      :expanded="expanded === profile.profile_id"
      :enabled-pending="enabledPendingProfileIds.has(profile.profile_id)"
      :resets="resetsByProfileId[profile.profile_id]"
      :reset-pending-id="resetPendingId(profile.profile_id)"
      @activate="activate(profile)"
      @delete="emit('delete', profile.profile_id)"
      @use-reset="emit('useReset', profile.profile_id, $event)"
      @enabled-change="emit('enabledChange', profile.profile_id, $event)"
    />
  </UICollectionView>
</template>
