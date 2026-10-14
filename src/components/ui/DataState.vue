<script setup>
import AdminIcon from './AdminIcon.vue'
import BaseButton from './BaseButton.vue'

/**
 * Trois états d'un chargement API : en cours, en erreur, vide.
 * Tant que l'un d'eux est actif, le contenu par défaut n'est pas rendu.
 */
defineProps({
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  empty: { type: Boolean, default: false },
  loadingLabel: { type: String, default: 'Chargement…' },
  emptyLabel: { type: String, default: 'Rien à afficher pour le moment.' },
  emptyHint: { type: String, default: '' },
})

defineEmits(['retry'])
</script>

<template>
  <div v-if="loading" class="flex flex-col items-center gap-3 py-14 text-center" role="status">
    <span
      class="h-7 w-7 animate-spin rounded-full border-2 border-sand-dark border-t-gold"
      aria-hidden="true"
    />
    <p class="text-sm text-muted">{{ loadingLabel }}</p>
  </div>

  <div v-else-if="error" class="flex flex-col items-center gap-3 py-14 text-center" role="alert">
    <span class="grid h-11 w-11 place-items-center rounded-full bg-danger-bg text-danger">
      <AdminIcon name="alert" class="h-5 w-5" />
    </span>
    <p class="max-w-md text-sm text-cocoa">{{ error }}</p>
    <BaseButton size="sm" variant="secondary" @click="$emit('retry')">Réessayer</BaseButton>
  </div>

  <div v-else-if="empty" class="flex flex-col items-center gap-2 py-14 text-center">
    <span class="grid h-11 w-11 place-items-center rounded-full bg-ivory text-gold">
      <AdminIcon name="info" class="h-5 w-5" />
    </span>
    <p class="text-sm text-cocoa-dark">{{ emptyLabel }}</p>
    <p v-if="emptyHint" class="max-w-sm text-xs text-muted">{{ emptyHint }}</p>
    <slot name="empty-action" />
  </div>

  <slot v-else />
</template>
