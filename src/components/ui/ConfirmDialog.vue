<script setup>
import BaseButton from './BaseButton.vue'
import BaseModal from './BaseModal.vue'

/**
 * Confirmation avant une action irréversible.
 * Rien n'est jamais supprimé sans passer par ici.
 */
defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: 'Confirmer la suppression' },
  message: { type: String, required: true },
  confirmLabel: { type: String, default: 'Supprimer' },
  busy: { type: Boolean, default: false },
})

defineEmits(['confirm', 'close'])
</script>

<template>
  <BaseModal :open="open" :title="title" size="sm" @close="$emit('close')">
    <p class="text-sm leading-relaxed text-cocoa">{{ message }}</p>
    <p class="mt-3 text-xs text-muted">Cette action est définitive.</p>

    <template #footer>
      <BaseButton variant="secondary" :disabled="busy" @click="$emit('close')">Annuler</BaseButton>
      <BaseButton variant="danger" :loading="busy" @click="$emit('confirm')">
        {{ confirmLabel }}
      </BaseButton>
    </template>
  </BaseModal>
</template>
