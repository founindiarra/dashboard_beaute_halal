<script setup>
import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
</script>

<template>
  <div class="flex min-h-[60svh] flex-col items-center justify-center gap-5 text-center">
    <span class="font-display text-6xl text-gold">404</span>
    <div class="max-w-md">
      <h1 class="text-xl">Cette page n’existe pas</h1>
      <p class="mt-1.5 text-sm text-muted">
        Le lien est peut-être erroné, ou la section a été renommée.
      </p>
    </div>
    <BaseButton :to="{ name: 'dashboard' }">
      <AdminIcon name="arrow-left" class="h-3.5 w-3.5" />
      Retour au tableau de bord
    </BaseButton>
  </div>
</template>
