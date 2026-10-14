import { defineStore } from 'pinia'
import { ref } from 'vue'

/** Notifications brèves après une action (enregistrement, suppression…). */
export const useToastStore = defineStore('toasts', () => {
  const items = ref([])
  let nextId = 1

  const push = (message, tone = 'ok', { timeout = 4500 } = {}) => {
    const id = nextId++
    items.value.push({ id, message, tone })
    if (timeout) setTimeout(() => dismiss(id), timeout)
    return id
  }

  const dismiss = (id) => {
    items.value = items.value.filter((item) => item.id !== id)
  }

  return {
    items,
    dismiss,
    success: (message) => push(message, 'ok'),
    error: (message) => push(message, 'danger', { timeout: 7000 }),
    info: (message) => push(message, 'info'),
  }
})

export default useToastStore
