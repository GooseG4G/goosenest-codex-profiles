<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, type User, type UserEntities } from "./api";
import { useDevices } from "./composables/useDevices";
import { useDelayedVisibility } from "./composables/useDelayedVisibility";
import { useNotifications } from "./composables/useNotifications";
import { useProfiles } from "./composables/useProfiles";
import { useSession } from "./composables/useSession";
import AppSidebar from "./components/AppSidebar.vue";
import DeviceAuthCard from "./components/DeviceAuthCard.vue";
import DevicesPanel from "./components/DevicesPanel.vue";
import LoginForm from "./components/LoginForm.vue";
import ProfilesPanel from "./components/ProfilesPanel.vue";
import UsersPanel from "./components/UsersPanel.vue";
import UIToastRegion from "./components/ui/UIToastRegion.vue";
import UIConfirmDialog from "./components/ui/UIConfirmDialog.vue";

const session = useSession();
const showSessionLoading = useDelayedVisibility(session.loading);
const profiles = useProfiles();
const devices = useDevices(() => session.principal.value?.user_id);
const notifications = useNotifications();
const users = shallowRef<User[]>([]);
const route = useRoute();
const router = useRouter();
const activeView = computed(() =>
  route.name === "profiles" || route.name === "users" ? route.name : "devices",
);
const loginPending = shallowRef(false);
const dashboardLoading = shallowRef(false);
const dashboardReady = shallowRef(false);
const showDashboardLoading = useDelayedVisibility(dashboardLoading);
const userCreatePending = shallowRef(false);
const userSavedVersion = shallowRef(0);
const pendingDeleteProfileId = shallowRef<string>();
const deletePending = shallowRef(false);
const pendingDeleteDeviceId = shallowRef<string>();
const deviceDeletePending = shallowRef(false);
const profileDialogOpen = shallowRef(false);

async function loadUsers() {
  users.value = (await api<UserEntities>("/users")).items;
}
async function loadDashboard() {
  dashboardLoading.value = true;
  dashboardReady.value = false;
  try {
    const jobs: Promise<unknown>[] = [devices.load()];
    if (session.principal.value?.role === "administrator")
      jobs.push(profiles.load(), loadUsers());
    await Promise.all(jobs);
  } finally {
    dashboardLoading.value = false;
    dashboardReady.value = true;
  }
}
async function login(username: string, password: string) {
  loginPending.value = true;
  try {
    await session.login(username, password);
    const redirect =
      typeof route.query.redirect === "string" &&
      route.query.redirect.startsWith("/") &&
      !route.query.redirect.startsWith("//")
        ? route.query.redirect
        : "/me/devices";
    await router.replace(redirect);
    await loadDashboard();
  } catch (reason) {
    notifications.error(reason, "Sign in failed");
  } finally {
    loginPending.value = false;
  }
}
async function logout() {
  try {
    await session.logout();
    users.value = [];
    dashboardReady.value = false;
    profiles.closeFlow();
    devices.reset();
    await router.replace({ name: "sign-in" });
  } catch (reason) {
    notifications.error(reason, "Could not sign out");
  }
}
async function addUser(body: object) {
  userCreatePending.value = true;
  try {
    await api("/users", { method: "POST", body: JSON.stringify(body) });
    await loadUsers();
    userSavedVersion.value += 1;
    notifications.push("User added", "success");
  } catch (reason) {
    notifications.error(reason, "Could not add user");
  } finally {
    userCreatePending.value = false;
  }
}
async function updateUser(userId: string, body: object) {
  userCreatePending.value = true;
  try {
    await api(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    await loadUsers();
    userSavedVersion.value += 1;
    notifications.push("User updated", "success");
  } catch (reason) {
    notifications.error(reason, "Could not update user");
  } finally {
    userCreatePending.value = false;
  }
}
async function startAuth() {
  try {
    await profiles.startAuth();
  } catch (reason) {
    notifications.error(reason, "Could not start Codex sign-in");
  }
}
function closeProfileDialog() {
  if (profiles.busy.value) return;
  profiles.closeFlow();
  profileDialogOpen.value = false;
}
function requestDeleteProfile(profileId: string) {
  pendingDeleteProfileId.value = profileId;
}
async function deleteProfile() {
  if (!pendingDeleteProfileId.value) return;
  deletePending.value = true;
  try {
    await api(`/profiles/${pendingDeleteProfileId.value}`, {
      method: "DELETE",
    });
    pendingDeleteProfileId.value = undefined;
    await profiles.load();
    notifications.push("Profile deleted", "success");
  } catch (reason) {
    notifications.error(reason, "Could not delete profile");
  } finally {
    deletePending.value = false;
  }
}
async function issueDevice(name: string) {
  try {
    await devices.issue(name);
  } catch (reason) {
    notifications.error(reason, "Could not issue device secret");
  }
}
async function deleteDevice() {
  if (!pendingDeleteDeviceId.value) return;
  deviceDeletePending.value = true;
  try {
    await devices.remove(pendingDeleteDeviceId.value);
    pendingDeleteDeviceId.value = undefined;
    notifications.push("Device deleted", "success");
  } catch (reason) {
    notifications.error(reason, "Could not delete device");
  } finally {
    deviceDeletePending.value = false;
  }
}

onMounted(async () => {
  await session.restore();
  if (!session.principal.value) {
    if (route.name !== "sign-in") {
      await router.replace({
        name: "sign-in",
        query: { redirect: route.fullPath },
      });
    }
    return;
  }
  if (route.name === "sign-in") await router.replace("/me/devices");
  try {
    await loadDashboard();
  } catch (reason) {
    notifications.error(reason, "Could not load dashboard");
  }
});
watch(
  [
    () => route.meta.administrator,
    () => route.name,
    () => session.principal.value?.role,
  ],
  ([administrator, routeName, role]) => {
    if (!role && routeName !== "sign-in" && !session.loading.value) {
      void router.replace({
        name: "sign-in",
        query: { redirect: route.fullPath },
      });
      return;
    }
    if (role && routeName === "sign-in") {
      void router.replace("/me/devices");
      return;
    }
    if (administrator && role && role !== "administrator")
      void router.replace("/me/devices");
  },
);
watch(
  () => profiles.pollError.value,
  (reason) => {
    if (!reason) return;
    notifications.error(reason, "Codex sign-in failed");
    profiles.closeFlow();
  },
);
</script>

<template>
  <main v-if="session.loading.value || showSessionLoading" class="loading">
    <template v-if="showSessionLoading">
      <span class="loading-spinner" aria-hidden="true" />
      <span role="status">Loading</span>
    </template>
  </main>
  <main v-else-if="!session.principal.value" class="login-page">
    <LoginForm :pending="loginPending" @submit="login" />
  </main>
  <div v-else class="app-shell">
    <AppSidebar :principal="session.principal.value" @logout="logout" />
    <main class="workspace">
      <div
        v-if="!dashboardReady || showDashboardLoading"
        class="workspace-loading"
        :aria-busy="dashboardLoading || undefined"
      >
        <template v-if="showDashboardLoading">
          <span class="loading-spinner" aria-hidden="true" />
          <span role="status">Loading</span>
        </template>
      </div>
      <template v-else>
        <ProfilesPanel
          v-if="activeView === 'profiles'"
          :items="profiles.profiles.value"
          :busy="profiles.busy.value"
          @start-auth="profileDialogOpen = true"
          @delete="requestDeleteProfile"
          @hot-profile-change="profiles.setHotProfile"
        />
        <UsersPanel
          v-else-if="activeView === 'users'"
          :items="users"
          :busy="userCreatePending"
          :saved-version="userSavedVersion"
          @create="addUser"
          @update="updateUser"
        />
        <DevicesPanel
          v-else
          :devices="devices.devices.value"
          :issued="devices.issued.value"
          :busy="devices.busy.value"
          @issue="issueDevice"
          @clear-issued="devices.clearIssued"
          @delete="pendingDeleteDeviceId = $event"
        />
      </template>
    </main>
  </div>
  <DeviceAuthCard
    :open="profileDialogOpen"
    :flow="profiles.flow.value"
    :pending="profiles.busy.value"
    @start="startAuth"
    @close="closeProfileDialog"
  />
  <UIConfirmDialog
    :open="Boolean(pendingDeleteProfileId)"
    title="Delete"
    description="The stored credentials for this profile will be permanently removed."
    :pending="deletePending"
    @close="pendingDeleteProfileId = undefined"
    @confirm="deleteProfile"
  />
  <UIConfirmDialog
    :open="Boolean(pendingDeleteDeviceId)"
    title="Delete"
    description="This device secret will stop working immediately."
    :pending="deviceDeletePending"
    @close="pendingDeleteDeviceId = undefined"
    @confirm="deleteDevice"
  />
  <UIToastRegion
    :items="notifications.items.value"
    @dismiss="notifications.dismiss"
  />
</template>

<style scoped>
.loading {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--color-text-secondary);
}
.loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.workspace-loading {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--color-text-secondary);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .loading-spinner {
    animation-duration: 1.4s;
  }
}
</style>
