<script setup>
/**
 * Marque de Beauté Halal : le logo du salon (portrait doré) dans un rond cerclé d'or.
 *
 * La taille se règle depuis le parent (`h-10 w-10`). Sur fond sombre
 * (barre latérale, connexion), le rond est toujours cerclé d'or champagne.
 */
defineProps({
  title: { type: String, default: '' },
  ring: { type: Boolean, default: false },
})
</script>

<template>
  <img
    src="/badge.png"
    :alt="title"
    :aria-hidden="title ? undefined : 'true'"
    class="admin-badge"
    :class="{ 'admin-badge--ring': ring }"
  />
</template>

<style scoped>
.admin-badge {
  flex: none;
  border-radius: 9999px;
  object-fit: cover;
  background: #fff;
  box-shadow: 0 0 0 2px #e5c56b, 0 8px 18px -8px rgba(50, 24, 15, 0.7);
}
</style>
