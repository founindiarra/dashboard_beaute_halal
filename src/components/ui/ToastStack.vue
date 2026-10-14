<script setup>
import AdminIcon from './AdminIcon.vue'
import { useToastStore } from '@/stores/toasts'

const toasts = useToastStore()

const TONES = {
  ok: { classes: 'border-ok/30 bg-ok-bg text-ok', icon: 'check' },
  danger: { classes: 'border-danger/30 bg-danger-bg text-danger', icon: 'alert' },
  info: { classes: 'border-info/30 bg-info-bg text-info', icon: 'info' },
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
    aria-live="polite"
    aria-atomic="false"
  >
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-for="toast in toasts.items"
        :key="toast.id"
        class="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-[var(--shadow-card)]"
        :class="(TONES[toast.tone] || TONES.info).classes"
      >
        <AdminIcon :name="(TONES[toast.tone] || TONES.info).icon" class="mt-0.5 h-4 w-4 shrink-0" />
        <span class="min-w-0 flex-1">{{ toast.message }}</span>
        <button
          type="button"
          class="shrink-0 opacity-60 transition-opacity hover:opacity-100"
          aria-label="Fermer la notification"
          @click="toasts.dismiss(toast.id)"
        >
          <AdminIcon name="close" class="h-3.5 w-3.5" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
