<script setup>
import { computed } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import AdminLogo from '@/components/ui/AdminLogo.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useResource } from '@/composables/useResource'
import { appointments as appointmentsApi, stats as statsApi } from '@/services'
import { useAuthStore } from '@/stores/auth'
import { APPOINTMENT_STATUSES, addDays, formatDateShort, toDateKey } from '@/utils/format'

/**
 * Toutes les valeurs affichées ici viennent de l'API.
 * Rien n'est estimé, extrapolé ni inventé : une donnée que l'API n'expose
 * pas n'apparaît pas sur cette page.
 */
const auth = useAuthStore()
const today = toDateKey()

const { data: stats, loading, error, reload } = useResource(statsApi.get, null)

/**
 * Prochains rendez-vous : `order=asc` trie du plus proche au plus lointain.
 * Sans ce paramètre, la page 1 renverrait les rendez-vous les plus éloignés.
 */
const loadUpcoming = () =>
  appointmentsApi
    .list({ from: today, order: 'asc', limit: 8 })
    .then((result) => result.rows.filter((item) => item.status !== 'cancelled'))

const {
  data: upcoming,
  loading: upcomingLoading,
  error: upcomingError,
  reload: reloadUpcoming,
} = useResource(loadUpcoming, [])

/**
 * Une tuile n'est affichée que si l'API a réellement fourni son chiffre.
 *
 * Toutes les clés sont lues en accès facultatif et les valeurs absentes sont
 * écartées : une API plus ancienne, qui ne renverrait qu'une partie des
 * compteurs, affiche ce qu'elle sait et tait le reste — au lieu de faire
 * échouer le rendu de toute la page, ce qui la figerait sur son état vide.
 */
const defined = (tiles) => tiles.filter((tile) => tile.value !== undefined && tile.value !== null)

const cards = computed(() => {
  const rdv = stats.value?.appointments
  const messages = stats.value?.messages
  return defined([
    {
      key: 'today',
      label: 'Rendez-vous aujourd’hui',
      value: rdv?.today,
      icon: 'calendar',
      to: { name: 'appointments', query: { from: today, to: today } },
    },
    {
      key: 'upcoming',
      label: 'Rendez-vous à venir',
      value: rdv?.upcoming,
      icon: 'arrow-right',
      to: { name: 'appointments', query: { from: addDays(today, 1) } },
    },
    {
      key: 'pending',
      label: 'En attente de confirmation',
      value: rdv?.pending,
      icon: 'clock',
      tone: rdv?.pending > 0 ? 'warn' : null,
      to: { name: 'appointments', query: { status: 'pending' } },
    },
    {
      key: 'messages',
      label: 'Messages non lus',
      value: messages?.unread,
      icon: 'mail',
      tone: messages?.unread > 0 ? 'warn' : null,
      to: { name: 'messages', query: { status: 'new' } },
    },
  ])
})

const secondary = computed(() => {
  const catalog = stats.value?.catalog
  const customers = stats.value?.customers

  // Les avis se lisent « publiés / total » : les deux chiffres sont nécessaires.
  const avis =
    catalog?.testimonialsPublished != null && catalog?.testimonialsTotal != null
      ? `${catalog.testimonialsPublished} / ${catalog.testimonialsTotal}`
      : undefined

  return defined([
    { label: 'Prestations actives', value: catalog?.servicesActive, to: { name: 'services' } },
    { label: 'Catégories', value: catalog?.categoriesActive, to: { name: 'categories' } },
    { label: 'Coiffures publiées', value: catalog?.galleryActive, to: { name: 'gallery' } },
    { label: 'Avis publiés', value: avis, to: { name: 'testimonials' } },
    { label: 'Clientes distinctes', value: customers?.distinct, to: { name: 'appointments' } },
  ])
})

const refreshAll = () => {
  reload()
  reloadUpcoming()
}

const statusOf = (status) => APPOINTMENT_STATUSES[status] ?? { label: status, tone: 'neutral' }

/** Initiales d'une cliente : tiennent lieu de photo, que l'API ne fournit pas. */
const initialsOf = (customer) =>
  [customer?.firstName, customer?.lastName]
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .join('')
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      :title="`Bonjour ${auth.user?.name?.split(' ')[0] || ''}`"
      subtitle="Voici un aperçu de votre activité aujourd’hui."
    >
      <template #actions>
        <BaseButton variant="secondary" size="sm" @click="refreshAll">
          <AdminIcon name="refresh" class="h-3.5 w-3.5" />
          Actualiser
        </BaseButton>
      </template>
    </PageHeader>

    <!-- ── Compteurs principaux, et la carte de marque à leur droite ── -->
    <DataState
      :loading="loading"
      :error="error"
      loading-label="Chargement des statistiques…"
      @retry="reload"
    >
      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <RouterLink
            v-for="card in cards"
            :key="card.key"
            :to="card.to"
            class="card stat-card transition-colors hover:border-gold/50"
          >
            <span class="stat-icon" :class="card.tone === 'warn' ? '!bg-warn-bg !text-warn' : ''">
              <AdminIcon :name="card.icon" class="h-[1.15rem] w-[1.15rem]" />
            </span>

            <span class="block">
              <span class="block text-[0.78rem] leading-snug text-muted">{{ card.label }}</span>
              <span class="stat-value mt-1.5 block" :class="card.tone === 'warn' ? '!text-warn' : ''">
                {{ card.value }}
              </span>
            </span>

            <span class="stat-link">
              Voir le détail
              <AdminIcon name="arrow-right" class="h-3.5 w-3.5" />
            </span>
          </RouterLink>
        </div>

        <!--
          Carte de marque. Elle ne porte aucune donnée : elle ancre l'outil de
          travail dans l'identité du salon, comme sur le site public.
        -->
        <aside
          class="flex flex-col justify-between gap-6 rounded-[1.15rem] bg-cocoa-dark p-5 text-cream"
        >
          <AdminLogo class="h-7 w-auto text-gold-soft" />
          <p class="font-display text-[1.35rem] leading-snug">
            « Des locks qui révèlent votre beauté naturelle »
          </p>
          <p class="text-[0.7rem] uppercase tracking-[0.2em] text-gold-soft">Beauté Halal</p>
        </aside>
      </div>
    </DataState>

    <!-- ── Rendez-vous à venir, et la volumétrie du contenu à leur droite ── -->
    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section class="card overflow-hidden">
        <header class="flex items-center justify-between gap-3 px-5 py-4">
          <h2 class="flex items-center gap-2.5 text-[0.98rem]">
            <AdminIcon name="calendar" class="h-[1.05rem] w-[1.05rem] text-gold" />
            Prochains rendez-vous
          </h2>
          <RouterLink :to="{ name: 'appointments' }" class="panel-link">
            Tout voir
            <AdminIcon name="arrow-right" class="h-3.5 w-3.5" />
          </RouterLink>
        </header>

        <DataState
          :loading="upcomingLoading"
          :error="upcomingError"
          :empty="!upcoming.length"
          loading-label="Chargement des rendez-vous…"
          empty-label="Aucun rendez-vous à venir."
          empty-hint="Les nouvelles réservations du site apparaîtront ici."
          @retry="reloadUpcoming"
        >
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th class="pl-5">Cliente</th>
                  <th class="hidden sm:table-cell">Prestation</th>
                  <th>Date &amp; heure</th>
                  <th class="pr-5">Statut</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in upcoming" :key="item.id">
                  <td class="pl-5">
                    <span class="flex items-center gap-3">
                      <span class="avatar" aria-hidden="true">{{ initialsOf(item.customer) }}</span>
                      <span class="min-w-0">
                        <RouterLink
                          :to="{ name: 'appointments', query: { search: item.reference } }"
                          class="block truncate text-cocoa-dark transition-colors hover:text-gold"
                        >
                          {{ item.customer.firstName }} {{ item.customer.lastName }}
                        </RouterLink>
                        <span class="block truncate text-xs text-muted">{{ item.reference }}</span>
                      </span>
                    </span>
                  </td>
                  <td class="hidden max-w-[15rem] truncate sm:table-cell">{{ item.service.name }}</td>
                  <td class="whitespace-nowrap">
                    {{ formatDateShort(item.date) }}
                    <span class="text-muted">•</span>
                    <span class="font-medium text-cocoa-dark">{{ item.time }}</span>
                  </td>
                  <td class="pr-5">
                    <StatusBadge
                      :label="statusOf(item.status).label"
                      :tone="statusOf(item.status).tone"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </DataState>
      </section>

      <!-- ── Volumétrie du contenu, seulement si l'API la fournit ── -->
      <section v-if="secondary.length" class="card overflow-hidden">
        <header class="px-5 py-4">
          <h2 class="flex items-center gap-2.5 text-[0.98rem]">
            <AdminIcon name="list" class="h-[1.05rem] w-[1.05rem] text-gold" />
            Votre contenu
          </h2>
        </header>
        <div class="divide-y divide-line-soft">
          <RouterLink
            v-for="item in secondary"
            :key="item.label"
            :to="item.to"
            class="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-ivory/50"
          >
            <span class="min-w-0 truncate text-[0.82rem] text-muted">{{ item.label }}</span>
            <span class="shrink-0 font-display text-lg text-cocoa-dark">{{ item.value }}</span>
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>
