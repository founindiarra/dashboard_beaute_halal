<script setup>
import { computed } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useResource } from '@/composables/useResource'
import { accounting as api } from '@/services'
import { capitalize, formatDateLong, formatPrice } from '@/utils/format'

/**
 * Caisse du jour — la seule vue comptable ouverte à un agent (droit « Caisse du jour »).
 *
 * Elle montre le chiffre d'affaires et les dépenses d'AUJOURD'HUI, rien d'autre :
 * ni soldes, ni comptes, ni autres journées. Cette limite est tenue par le serveur
 * (route /admin/accounting/today), pas seulement par cet écran.
 */
const { data, loading, error, reload } = useResource(api.today, null)

const tiles = computed(() => [
  { label: 'Chiffre d’affaires du jour', value: data.value?.collected, icon: 'cash', tone: 'ok' },
  { label: 'Dépenses du jour', value: data.value?.spent, icon: 'list', tone: 'warn' },
  { label: 'Résultat du jour', value: data.value?.net, icon: 'check', tone: 'ink' },
])
const heure = (iso) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '')
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Caisse du jour"
      :subtitle="data ? capitalize(formatDateLong(data.date)) : 'Chiffres d’aujourd’hui'"
    >
      <template #actions>
        <BaseButton variant="secondary" size="sm" :loading="loading" @click="reload">
          <AdminIcon name="refresh" class="h-3.5 w-3.5" />
          Actualiser
        </BaseButton>
      </template>
    </PageHeader>

    <DataState :loading="loading && !data" :error="!data ? error : null" loading-label="Chargement de la caisse…" @retry="reload">
      <template v-if="data">
        <div class="grid gap-4 sm:grid-cols-3">
          <article v-for="t in tiles" :key="t.label" class="card flex flex-col gap-2 p-5">
            <span class="text-xs uppercase tracking-[0.12em] text-muted">{{ t.label }}</span>
            <strong
              class="font-display text-[1.9rem] leading-none"
              :class="t.tone === 'ok' ? 'text-ok' : t.tone === 'warn' ? 'text-warn' : 'text-cocoa-dark'"
            >
              {{ formatPrice(t.value, 'FCFA') }}
            </strong>
          </article>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <section class="card overflow-hidden">
            <header class="px-5 py-4"><h2 class="text-[0.98rem]">Encaissements du jour</h2></header>
            <p v-if="!data.payments.length" class="px-5 pb-5 text-sm text-muted">Aucun encaissement aujourd’hui.</p>
            <ul v-else class="divide-y divide-line-soft">
              <li v-for="p in data.payments" :key="p.id" class="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span class="min-w-0">
                  <span class="block truncate text-cocoa-dark">{{ p.label }}</span>
                  <span class="block text-xs text-muted">{{ heure(p.createdAt) }}<template v-if="p.appointmentReference"> · {{ p.appointmentReference }}</template></span>
                </span>
                <strong class="shrink-0 text-ok">+ {{ formatPrice(p.amount, p.currency) }}</strong>
              </li>
            </ul>
          </section>

          <section class="card overflow-hidden">
            <header class="px-5 py-4"><h2 class="text-[0.98rem]">Dépenses du jour</h2></header>
            <p v-if="!data.expenses.length" class="px-5 pb-5 text-sm text-muted">Aucune dépense aujourd’hui.</p>
            <ul v-else class="divide-y divide-line-soft">
              <li v-for="e in data.expenses" :key="e.id" class="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span class="min-w-0">
                  <span class="block truncate text-cocoa-dark">{{ e.label }}</span>
                  <span class="block text-xs text-muted">{{ heure(e.createdAt) }}<template v-if="e.category"> · {{ e.category.name }}</template></span>
                </span>
                <strong class="shrink-0 text-warn">− {{ formatPrice(e.amount, e.currency) }}</strong>
              </li>
            </ul>
          </section>
        </div>
      </template>
    </DataState>
  </div>
</template>
