<script setup>
/**
 * Marque de Beauté Halal — le badge du site public (v3) : pastille ronde
 * au dégradé marron brillant, « S » blanc à deux traits.
 *
 * La taille se règle depuis le parent (`h-10 w-10`). Sur fond sombre
 * (barre latérale, connexion), `ring` ajoute l'anneau caramel du site.
 */
defineProps({
  title: { type: String, default: '' },
  ring: { type: Boolean, default: false },
})
</script>

<template>
  <span
    class="admin-badge"
    :class="{ 'admin-badge--ring': ring }"
    :role="title ? 'img' : 'presentation'"
    :aria-hidden="title ? undefined : 'true'"
    :aria-label="title || undefined"
  >
    <svg viewBox="0 0 40 40" focusable="false">
      <path d="M20 5c-7 5-7 10 0 15s7 10 0 15" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" />
      <path d="M14 8c7 5 7 10 0 15" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".6" />
    </svg>
  </span>
</template>

<style scoped>
.admin-badge {
  display: grid;
  place-items: center;
  flex: none;
  border-radius: 9999px;
  background: var(--grad-brand);
  box-shadow: 0 8px 18px -8px rgba(87, 42, 19, 0.8);
}
.admin-badge--ring {
  box-shadow: 0 0 0 2px #cbac81;
}
.admin-badge svg {
  width: 58%;
  height: 58%;
}
</style>
