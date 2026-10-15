<script setup lang="ts">
import {
  ChevronDown,
  Layers,
  LogOut,
  Smartphone,
  UserRound,
  UsersRound,
} from "@lucide/vue";
import type { Principal } from "../api";
import UIPopover from "./ui/UIPopover.vue";
defineProps<{ principal: Principal }>();
defineEmits<{ logout: [] }>();
</script>

<template>
  <aside class="sidebar">
    <div class="brand"><b>G</b><span>Goosenest</span></div>
    <nav aria-label="Main navigation">
      <RouterLink to="/me/devices"
        ><Smartphone /><span>Devices</span></RouterLink
      ><template v-if="principal.role === 'administrator'"
        ><hr />
        <RouterLink to="/profiles"><Layers /><span>Profiles</span></RouterLink
        ><RouterLink to="/users"
          ><UsersRound /><span>Users</span></RouterLink
        ></template
      >
    </nav>
    <div class="account">
      <UIPopover placement="above-end" mobile-placement="below-end">
        <template #trigger="{ open, toggle, triggerId, panelId }">
          <button
            :id="triggerId"
            class="account-trigger"
            type="button"
            :aria-label="`Account: ${principal.username}`"
            :aria-expanded="open"
            :aria-controls="panelId"
            aria-haspopup="menu"
            @click="toggle"
          >
            <UserRound /><span>{{ principal.username }}</span
            ><ChevronDown class="account-chevron" :class="{ open }" />
          </button>
        </template>
        <template #default="{ close }">
          <div class="account-identity">
            <strong>Signed in as</strong><span>{{ principal.username }}</span>
          </div>
          <button
            class="account-action"
            type="button"
            role="menuitem"
            @click="close(); $emit('logout')"
          >
            <LogOut /><span>Sign out</span>
          </button>
        </template>
      </UIPopover>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 20px 13px 16px;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-sidebar);
  border-right: 1px solid var(--color-border-default);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px 26px;
  font-weight: 700;
}
.brand b {
  display: grid;
  place-items: center;
  width: 31px;
  height: 31px;
  border-radius: 8px;
  background: var(--color-bg-accent);
  color: var(--color-text-inverse);
  font-size: 14px;
}
.sidebar nav {
  display: grid;
  gap: 3px;
}
.sidebar nav a {
  display: flex;
  flex: 0 0 36px;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 11px;
  border-radius: 6px;
  outline: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-weight: 500;
  line-height: 20px;
  text-align: left;
  text-decoration: none;
  transition:
    color 120ms ease,
    background-color 120ms ease,
    transform 100ms ease;
}
.sidebar nav a svg {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 150ms ease;
}
.sidebar nav a:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-control-hover);
}
.sidebar nav a:hover svg {
  transform: scale(1.08);
}
.sidebar nav a:active {
  background: var(--color-bg-control-pressed);
  transform: scale(0.985);
}
.sidebar nav a:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-focus) 52%, transparent);
}
.sidebar nav a.router-link-active {
  color: var(--color-text-primary);
  background: var(--color-bg-button-hover);
}
.sidebar nav hr {
  width: 100%;
  height: 1px;
  margin: 7px 0;
  border: 0;
  background: var(--color-border-default);
}
.account {
  margin-top: auto;
  padding: 10px 0 0;
  border-top: 1px solid var(--color-border-default);
}
.account-trigger {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) 14px;
  align-items: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  outline: none;
  background: transparent;
  color: var(--color-text-secondary);
  text-align: left;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}
.account-trigger > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.account-trigger:hover,
.account-trigger[aria-expanded="true"] {
  color: var(--color-text-primary);
  background: var(--color-bg-control-hover);
}
.account-trigger:focus-visible {
  border-color: var(--color-focus);
}
.account-trigger[data-focus-restored]:focus-visible {
  border-color: transparent;
}
.account-trigger svg,
.account-action svg {
  width: 16px;
  height: 16px;
  stroke-width: 1.8;
}
.account-chevron {
  transition: transform var(--duration-normal) var(--ease-standard);
}
.account-chevron.open {
  transform: rotate(180deg);
}
.account-identity {
  display: grid;
  gap: 3px;
  padding: 8px 9px 9px;
  border-bottom: 1px solid var(--color-border-default);
}
.account-identity strong {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-tertiary);
}
.account-identity span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text-primary);
}
.account-action {
  width: 100%;
  height: 34px;
  margin-top: 4px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 5px;
  outline: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-align: left;
  transition: background-color 120ms ease, color 120ms ease;
}
.account-action:hover,
.account-action:focus-visible {
  color: var(--color-text-primary);
  background: var(--color-bg-control-hover);
}
.account-action:active {
  background: var(--color-bg-control-pressed);
}
@media (prefers-reduced-motion: reduce) {
  .sidebar nav a,
  .sidebar nav a svg,
  .account-chevron {
    transition: none;
  }
  .sidebar nav a:hover svg,
  .sidebar nav a:active {
    transform: none;
  }
}
@media (max-width: 760px) {
  .sidebar {
    position: static;
    height: auto;
    padding: 12px 14px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
  }
  .brand {
    padding: 0;
  }
  .brand span {
    display: none;
  }
  .sidebar nav {
    display: flex;
    justify-content: center;
  }
  .sidebar nav hr {
    width: 1px;
    height: 24px;
    margin: 0 4px;
  }
  .sidebar nav a {
    width: 38px;
    height: 36px;
    padding: 0;
    justify-content: center;
  }
  .sidebar nav a span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .account {
    margin: 0;
    padding: 0;
    border: 0;
  }
  .account-trigger {
    width: 38px;
    grid-template-columns: 16px;
    justify-content: center;
    padding: 0;
  }
  .account-trigger > span,
  .account-chevron {
    display: none;
  }
}
</style>
