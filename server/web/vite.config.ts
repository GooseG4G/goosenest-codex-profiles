import vue from "@vitejs/plugin-vue";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, ".", "");

  return {
    plugins: [vue()],
    server: {
      host: "0.0.0.0",
      port: 8080,
      proxy: {
        "/api": environment.VITE_API_PROXY_TARGET ?? "http://localhost:8000",
      },
    },
  };
});
