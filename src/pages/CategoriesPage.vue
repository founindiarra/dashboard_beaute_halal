<script setup>
import CategoryManager from '@/components/ui/CategoryManager.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { serviceCategories } from '@/services'
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Catégories de prestations"
      subtitle="Elles structurent la page « Nos services » et la première étape de la réservation."
    />

    <CategoryManager
      :api="serviceCategories"
      item-label="catégorie"
      in-use-hint="Si des prestations y appartiennent encore, la suppression sera refusée."
    />
  </div>
</template>
