import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import { installFocusPolicy } from "./utils/focus";
import "./style.css";
import "./polish.css";

installFocusPolicy();
createApp(App).use(router).mount("#app");
