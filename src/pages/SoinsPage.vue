<script setup>
import { ref } from 'vue'

import SoinsDemandes from '@/components/soins/SoinsDemandes.vue'
import SoinsEtapes from '@/components/soins/SoinsEtapes.vue'
import PageHeader from '@/components/ui/PageHeader.vue'

/**
 * Soins capillaires : les étapes de la prise de rendez-vous du site, les
 * demandes à traiter (confirmer / annuler, la cliente est prévenue) et
 * l’historique des clientes dont le soin est terminé.
 */
const TABS = [
  { id: 'etapes', label: 'Étapes du site' },
  { id: 'demandes', label: 'Demandes de soin' },
  { id: 'historique', label: 'Historique des clientes' },
]
const tab = ref('etapes')
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="Soins capillaires" subtitle="Les étapes de la prise de rendez-vous, les demandes à traiter et l’historique des clientes." />

    <div class="flex flex-wrap gap-2" role="tablist" aria-label="Soins capillaires">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        role="tab"
        :aria-selected="tab === t.id"
        class="rounded-full border px-4 py-2 text-sm transition"
        :class="tab === t.id ? 'border-transparent bg-cocoa-dark text-white' : 'border-line bg-white text-cocoa-dark hover:border-cocoa-dark'"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <SoinsEtapes v-if="tab === 'etapes'" />
    <SoinsDemandes v-else :key="tab" :mode="tab" />
  </div>
</template>
