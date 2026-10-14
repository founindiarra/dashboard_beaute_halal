<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { history as api } from '@/services'
import {
  formatDateShort,
  formatPrice,
  initialsOf,
  paymentStatusOf,
  statusOf,
} from '@/utils/format'

/**
 * Historique des prestations.
 *
 * On y retrouve les clientes déjà venues : ce qu'elles ont fait faire, par
 * qui, dans quel bureau, ce qu'elles ont payé — et l'avis qu'elles ont
 * laissé, quand il y en a un.
 *
 * L'avis est rattaché au rendez-vous par un identifiant, jamais par
 * rapprochement de noms : deux clientes peuvent s'appeler pareil, et une
 * correspondance approximative finirait par afficher l'avis de l'une sous
 * la prestation de l'autre. Un avis saisi sans rendez-vous associé reste
 * visible sur la page « Avis clientes », simplement il n'apparaît pas ici.
 */
const route = useRoute()

const rows = ref([])
const meta = ref(null)
const loading = ref(false)
const error = ref(null)

const filters = ref({
  search: typeof route.query.search === 'string' ? route.query.search : '',
  status: '',
  from: '',
  to: '',
  page: 1,
})

const STATUS_OPTIONS = [
  { value: '', label: 'Terminées et non honorées' },
  { value: 'completed', label: 'Prestations terminées' },
  { value: 'no_show', label: 'Clientes absentes' },
]

const hasFilters = computed(() =>
  Boolean(filters.value.search || filters.value.status || filters.value.from || filters.value.to),
)

const load = async () => {
  loading.value = true
  error.value = null
  try {
    const result = await api.list({
      search: filters.value.search || undefined,
      status: filters.value.status || undefined,
      from: filters.value.from || undefined,
      to: filters.value.to || undefined,
      page: filters.value.page,
      limit: 25,
    })
    rows.value = result.rows
    meta.value = result.meta
  } catch (caught) {
    error.value = caught?.message || 'Chargement impossible.'
    rows.value = []
  } finally {
    loading.value = false
  }
}

let debounce = null
watch(
  () => filters.value.search,
  () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      filters.value.page = 1
      load()
    }, 350)
  },
)

watch(
  () => [filters.value.status, filters.value.from, filters.value.to],
  () => {
    filters.value.page = 1
    load()
  },
)

watch(() => filters.value.page, load)

load()

const reinitialiser = () => {
  filters.value = { search: '', status: '', from: '', to: '', page: 1 }
  load()
}

/** Ligne dépliée pour lire l'avis en entier. */
const ouvert = ref(null)
const basculer = (id) => {
  ouvert.value = ouvert.value === id ? null : id
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Historique des prestations"
      subtitle="Les clientes déjà venues, ce qu’elles ont payé et l’avis qu’elles ont laissé."
    />

    <div class="card flex flex-col gap-3 p-3.5">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-end">
        <SearchInput
          v-model="filters.search"
          label="Rechercher une cliente"
          placeholder="Nom, référence, e-mail, téléphone…"
        />
        <div class="grid flex-1 gap-3 sm:grid-cols-3">
          <BaseField v-model="filters.status" label="Statut" :options="STATUS_OPTIONS" />
          <BaseField v-model="filters.from" label="Du" type="date" />
          <BaseField v-model="filters.to" label="Au" type="date" />
        </div>
      </div>

      <div v-if="hasFilters">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs text-muted transition-colors hover:text-danger"
          @click="reinitialiser"
        >
          <AdminIcon name="close" class="h-3 w-3" />
          Effacer les filtres
        </button>
      </div>
    </div>

    <section class="card overflow-hidden">
      <DataState
        :loading="loading"
        :error="error"
        :empty="!rows.length"
        loading-label="Chargement de l’historique…"
        :empty-label="
          hasFilters
            ? 'Aucune prestation ne correspond à ces filtres.'
            : 'Aucune prestation terminée pour l’instant.'
        "
        empty-hint="Une prestation entre dans l’historique dès qu’elle est marquée « Terminé »."
        @retry="load"
      >
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Cliente</th>
                <th class="hidden lg:table-cell">Prestation</th>
                <th class="hidden md:table-cell">Agent · Bureau</th>
                <th class="hidden sm:table-cell">Montant</th>
                <th>Avis</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="item in rows" :key="item.id">
                <tr>
                  <td class="whitespace-nowrap">
                    <span class="block text-cocoa-dark">{{ formatDateShort(item.date) }}</span>
                    <span class="block text-xs text-muted">{{ item.time }}</span>
                  </td>
                  <td class="min-w-[10rem]">
                    <RouterLink
                      :to="{ name: 'operation', params: { id: item.id } }"
                      class="flex items-center gap-2.5"
                    >
                      <span class="avatar">{{ initialsOf(item.customer) }}</span>
                      <span class="min-w-0">
                        <span class="block truncate text-cocoa-dark">
                          {{ item.customer.firstName }} {{ item.customer.lastName }}
                        </span>
                        <span class="block truncate text-xs text-muted">
                          {{ item.customer.phone }}
                        </span>
                      </span>
                    </RouterLink>
                  </td>
                  <td class="hidden max-w-[13rem] truncate lg:table-cell">
                    <span class="block truncate text-cocoa-dark">{{ item.serviceName }}</span>
                    <StatusBadge
                      v-if="item.status !== 'completed'"
                      :label="statusOf(item.status).label"
                      :tone="statusOf(item.status).tone"
                      class="mt-1"
                    />
                  </td>
                  <td class="hidden md:table-cell">
                    <span class="block text-xs text-cocoa-dark">
                      {{ item.agentName || 'Agent non renseigné' }}
                    </span>
                    <span class="block text-xs text-muted">{{ item.office || '—' }}</span>
                  </td>
                  <td class="hidden whitespace-nowrap sm:table-cell">
                    <span class="block text-cocoa-dark">
                      {{ formatPrice(item.totals.paid, item.totals.currency) }}
                    </span>
                    <span v-if="item.totals.discount > 0" class="block text-xs text-muted">
                      dont − {{ formatPrice(item.totals.discount, item.totals.currency) }}
                    </span>
                    <StatusBadge
                      :label="paymentStatusOf(item.totals.status).label"
                      :tone="paymentStatusOf(item.totals.status).tone"
                      class="mt-1"
                    />
                  </td>
                  <td>
                    <button
                      v-if="item.review"
                      type="button"
                      class="flex items-center gap-1 text-gold transition-opacity hover:opacity-80"
                      :aria-expanded="ouvert === item.id"
                      @click="basculer(item.id)"
                    >
                      <!--
                        « fill-current » l'emporte sur l'attribut fill="none"
                        du jeu d'icônes : c'est ce qui distingue une étoile
                        pleine d'une étoile vide, et non l'opacité seule.
                      -->
                      <AdminIcon
                        v-for="n in 5"
                        :key="n"
                        name="star"
                        class="h-3.5 w-3.5"
                        :class="n <= item.review.rating ? 'fill-current' : 'opacity-30'"
                      />
                      <AdminIcon
                        name="chevron-down"
                        class="h-3 w-3 text-muted transition-transform"
                        :class="ouvert === item.id ? 'rotate-180' : ''"
                      />
                    </button>
                    <span v-else class="text-xs text-muted">—</span>
                  </td>
                </tr>

                <!-- Avis déplié : on le lit en entier sans quitter la liste. -->
                <tr v-if="item.review && ouvert === item.id">
                  <td colspan="6" class="bg-ivory/50">
                    <p class="whitespace-pre-line text-sm text-cocoa">
                      « {{ item.review.comment }} »
                    </p>
                    <p class="mt-1.5 text-xs text-muted">
                      {{ item.review.rating }}/5 —
                      {{
                        item.review.reviewedOn
                          ? `avis du ${formatDateShort(item.review.reviewedOn)}`
                          : 'date non renseignée'
                      }}
                    </p>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <div
          v-if="meta && meta.pages > 1"
          class="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted"
        >
          <span>{{ meta.total }} prestations · page {{ meta.page }} sur {{ meta.pages }}</span>
          <div class="flex gap-1.5">
            <BaseButton
              size="sm"
              variant="secondary"
              :disabled="filters.page <= 1"
              @click="filters.page -= 1"
            >
              <AdminIcon name="chevron-left" class="h-3.5 w-3.5" />
              Précédent
            </BaseButton>
            <BaseButton
              size="sm"
              variant="secondary"
              :disabled="filters.page >= meta.pages"
              @click="filters.page += 1"
            >
              Suivant
              <AdminIcon name="chevron-right" class="h-3.5 w-3.5" />
            </BaseButton>
          </div>
        </div>
      </DataState>
    </section>
  </div>
</template>
