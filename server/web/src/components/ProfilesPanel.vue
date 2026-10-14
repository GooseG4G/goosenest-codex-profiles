<script setup lang="ts">
import { ChevronDown, Trash2, UserRoundPlus } from "@lucide/vue";
import { computed, onBeforeUnmount, shallowRef } from "vue";
import type { Profile } from "../api";
import { useRouteQuery } from "../composables/useRouteQuery";
import UsageDisplay from "./profiles/UsageDisplay.vue";
import UIIconButton from "./ui/UIIconButton.vue";
import UISearchField from "./ui/UISearchField.vue";
const props = defineProps<{ items: readonly Profile[]; busy: boolean }>();
const query = useRouteQuery();
const visible = computed(() => {
  const value = query.value.trim().toLocaleLowerCase();
  return value
    ? props.items.filter((profile) =>
        profile.name.toLocaleLowerCase().includes(value),
      )
    : props.items;
});
const emit = defineEmits<{
  startAuth: [];
  delete: [profileId: string];
  hotProfileChange: [profileId?: string];
}>();
const expanded = shallowRef<string>();
const hovered = shallowRef<string>();
function toggle(profile: Profile) {
  expanded.value =
    expanded.value === profile.profile_id ? undefined : profile.profile_id;
  emit("hotProfileChange", expanded.value);
}
onBeforeUnmount(() => emit("hotProfileChange", undefined));
</script>
<template>
  <section class="profiles-panel">
    <div class="toolbar">
      <UISearchField
        v-model="query"
        accessible-label="Search profiles"
        placeholder="Search profiles..."
      /><UIIconButton
        accessible-label="Add profile"
        background="always"
        :disabled="busy"
        @click="emit('startAuth')"
        ><template #icon><UserRoundPlus /></template
      ></UIIconButton>
    </div>
    <div class="table-card">
      <div class="list-header">
        Profile <span>{{ items.length }}</span>
      </div>
      <div v-if="!visible.length" class="empty">No profiles found</div>
      <article
        v-for="profile in visible"
        :key="profile.profile_id"
        class="profile-item"
        :class="{ 'identity-hovered': hovered === profile.profile_id }"
        @pointerleave="hovered = undefined"
      >
        <div class="profile-row">
          <button
            class="row-hit"
            :aria-label="`${expanded === profile.profile_id ? 'Hide' : 'Show'} usage for ${profile.name}`"
            :aria-expanded="expanded === profile.profile_id"
            :aria-controls="`usage-${profile.profile_id}`"
            @pointerenter="hovered = profile.profile_id"
            @pointerleave="hovered = undefined"
            @click="toggle(profile)"
          /><span :class="['dot', { off: !profile.enabled }]" /><span
            class="copy"
            ><strong>{{ profile.name }}</strong
            ><small>OpenAI</small></span
          >
          <div class="actions" @pointerenter="hovered = undefined">
            <UIIconButton
              :accessible-label="
                expanded === profile.profile_id
                  ? 'Hide usage limits'
                  : 'Show usage limits'
              "
              :title="expanded === profile.profile_id ? 'Hide' : 'Show'"
              size="small"
              surface-motion="none"
              icon-motion="together"
              @click="toggle(profile)"
              ><template #icon
                ><ChevronDown
                  class="chevron"
                  :class="{
                    expanded: expanded === profile.profile_id,
                  }" /></template></UIIconButton
            ><i /><UIIconButton
              accessible-label="Delete profile"
              tone="danger"
              size="small"
              surface-motion="none"
              icon-motion="none"
              @click="emit('delete', profile.profile_id)"
              ><template #icon><Trash2 /></template
            ></UIIconButton>
          </div>
        </div>
        <Transition name="usage"
          ><div
            v-if="expanded === profile.profile_id"
            :id="`usage-${profile.profile_id}`"
            class="usage-collapse"
            @pointerenter="hovered = profile.profile_id"
            @pointerleave="hovered = undefined"
          >
            <div class="usage-wrap">
              <UsageDisplay
                :usage="profile.usage"
                :updated-at="profile.usage_updated_at"
              />
            </div></div
        ></Transition>
      </article>
    </div>
  </section>
</template>
<style scoped>
.profiles-panel {
  width: min(620px, 100%);
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
.profile-item + .profile-item {
  border-top: 1px solid var(--line);
}
.profile-item.identity-hovered {
  background: var(--hover);
}
.profile-row {
  position: relative;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
  min-height: 68px;
  padding: 11px 15px;
}
.row-hit {
  position: absolute;
  inset: 0;
  z-index: 0;
  border: 0;
  background: transparent;
}
.row-hit:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--focus) 52%, transparent);
  outline-offset: -2px;
}
.dot {
  z-index: 1;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #61d28b;
  pointer-events: none;
}
.dot.off {
  background: #888;
}
.copy {
  z-index: 1;
  display: grid;
  min-width: 0;
  gap: 3px;
  pointer-events: none;
}
.copy strong {
  overflow: hidden;
  font-size: 14px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy small {
  color: var(--muted);
  font-size: 12px;
  line-height: 16px;
}
.actions {
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
}
.actions i {
  height: 22px;
  border-left: 1px solid var(--line);
}
.chevron {
  transition: transform 0.15s;
}
.chevron.expanded {
  transform: rotate(180deg);
}
.usage-collapse {
  display: grid;
  grid-template-rows: 1fr;
  opacity: 1;
}
.usage-wrap {
  min-height: 0;
  overflow: hidden;
  padding: 0 12px 12px;
}
.empty {
  padding: 44px;
  color: var(--muted);
  text-align: center;
}
.usage-enter-active,
.usage-leave-active {
  transition:
    grid-template-rows 180ms ease,
    opacity 140ms ease;
}
.usage-enter-from,
.usage-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .chevron,
  .usage-enter-active,
  .usage-leave-active {
    transition: none;
  }
}
</style>
