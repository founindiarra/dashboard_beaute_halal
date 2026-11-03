import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { vSortable } from './directives/sortable'
import './style.css'

createApp(App).use(createPinia()).use(router).directive('sortable', vSortable).mount('#app')
