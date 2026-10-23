<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppointmentDetail from '@/components/appointments/AppointmentDetail.vue'
import MonthCalendar from '@/components/appointments/MonthCalendar.vue'
import WalkInModal from '@/components/appointments/WalkInModal.vue'
import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { appointments as api } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { APPOINTMENT_STATUSES, addDays, formatDateShort, toDateKey } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const toasts = useToastStore()

const view = ref('list') // list | calendar
const rows = ref([])
const meta = ref(null)
const loading = ref(false)
const error = ref(null)

const filters = ref({
  search: typeof route.query.search === 'string' ? route.query.search : '',
  status: typeof route.query.status === 'string' ? route.query.status : '',
  from: typeof route.query.from === 'string' ? route.query.from : '',
  to: typeof route.query.to === 'string' ? route.query.to : '',
  page: 1,
})

const selected = ref(null)

/*
 * Rendez-vous pris au comptoir.
 *
 * La cliente qui pousse la porte sans avoir réservé ne doit pas obliger le
 * salon à passer par le site public. Le rendez-vous qui en sort est un
 * rendez-vous comme les autres — même créneau vérifié, même fiche cliente,
 * même proforma — à ceci près qu'il naît confirmé.
 */
const walkInOpen = ref(false)

const onWalkInCreated = async (cree) => {
  walkInOpen.value = false
  toasts.success(`Rendez-vous ${cree.reference} enregistré et confirmé.`)
  await load()
  // On ouvre la fiche : c'est de là que part l'accueil, puis l'encaissement.
  router.push({ name: 'operation', params: { id: cree.id } })
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  ...Object.entries(APPOINTMENT_STATUSES).map(([value, { label }]) => ({ value, label })),
]

const statusOf = (status) => APPOINTMENT_STATUSES[status] ?? { label: status, tone: 'neutral' }

const hasFilters = computed(() =>
  Boolean(filters.value.search || filters.value.status || filters.value.from || filters.value.to),
)

/** En vue calendrier on charge le mois entier, sinon une page paginée. */
const load = async () => {
  loading.value = true
  error.value = null
  try {
    const params =
      view.value === 'calendar'
        ? { from: monthStart.value, to: monthEnd.value, order: 'asc', limit: 100 }
        : {
            search: filters.value.search || undefined,
            status: filters.value.status || undefined,
            from: filters.value.from || undefined,
            to: filters.value.to || undefined,
            order: 'desc',
            page: filters.value.page,
            limit: 25,
          }
    const result = await api.list(params)
    rows.value = result.rows
    meta.value = result.meta
  } catch (caught) {
    error.value = caught?.message || 'Chargement impossible.'
    rows.value = []
  } finally {
    loading.value = false
  }
}

/* ── Vue calendrier ── */
const cursor = ref(new Date())
const monthStart = computed(() => {
  const d = cursor.value
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), 1))
})
const monthEnd = computed(() => {
  const d = cursor.value
  return toDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0))
})

const shiftMonth = (step) => {
  const d = cursor.value
  cursor.value = new Date(d.getFullYear(), d.getMonth() + step, 1)
}

/* ── Déclencheurs de rechargement ── */
let debounce = null
watch(
  () => filters.value.search,
  () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      filters.value.page = 1
      if (view.value === 'list') load()
    }, 350)
  },
)

watch(
  () => [filters.value.status, filters.value.from, filters.value.to],
  () => {
    filters.value.page = 1
    if (view.value === 'list') load()
  },
)

watch(() => filters.value.page, load)
watch(view, load)
watch([monthStart, monthEnd], () => {
  if (view.value === 'calendar') load()
})

load()

const resetFilters = () => {
  filters.value = { search: '', status: '', from: '', to: '', page: 1 }
  router.replace({ query: {} })
  load()
}

const quickRange = (days) => {
  const start = toDateKey()
  filters.value.from = start
  filters.value.to = days === 0 ? start : addDays(start, days)
  filters.value.page = 1
}

/* ── Actions ── */
const open = async (item) => {
  try {
    selected.value = await api.find(item.id)
  } catch (caught) {
    toasts.error(caught?.message || 'Ouverture impossible.')
  }
}

const onUpdated = (updated) => {
  selected.value = updated
  const index = rows.value.findIndex((row) => row.id === updated.id)
  if (index >= 0) rows.value[index] = updated
  load()
}

const onDeleted = () => {
  selected.value = null
  load()
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Rendez-vous"
      subtitle="Les réservations du site public et celles prises au comptoir."
    >
      <template #actions>
        <BaseButton size="sm" @click="walkInOpen = true">
          <AdminIcon name="plus" class="h-3.5 w-3.5" />
          Au comptoir
        </BaseButton>

        <div class="flex rounded-lg border border-line bg-surface p-0.5">
          <button
            v-for="mode in [
              { key: 'list', label: 'Liste', icon: 'list' },
              { key: 'calendar', label: 'Calendrier', icon: 'calendar' },
            ]"
            :key="mode.key"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            :class="
              view === mode.key ? 'bg-cocoa-dark text-cream' : 'text-muted hover:text-cocoa-dark'
            "
            :aria-pressed="view === mode.key"
            @click="view = mode.key"
          >
            <AdminIcon :name="mode.icon" class="h-3.5 w-3.5" />
            {{ mode.label }}
          </button>
        </div>
      </template>
    </PageHeader>

    <!-- ── Filtres (vue liste) ── -->
    <div v-if="view === 'list'" class="card flex flex-col gap-3 p-3.5">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-end">
        <SearchInput
          v-model="filters.search"
          placeholder="Référence, nom, e-mail, téléphone…"
          label="Rechercher un rendez-vous"
        />

        <div class="grid flex-1 gap-3 sm:grid-cols-3">
          <BaseField v-model="filters.status" label="Statut" :options="STATUS_OPTIONS" />
          <BaseField v-model="filters.from" label="Du" type="date" />
          <BaseField v-model="filters.to" label="Au" type="date" />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="preset in [
            { label: 'Aujourd’hui', days: 0 },
            { label: '7 prochains jours', days: 7 },
            { label: '30 prochains jours', days: 30 },
          ]"
          :key="preset.label"
          type="button"
          class="rounded-full border border-line px-3 py-1 text-xs text-cocoa transition-colors hover:border-gold hover:text-gold"
          @click="quickRange(preset.days)"
        >
          {{ preset.label }}
        </button>
        <button
          v-if="hasFilters"
          type="button"
          class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs text-muted transition-colors hover:text-danger"
          @click="resetFilters"
        >
          <AdminIcon name="close" class="h-3 w-3" />
          Effacer les filtres
        </button>
      </div>
    </div>

    <!-- ── Vue calendrier ── -->
    <div v-else class="card p-3.5">
      <MonthCalendar
        :cursor="cursor"
        :appointments="rows"
        :loading="loading"
        @shift="shiftMonth"
        @select="open"
      />
    </div>

    <!-- ── Liste ── -->
    <section v-if="view === 'list'" class="card overflow-hidden">
      <DataState
        :loading="loading"
        :error="error"
        :empty="!rows.length"
        loading-label="Chargement des rendez-vous…"
        :empty-label="
          hasFilters ? 'Aucun rendez-vous ne correspond à ces filtres.' : 'Aucun rendez-vous.'
        "
        @retry="load"
      >
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Heure</th>
                <th>Cliente</th>
                <th class="hidden md:table-cell">Contact</th>
                <th class="hidden lg:table-cell">Prestation</th>
                <th>Statut</th>
                <th class="w-10"><span class="sr-only">Détail</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in rows" :key="item.id" class="cursor-pointer" @click="open(item)">
                <td class="whitespace-nowrap">{{ formatDateShort(item.date) }}</td>
                <td class="whitespace-nowrap font-medium text-cocoa-dark">
                  <span v-if="item.timeToSet" class="text-xs font-normal italic text-muted">à fixer</span>
                  <template v-else>{{ item.time }}</template>
                </td>
                <td class="min-w-[9rem]">
                  <span class="block text-cocoa-dark">
                    {{ item.customer.firstName }} {{ item.customer.lastName }}
                  </span>
                  <span class="block text-xs text-muted">
                    {{ item.reference }}
                    <span v-if="item.source === 'site-v3'" class="ml-1 rounded bg-gold/15 px-1.5 py-px text-[0.6rem] font-medium uppercase tracking-wider text-gold">Site</span>
                  </span>
                </td>
                <td class="hidden md:table-cell">
                  <span class="block text-xs">{{ item.customer.phone }}</span>
                  <span class="block max-w-[13rem] truncate text-xs text-muted">
                    {{ item.customer.email }}
                  </span>
                </td>
                <td class="hidden max-w-[15rem] truncate lg:table-cell">{{ item.service.name }}</td>
                <td>
                  <StatusBadge
                    :label="statusOf(item.status).label"
                    :tone="statusOf(item.status).tone"
                  />
                  <span v-if="item.request?.payment?.needsReview" class="mt-1 block"><StatusBadge label="Payé · à régulariser" tone="danger" /></span>
                  <span v-else-if="item.request?.payment?.status === 'paid'" class="mt-1 block text-[0.7rem] text-muted">
                    {{ item.request.payment.autoConfirmed ? 'Payé · confirmé auto' : 'Payé' }}
                  </span>
                </td>
                <td class="text-right">
                  <AdminIcon name="chevron-right" class="h-4 w-4 text-sand-dark" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ── Pagination ── -->
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

    <AppointmentDetail
      :appointment="selected"
      @close="selected = null"
      @updated="onUpdated"
      @deleted="onDeleted"
    />
    <WalkInModal :open="walkInOpen" @close="walkInOpen = false" @created="onWalkInCreated" />
  </div>
</template>
