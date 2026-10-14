<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import ToastStack from '@/components/ui/ToastStack.vue'
import AdminLayout from '@/layouts/AdminLayout.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()

/**
 * La page de connexion n'a pas de coquille d'administration.
 * On attend aussi que la session ait été vérifiée avant de rendre quoi que ce
 * soit : sans cela, l'interface apparaîtrait une fraction de seconde avant
 * d'être remplacée par le formulaire de connexion.
 *
 * La condition d'authentification n'est pas redondante avec `route.meta` :
 * au tout premier rendu, la navigation initiale n'est pas encore résolue et
 * la route courante ne porte aucune méta. Sans elle, la coquille se montait
 * le temps d'un battement sur la page de connexion et lançait ses appels
 * protégés sans jeton — deux 401 inutiles à chaque arrivée sur le site.
 */
const bare = computed(() => Boolean(route.meta?.public) || !auth.isAuthenticated)
</script>

<template>
  <div v-if="!auth.ready" class="grid min-h-dvh place-items-center bg-canvas">
    <span
      class="h-8 w-8 animate-spin rounded-full border-2 border-sand-dark border-t-gold"
      role="status"
      aria-label="Chargement"
    />
  </div>

  <RouterView v-else-if="bare" />

  <AdminLayout v-else>
    <RouterView />
  </AdminLayout>

  <ToastStack />
</template>
