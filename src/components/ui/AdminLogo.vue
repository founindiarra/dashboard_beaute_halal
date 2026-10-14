<script setup>
/**
 * Marque de Beauté Halal : deux mèches de locks entrelacées.
 *
 * Même motif que le favicon et que le site public, sans son carré marron —
 * ce fond se confondrait avec la barre latérale et la page de connexion, qui
 * sont de la même couleur.
 *
 * Les deux mèches sont peintes en `currentColor`, la seconde en retrait : la
 * couleur se règle depuis le parent par une simple classe de texte, comme
 * pour le monogramme qu'elle remplace.
 */
defineProps({
  /** Texte alternatif ; vide, le logo est traité comme décoratif. */
  title: { type: String, default: '' },
})
</script>

<template>
  <svg
    viewBox="21 11 26 39"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :role="title ? 'img' : 'presentation'"
    :aria-hidden="title ? undefined : 'true'"
    :aria-label="title || undefined"
  >
    <path
      d="M32 13c-6 6-9 11-9 16 0 4 2.4 6.6 4.7 8.6 2 1.7 3.3 3 3.3 5.1 0 2-1.2 3.6-3 4.8 5.6-.6 9-3.6 9-7.4 0-2.6-1.4-4.4-3.5-6.2-2.1-1.8-3.5-3.3-3.5-5.6 0-3.2 2-6.4 5.4-10.2-.9-1.9-2.2-3.6-3.4-5.1Z"
      fill="currentColor"
    />
    <path
      d="M39.4 24.4c-3 3.6-4.6 6.6-4.6 9.4 0 2.4 1.2 4 2.7 5.4 1.3 1.2 2.1 2.2 2.1 3.6 0 1.5-.9 2.8-2.4 3.7 4.3-.3 7-2.6 7-5.6 0-2-1-3.5-2.4-4.8-1.4-1.3-2.3-2.3-2.3-3.9 0-2 1.2-4.2 3.2-6.7-1-.4-2.1-.8-3.3-1.1Z"
      fill="currentColor"
      opacity="0.62"
    />
  </svg>
</template>
