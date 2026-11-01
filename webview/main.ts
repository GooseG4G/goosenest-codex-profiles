import { createApp } from 'vue'
import App from './App.vue'
import { installFocusPolicy } from './utils/focus'
import './theme.css'

installFocusPolicy()
createApp(App).mount('#app')
