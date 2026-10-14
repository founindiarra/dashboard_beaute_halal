<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import AdminIcon from './AdminIcon.vue'

/**
 * Fenêtre modale accessible : focus déplacé à l'ouverture et piégé à
 * l'intérieur, Échap ferme, focus rendu à l'élément déclencheur, défilement
 * de la page bloqué tant qu'elle est ouverte.
 */
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  size: { type: String, default: 'md' }, // sm | md | lg
})

const emit = defineEmits(['close'])

const panel = ref(null)
let lastFocused = null

const SIZES = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' }

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

const focusable = () =>
  panel.value ? Array.from(panel.value.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null) : []

const onKeydown = (event) => {
  if (!props.open) return

  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key !== 'Tab') return

  const items = focusable()
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement

  if (event.shiftKey && (active === first || !panel.value?.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

const unlock = () => {
  document.body.style.overflow = ''
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      lastFocused = document.activeElement
      document.body.style.overflow = 'hidden'
      await nextTick()
      focusable()[0]?.focus()
      document.addEventListener('keydown', onKeydown)
    } else {
      document.removeEventListener('keydown', onKeydown)
      unlock()
      if (lastFocused?.isConnected) lastFocused.focus()
      lastFocused = null
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  unlock()
})
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-150"
    enter-from-class="opacity-0"
    leave-active-class="transition-opacity duration-150"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      @click.self="$emit('close')"
    >
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        class="flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-[var(--shadow-pop)] sm:rounded-2xl"
        :class="SIZES[size] || SIZES.md"
      >
        <header class="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div class="min-w-0">
            <h2 class="truncate text-lg">{{ title }}</h2>
            <p v-if="subtitle" class="mt-0.5 truncate text-xs text-muted">{{ subtitle }}</p>
          </div>
          <button
            type="button"
            class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark"
            aria-label="Fermer"
            @click="$emit('close')"
          >
            <AdminIcon name="close" class="h-4 w-4" />
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <slot />
        </div>

        <footer
          v-if="$slots.footer"
          class="flex flex-col-reverse gap-2 border-t border-line bg-canvas px-5 py-3.5 sm:flex-row sm:justify-end"
        >
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Transition>
</template>
