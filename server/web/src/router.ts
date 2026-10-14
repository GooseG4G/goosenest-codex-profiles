import { createRouter, createWebHistory } from "vue-router";
import DevicesPanel from "./components/DevicesPanel.vue";
import LoginForm from "./components/LoginForm.vue";
import ProfilesPanel from "./components/ProfilesPanel.vue";
import UsersPanel from "./components/UsersPanel.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/me/devices" },
    {
      path: "/auth/sign-in",
      name: "sign-in",
      component: LoginForm,
      meta: { public: true },
    },
    {
      path: "/me/devices",
      name: "devices",
      component: DevicesPanel,
    },
    {
      path: "/profiles",
      name: "profiles",
      component: ProfilesPanel,
      meta: { administrator: true },
    },
    {
      path: "/users",
      name: "users",
      component: UsersPanel,
      meta: { administrator: true },
    },
    { path: "/:pathMatch(.*)*", redirect: "/me/devices" },
  ],
});
