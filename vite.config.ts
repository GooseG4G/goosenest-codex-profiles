import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    emptyOutDir: true,
    lib: {
      entry: 'webview/main.ts',
      name: 'CodexAccountsWebview',
      formats: ['iife'],
      fileName: () => 'webview.js',
    },
  },
})
