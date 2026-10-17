<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { agents as agentsApi, offices as officesApi, operations as api } from '@/services'
import { useResource } from '@/composables/useResource'
import {
  OPERATION_STATUSES,
  addDays,
  formatDateShort,
  formatPrice,
  initialsOf,
  paymentStatusOf,
  statusOf,
  toDateKey,
  toLocalDate,
} from '@/utils/format'

const router = useRouter()

/*
 * Toute la ligne ouvre la fiche, pas seulement le nom.
 *
 * Les colonnes « heure », « prestation », « bureau » et « statut » n'étaient
 * pas cliquables : on cliquait sur la ligne d'une cliente et rien ne se
 * passait, ce qui se lit comme une panne alors que c'était une zone morte.
 * Le nom et le chevron restent des liens véritables — pour le clavier, et
 * pour ouvrir dans un nouvel onglet — et ce gestionnaire ne fait que
 * rattraper les clics tombés à côté.
 */
const ouvrirFiche = (item, evenement) => {
  // Un clic parti d'un lien ou d'un bouton se débrouille tout seul.
  if (evenement?.target?.closest?.('a, button')) return
  router.push(ficheLink(item))
}

/**
 * Une demande du site simplement « contactée » n'a ni heure ni prix : elle
 * n'a pas encore de fiche de traitement. Elle se gère dans « Rendez-vous ».
 */
const ficheLink = (item) =>
  item.status === 'contacted'
    ? { name: 'appointments', query: { search: item.reference } }
    : { name: 'operation', params: { id: item.id } }

/**
 * Rendez-vous confirmés — la page de travail de la journée.
 *
 * Elle prend la suite de « Rendez-vous », qui sert à décider des demandes.
 * Ici, tout est déjà décidé : il s'agit d'accueillir, d'installer, de faire
 * et d'encaisser. D'où les quatre statuts retenus et aucun autre —
 * confirmé, cliente présente, prestation en cours, prestation terminée.
 *
 * Les rendez-vous annulés, refusés et non honorés restent consultables
 * depuis le filtre de statut, mais ne s'affichent pas par défaut : ils ne
 * demandent plus rien à personne.
 */
const rows = ref([])
const meta = ref(null)
const loading = ref(false)
const error = ref(null)

const { data: offices } = useResource(officesApi.list, [])
const { data: agents } = useResource(agentsApi.list, [])

const filters = ref({
  search: '',
  status: '',
  periode: 'all',
  from: '',
  to: '',
  officeId: '',
  agentId: '',
  page: 1,
})

const STATUS_OPTIONS = [
  { value: '', label: 'Tous les statuts à traiter' },
  ...[...OPERATION_STATUSES, 'contacted'].map((value) => ({ value, label: statusOf(value).label })),
  { value: 'cancelled', label: 'Annulé' },
  { value: 'rejected', label: 'Refusé' },
  { value: 'no_show', label: 'Absente' },
]

const PERIODES = [
  { value: 'today', label: 'Aujourd’hui' },
  { value: 'tomorrow', label: 'Demain' },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'all', label: 'Toutes les dates' },
  { value: 'custom', label: 'Période personnalisée' },
]

/**
 * Bornes d'une période nommée. La semaine commence le lundi — c'est la
 * semaine française, et c'est celle que lit le salon sur son planning.
 */
const bornesDe = (periode) => {
  const aujourdhui = toDateKey()
  if (periode === 'today') return [aujourdhui, aujourdhui]
  if (periode === 'tomorrow') {
    const demain = addDays(aujourdhui, 1)
    return [demain, demain]
  }
  if (periode === 'week') {
    const d = toLocalDate(aujourdhui)
    // getDay() : 0 = dimanche. On ramène au lundi précédent.
    const versLundi = (d.getDay() + 6) % 7
    const lundi = addDays(aujourdhui, -versLundi)
    return [lundi, addDays(lundi, 6)]
  }
  if (periode === 'month') {
    const d = toLocalDate(aujourdhui)
    const premier = toDateKey(new Date(d.getFullYear(), d.getMonth(), 1))
    const dernier = toDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    return [premier, dernier]
  }
  return ['', '']
}

const choisirPeriode = (periode) => {
  filters.value.periode = periode
  if (periode === 'custom') return
  const [from, to] = bornesDe(periode)
  filters.value.from = from
  filters.value.to = to
  filters.value.page = 1
}

const officeOptions = computed(() => [
  { value: '', label: 'Tous les bureaux' },
  ...(offices.value ?? []).map((item) => ({
    value: String(item.id),
    label: `${item.number} — ${item.name}`,
  })),
])

const agentOptions = computed(() => [
  { value: '', label: 'Tous les agents' },
  ...(agents.value ?? []).map((item) => ({ value: String(item.id), label: item.name })),
])

const hasFilters = computed(
  () =>
    Boolean(
      filters.value.search ||
      filters.value.status ||
      filters.value.officeId ||
      filters.value.agentId,
    ) || filters.value.periode !== 'all',
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
      officeId: filters.value.officeId || undefined,
      agentId: filters.value.agentId || undefined,
      order: 'asc',
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
  () => [
    filters.value.status,
    filters.value.from,
    filters.value.to,
    filters.value.officeId,
    filters.value.agentId,
  ],
  () => {
    filters.value.page = 1
    load()
  },
)

watch(() => filters.value.page, load)

load()

const reinitialiser = () => {
  const [from, to] = bornesDe('all')
  filters.value = {
    search: '',
    status: '',
    periode: 'all',
    from,
    to,
    officeId: '',
    agentId: '',
    page: 1,
  }
  load()
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Rendez-vous confirmés"
      subtitle="Accueil, installation, prestation, encaissement. Les demandes en attente se décident depuis « Rendez-vous »."
    >
      <template #actions>
        <BaseButton size="sm" variant="secondary" :to="{ name: 'appointments' }">
          <AdminIcon name="calendar" class="h-3.5 w-3.5" />
          Toutes les demandes
        </BaseButton>
      </template>
    </PageHeader>

    <!-- ── Filtres ── -->
    <div class="card flex flex-col gap-3 p-3.5">
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="periode in PERIODES"
          :key="periode.value"
          type="button"
          class="rounded-full border px-3 py-1 text-xs transition-colors"
          :class="
            filters.periode === periode.value
              ? 'border-cocoa-dark bg-cocoa-dark text-cream'
              : 'border-line text-cocoa hover:border-gold hover:text-gold'
          "
          :aria-pressed="filters.periode === periode.value"
          @click="choisirPeriode(periode.value)"
        >
          {{ periode.label }}
        </button>
      </div>

      <div class="flex flex-col gap-3 lg:flex-row lg:items-end">
        <SearchInput
          v-model="filters.search"
          label="Rechercher une cliente"
          placeholder="Nom, référence, e-mail, téléphone…"
        />
        <div class="grid flex-1 gap-3 sm:grid-cols-3">
          <BaseField v-model="filters.status" label="Statut" :options="STATUS_OPTIONS" />
          <BaseField v-model="filters.officeId" label="Bureau" :options="officeOptions" />
          <BaseField v-model="filters.agentId" label="Agent" :options="agentOptions" />
        </div>
      </div>

      <!-- Les deux dates n'apparaissent que si l'on choisit une période libre. -->
      <div v-if="filters.periode === 'custom'" class="grid gap-3 sm:grid-cols-2 lg:max-w-md">
        <BaseField v-model="filters.from" label="Du" type="date" />
        <BaseField v-model="filters.to" label="Au" type="date" />
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

    <!-- ── Liste ── -->
    <section class="card overflow-hidden">
      <DataState
        :loading="loading"
        :error="error"
        :empty="!rows.length"
        loading-label="Chargement des rendez-vous…"
        :empty-label="
          hasFilters
            ? 'Aucun rendez-vous ne correspond à ces filtres.'
            : 'Aucun rendez-vous confirmé pour aujourd’hui.'
        "
        empty-hint="Les rendez-vous apparaissent ici dès qu’ils sont confirmés depuis la page « Rendez-vous »."
        @retry="load"
      >
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Heure</th>
                <th>Cliente</th>
                <th class="hidden lg:table-cell">Prestation</th>
                <th class="hidden md:table-cell">Bureau · Agent</th>
                <th>Statut</th>
                <th class="hidden sm:table-cell">Paiement</th>
                <th class="w-10"><span class="sr-only">Ouvrir</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in rows"
                :key="item.id"
                class="cursor-pointer"
                @click="ouvrirFiche(item, $event)"
              >
                <td class="whitespace-nowrap">
                  <span class="block font-medium text-cocoa-dark">{{ item.timeToSet ? 'Heure à fixer' : item.time }}</span>
                  <span class="block text-xs text-muted">{{ formatDateShort(item.date) }}</span>
                </td>
                <td class="min-w-[10rem]">
                  <RouterLink
                    :to="ficheLink(item)"
                    class="flex items-center gap-2.5"
                  >
                    <span class="avatar">{{ initialsOf(item.customer) }}</span>
                    <span class="min-w-0">
                      <span class="block truncate text-cocoa-dark">
                        {{ item.customer.firstName }} {{ item.customer.lastName }}
                      </span>
                      <span class="block text-xs text-muted">{{ item.reference }}</span>
                    </span>
                  </RouterLink>
                </td>
                <td class="hidden max-w-[14rem] truncate lg:table-cell">{{ item.serviceName }}</td>
                <td class="hidden md:table-cell">
                  <span class="block text-xs text-cocoa-dark">
                    {{
                      item.office ? `${item.office.number} — ${item.office.name}` : 'Non attribué'
                    }}
                  </span>
                  <span class="block text-xs text-muted">{{
                    item.agentName || 'Aucun agent'
                  }}</span>
                </td>
                <td>
                  <StatusBadge
                    :label="statusOf(item.status).label"
                    :tone="statusOf(item.status).tone"
                  />
                </td>
                <td class="hidden sm:table-cell">
                  <StatusBadge
                    :label="paymentStatusOf(item.totals.status).label"
                    :tone="paymentStatusOf(item.totals.status).tone"
                  />
                  <span class="mt-0.5 block text-[0.7rem] text-muted">
                    {{ formatPrice(item.totals.paid, item.totals.currency) }} /
                    {{ formatPrice(item.totals.payable, item.totals.currency) }}
                  </span>
                </td>
                <td class="text-right">
                  <RouterLink
                    :to="ficheLink(item)"
                    class="inline-grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark"
                    :aria-label="`Ouvrir la fiche de ${item.customer.firstName} ${item.customer.lastName}`"
                  >
                    <AdminIcon name="chevron-right" class="h-4 w-4" />
                  </RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="meta && meta.pages > 1"
          class="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted"
        >
          <span>{{ meta.total }} rendez-vous · page {{ meta.page }} sur {{ meta.pages }}</span>
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
