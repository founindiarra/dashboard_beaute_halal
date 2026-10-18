<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { appointments, schedule } from '@/services'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toasts'
import { APPOINTMENT_STATUSES, capitalize, formatDateLong, toDateKey } from '@/utils/format'

/**
 * Calendrier des jours : pour chaque jour, ce que voit le site public
 * (ouvert, complet, fermé) et les rendez-vous qui y tombent. Les données
 * sont celles de l'API — `/availability/days` pour l'état des jours,
 * `/admin/appointments` pour les rendez-vous, `/admin/closures` pour les
 * fermetures exceptionnelles. Rien n'est calculé ici.
 */
const auth = useAuthStore()
const toasts = useToastStore()
const canSchedule = computed(() => auth.can('schedule'))

const today = toDateKey()
const cursor = ref(today.slice(0, 7)) // « AAAA-MM »

const loading = ref(false)
const error = ref(null)
const dayInfo = ref(new Map())
const rows = ref([])
const closures = ref([])
const selected = ref(today)
const busy = ref(false)
const windowDays = ref(null)

/* Sélection multiple : griser ou laisser ouverts plusieurs jours d'un coup. */
const multi = ref(false)
const picked = ref([])
const reason = ref('')
const isPicked = (key) => picked.value.includes(key)
const onCell = (key) => {
  if (!multi.value) {
    selected.value = key
    return
  }
  if (key < today || !canSchedule.value) return
  const info = dayInfo.value.get(key)
  if (!closureOn(key) && (!info || info.reason === 'closed')) return // repos hebdo ou hors période : rien à faire ici
  picked.value = isPicked(key) ? picked.value.filter((k) => k !== key) : [...picked.value, key].sort()
}
const toggleMulti = () => {
  multi.value = !multi.value
  picked.value = []
  reason.value = ''
}
const pickedOpen = computed(() => picked.value.filter((k) => !closureOn(k)))
const pickedClosed = computed(() => picked.value.filter((k) => closureOn(k)))

const bulk = async (mode) => {
  busy.value = true
  let done = 0
  try {
    for (const key of picked.value) {
      if (mode === 'close' && !closureOn(key)) {
        await schedule.createClosure({ date: key, reason: reason.value.trim() || null })
        done += 1
      } else if (mode === 'open' && closureOn(key)) {
        await schedule.removeClosure(closureOn(key).id)
        done += 1
      }
    }
    toasts.success(mode === 'close' ? `${done} jour(s) grisé(s) sur le site.` : `${done} jour(s) rouvert(s).`)
    picked.value = []
    reason.value = ''
  } catch (caught) {
    toasts.error(`${caught?.message || 'Opération impossible.'} ${done} jour(s) traité(s) avant l’erreur.`)
  } finally {
    await load()
    busy.value = false
  }
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const monthLabel = computed(() => {
  const [y, m] = cursor.value.split('-').map(Number)
  return capitalize(new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1)))
})

/** Grille du mois : lundi en premier, cases vides avant le 1er. */
const cells = computed(() => {
  const [y, m] = cursor.value.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const lead = (first.getDay() + 6) % 7
  const count = new Date(y, m, 0).getDate()
  const out = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= count; d += 1) out.push(`${cursor.value}-${String(d).padStart(2, '0')}`)
  return out
})
const monthStart = computed(() => `${cursor.value}-01`)
const monthEnd = computed(() => cells.value.filter(Boolean).at(-1))

const load = async () => {
  loading.value = true
  error.value = null
  try {
    const [daysRes, list, closureList] = await Promise.all([
      schedule.days(monthStart.value, monthEnd.value),
      appointments.list({ from: monthStart.value, to: monthEnd.value, order: 'asc', limit: 100 }),
      schedule.closures(),
    ])
    dayInfo.value = new Map((daysRes.days ?? []).map((d) => [d.date, d]))
    windowDays.value = daysRes.windowDays ?? null
    rows.value = list.rows
    closures.value = closureList
  } catch (caught) {
    error.value = caught?.message || 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}
watch(cursor, load, { immediate: true })

const shift = (delta) => {
  const [y, m] = cursor.value.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  cursor.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const goToday = () => {
  cursor.value = today.slice(0, 7)
  selected.value = today
}

const byDay = computed(() => {
  const map = new Map()
  for (const row of rows.value) {
    const key = String(row.date).slice(0, 10)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(row)
  }
  return map
})
const activeOn = (key) => (byDay.value.get(key) ?? []).filter((r) => !['cancelled', 'rejected'].includes(r.status))

const closureOn = (key) => closures.value.find((c) => String(c.date).slice(0, 10) === key)

const STATE = {
  open: { label: 'Ouvert', tone: 'ok', dot: 'bg-ok' },
  full: { label: 'Complet', tone: 'warn', dot: 'bg-warn' },
  closed: { label: 'Fermé', tone: 'neutral', dot: 'bg-muted/50' },
  closed_exceptionally: { label: 'Fermeture exceptionnelle', tone: 'danger', dot: 'bg-danger' },
  past: { label: 'Passé', tone: 'neutral', dot: 'bg-line' },
  out_of_window: { label: 'Hors période de réservation', tone: 'info', dot: 'bg-info/60' },
}
const stateOf = (key) => {
  const info = dayInfo.value.get(key)
  if (closureOn(key)) return STATE.closed_exceptionally
  if (!info) return STATE.out_of_window
  if (info.bookable) return STATE.open
  return STATE[info.reason] ?? STATE.closed
}

const statusOf = (s) => APPOINTMENT_STATUSES[s] ?? { label: s, tone: 'neutral' }

const selectedRows = computed(() => byDay.value.get(selected.value) ?? [])
const selectedInfo = computed(() => dayInfo.value.get(selected.value))
const selectedClosure = computed(() => closureOn(selected.value))
const canToggle = computed(() => canSchedule.value && selected.value >= today)
const hoursClosed = computed(() => !selectedClosure.value && selectedInfo.value?.reason === 'closed')

const closeDay = async () => {
  busy.value = true
  try {
    await schedule.createClosure({ date: selected.value, reason: null })
    await load()
    toasts.success('Jour fermé : il disparaît du calendrier du site.')
  } catch (caught) {
    toasts.error(caught?.message || 'Fermeture impossible.')
  } finally {
    busy.value = false
  }
}
const reopenDay = async () => {
  busy.value = true
  try {
    await schedule.removeClosure(selectedClosure.value.id)
    await load()
    toasts.success('Jour rouvert.')
  } catch (caught) {
    toasts.error(caught?.message || 'Réouverture impossible.')
  } finally {
    busy.value = false
  }
}

const rowLink = (row) =>
  ['pending', 'contacted'].includes(row.status)
    ? { name: 'appointments', query: { search: row.reference } }
    : { name: 'operation', params: { id: row.id } }

const clientName = (row) => `${row.customer?.firstName ?? ''} ${row.customer?.lastName ?? ''}`.trim() || '—'
const timeLabel = (row) => (row.timeToSet ? 'Heure à fixer' : String(row.time).slice(0, 5))
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Calendrier des jours"
      subtitle="L’état de chaque jour tel que le voit le site, et les rendez-vous qui y tombent."
    >
      <template #actions>
        <BaseButton variant="secondary" :to="{ name: 'hours' }">Horaires</BaseButton>
        <BaseButton variant="secondary" :to="{ name: 'closures' }">Fermetures</BaseButton>
      </template>
    </PageHeader>

    <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <section class="card p-3 sm:p-4">
        <header class="mb-3 flex items-center justify-between gap-2">
          <h2 class="font-display text-xl text-cocoa-dark">{{ monthLabel }}</h2>
          <div class="flex items-center gap-1.5">
            <BaseButton v-if="canSchedule" :variant="multi ? 'primary' : 'secondary'" @click="toggleMulti">
              {{ multi ? 'Terminer la sélection' : 'Sélectionner plusieurs jours' }}
            </BaseButton>
            <BaseButton variant="secondary" aria-label="Mois précédent" @click="shift(-1)">‹</BaseButton>
            <BaseButton variant="secondary" @click="goToday">Aujourd’hui</BaseButton>
            <BaseButton variant="secondary" aria-label="Mois suivant" @click="shift(1)">›</BaseButton>
          </div>
        </header>

        <DataState :loading="loading && !dayInfo.size" :error="error" :empty="false" loading-label="Chargement du calendrier…" @retry="load">
          <div class="grid grid-cols-7 gap-1 text-center text-[0.65rem] uppercase tracking-[0.1em] text-muted">
            <span v-for="w in WEEKDAYS" :key="w" class="py-1">{{ w }}</span>
          </div>
          <div class="mt-1 grid grid-cols-7 gap-1" role="grid" :aria-label="monthLabel">
            <template v-for="(key, i) in cells" :key="key || `e${i}`">
              <span v-if="!key" />
              <button
                v-else
                type="button"
                class="relative flex min-h-[3.6rem] flex-col items-start rounded-lg border p-1.5 text-left transition-colors sm:min-h-[4.6rem]"
                :class="[
                  isPicked(key) || (!multi && selected === key)
                    ? 'border-cocoa bg-ivory ring-1 ring-cocoa'
                    : 'border-line bg-surface hover:bg-ivory/60',
                  key < today ? 'opacity-60' : '',
                ]"
                :aria-label="`${formatDateLong(key)} : ${stateOf(key).label}, ${activeOn(key).length} rendez-vous`"
                :aria-pressed="multi ? isPicked(key) : selected === key"
                @click="onCell(key)"
              >
                <span class="text-sm" :class="key === today ? 'font-semibold text-cocoa' : 'text-ink'">{{ Number(key.slice(8)) }}</span>
                <span class="mt-auto flex w-full items-center justify-between gap-1">
                  <span class="h-2 w-2 shrink-0 rounded-full" :class="stateOf(key).dot" />
                  <span
                    v-if="activeOn(key).length"
                    class="rounded-full bg-btn px-1.5 text-[0.65rem] leading-4 text-cream"
                  >{{ activeOn(key).length }}</span>
                </span>
              </button>
            </template>
          </div>

          <ul class="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <li v-for="s in [STATE.open, STATE.full, STATE.closed, STATE.closed_exceptionally, STATE.out_of_window]" :key="s.label" class="flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full" :class="s.dot" />{{ s.label }}
            </li>
            <li class="flex items-center gap-1.5"><span class="rounded-full bg-btn px-1.5 text-[0.65rem] text-cream">n</span>rendez-vous</li>
          </ul>
          <p v-if="windowDays" class="mt-2 text-xs text-muted">
            Le site propose les jours jusqu’à {{ windowDays }} jours à l’avance (réglage « Fenêtre de réservation » dans les paramètres du salon).
          </p>
        </DataState>
      </section>

      <aside v-if="multi" class="card flex flex-col gap-4 p-4">
        <h2 class="font-display text-xl text-cocoa-dark">Sélection multiple</h2>
        <p class="text-sm text-muted">
          Touchez les jours à modifier. Les jours grisés n’apparaissent plus comme réservables sur le site ;
          les repos hebdomadaires se règlent dans « Horaires ».
        </p>
        <p class="text-sm text-cocoa-dark">
          {{ picked.length }} jour(s) choisi(s)
          <span v-if="picked.length" class="text-muted">· {{ pickedOpen.length }} à griser, {{ pickedClosed.length }} à rouvrir</span>
        </p>
        <BaseField v-model="reason" label="Motif (facultatif, visible dans le dashboard)" placeholder="Ex. Formation, congé…" />
        <div class="flex flex-col gap-1.5">
          <BaseButton :loading="busy" :disabled="!pickedOpen.length" @click="bulk('close')">
            Griser {{ pickedOpen.length || '' }} jour(s)
          </BaseButton>
          <BaseButton variant="secondary" :loading="busy" :disabled="!pickedClosed.length" @click="bulk('open')">
            Laisser ouvert{{ pickedClosed.length > 1 ? 's' : '' }} {{ pickedClosed.length || '' }} jour(s)
          </BaseButton>
        </div>
      </aside>

      <aside v-else class="card flex flex-col gap-4 p-4">
        <header class="flex flex-col gap-2">
          <h2 class="font-display text-xl text-cocoa-dark">{{ capitalize(formatDateLong(selected)) }}</h2>
          <div class="flex flex-wrap items-center gap-2">
            <StatusBadge :label="stateOf(selected).label" :tone="stateOf(selected).tone" />
            <span v-if="selectedInfo && selectedInfo.totalSlots" class="text-xs text-muted">
              {{ selectedInfo.availableSlots }} / {{ selectedInfo.totalSlots }} créneaux libres
            </span>
          </div>
          <p v-if="selectedClosure?.reason" class="text-xs text-muted">Motif : {{ selectedClosure.reason }}</p>
        </header>

        <div v-if="canToggle" class="flex flex-col gap-1.5">
          <BaseButton v-if="selectedClosure" variant="secondary" :loading="busy" @click="reopenDay">Laisser ce jour ouvert</BaseButton>
          <BaseButton v-else-if="!hoursClosed" variant="secondary" :loading="busy" @click="closeDay">Griser ce jour</BaseButton>
          <p v-else class="text-xs text-muted">Jour de repos hebdomadaire : modifiable dans « Horaires ».</p>
        </div>

        <div>
          <h3 class="mb-2 text-xs uppercase tracking-[0.1em] text-muted">Rendez-vous ({{ selectedRows.length }})</h3>
          <p v-if="!selectedRows.length" class="text-sm text-muted">Aucun rendez-vous ce jour-là.</p>
          <ul v-else class="flex flex-col gap-2">
            <li v-for="row in selectedRows" :key="row.id">
              <RouterLink :to="rowLink(row)" class="flex flex-col gap-1 rounded-xl border border-line px-3 py-2 hover:bg-ivory/60">
                <span class="flex items-center justify-between gap-2">
                  <span class="text-sm text-cocoa-dark">{{ clientName(row) }}</span>
                  <span class="text-xs text-muted">{{ timeLabel(row) }}</span>
                </span>
                <span class="truncate text-xs text-muted">{{ row.service?.name }}</span>
                <span><StatusBadge :label="statusOf(row.status).label" :tone="statusOf(row.status).tone" /></span>
              </RouterLink>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>
