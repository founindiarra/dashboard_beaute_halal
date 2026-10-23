<script setup>
import { computed, ref, watch } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataState from '@/components/ui/DataState.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { appointments as appointmentsApi, bookingRequests as api } from '@/services'
import { useToastStore } from '@/stores/toasts'
import {
  BESOIN_LABELS,
  LOCK_TYPE_LABELS,
  REQUEST_STATUSES,
  formatDateLong,
  formatDateShort,
  formatDateTime,
  formatFcfa,
  toDateKey,
} from '@/utils/format'

/**
 * Deux vues sur les demandes de prise de rendez-vous faites sur le site :
 *  – « demandes » : celles qu’il faut traiter, avec Confirmer / Annuler ;
 *  – « historique » : toutes les clientes dont le soin est terminé.
 *
 * Aucun message n’est écrit ici : le serveur prévient la cliente au
 * changement de statut (confirmée, annulée, déclinée), selon les modèles de
 * la page Messagerie.
 */
const props = defineProps({ mode: { type: String, default: 'demandes' } })
const toasts = useToastStore()

const FILTERS = [
  { value: 'pending', label: 'Nouvelles' },
  { value: 'contacted', label: 'Contactées' },
  { value: 'confirmed', label: 'Confirmées' },
  { value: 'completed', label: 'Terminées' },
  { value: 'cancelled', label: 'Annulées' },
  { value: 'rejected', label: 'Déclinées' },
  { value: 'all', label: 'Toutes' },
]
const MODE_LABELS = { telephone: 'Par téléphone', whatsapp: 'Par WhatsApp', sur_place: 'En salon', ignoree: 'Consultation ignorée' }

const rows = ref([])
const meta = ref(null)
const loading = ref(false)
const error = ref(null)
const page = ref(1)
const status = ref('pending')
const isHistory = computed(() => props.mode === 'historique')
// Historique : une ligne par cliente ; on déplie pour voir ses demandes.
const clients = ref([])
const opened = ref(null)
const clientRequests = ref([])
const clientLoading = ref(false)
const search = ref('')

const load = async () => {
  loading.value = true
  error.value = null
  try {
    if (isHistory.value) {
      const result = await api.clients({ search: search.value.trim() || undefined, page: page.value, limit: 20 })
      clients.value = result.rows
      meta.value = result.meta
      return
    }
    const result = await api.list({ kind: 'soin', status: status.value === 'all' ? undefined : status.value, search: search.value.trim() || undefined, page: page.value, limit: 20 })
    rows.value = result.rows
    meta.value = result.meta
  } catch (caught) {
    error.value = caught?.message || 'Chargement impossible.'
    rows.value = []
    clients.value = []
  } finally {
    loading.value = false
  }
}
load()

let timer = null
watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    page.value = 1
    load()
  }, 300)
})
watch(status, () => {
  page.value = 1
  load()
})
watch(page, load)

const toggleClient = async (c) => {
  if (opened.value === c.key) {
    opened.value = null
    return
  }
  opened.value = c.key
  clientRequests.value = []
  clientLoading.value = true
  try {
    clientRequests.value = (await api.list({ kind: 'soin', phoneKey: c.key, limit: 50 })).rows
  } catch (caught) {
    toasts.error(caught?.message || 'Impossible de charger les demandes de cette cliente.')
  } finally {
    clientLoading.value = false
  }
}

const statusOf = (value) => REQUEST_STATUSES[value] ?? { label: value, tone: 'neutral' }
const summary = (r) => (r.consultation?.mode ? 'Consultation capillaire' : [BESOIN_LABELS[r.besoin] ?? r.besoin, LOCK_TYPE_LABELS[r.lockType] ?? r.lockType].filter(Boolean).join(' · '))
const consultationOf = (r) => {
  const k = r.consultation
  if (!k) return ''
  const mode = MODE_LABELS[k.mode] ?? ''
  const locks = k.hasLocks === null ? '' : k.hasLocks ? 'a déjà des locks' : 'pas encore de locks'
  const slot = k.date ? `${formatDateShort(k.date)}${k.time ? ` à ${k.time}` : ''}` : ''
  return [mode, locks, slot].filter(Boolean).join(' · ')
}
const estimateOf = (r) => (r.estimate ? `${r.estimate.partial ? 'À partir de ' : ''}${formatFcfa(r.estimate.total)}` : '—')
const canAct = (r) => ['pending', 'contacted', 'confirmed'].includes(r.status)

const replace = (updated) => {
  // Une demande qui change de statut sort de la liste filtrée.
  rows.value = rows.value.filter((x) => x.id !== updated.id)
}

/* ── Confirmer : jour, heure et prix convenus ── */
const target = ref(null)
const planOpen = ref(false)
const planning = ref(false)
const planError = ref('')
const plan = ref({ date: '', time: '', price: '' })

const openPlan = (r) => {
  target.value = r
  plan.value = { date: r.desiredDate || toDateKey(), time: '', price: r.estimate ? String(r.estimate.total) : '' }
  planError.value = ''
  planOpen.value = true
}
const submitPlan = async () => {
  planError.value = ''
  if (!plan.value.date || !plan.value.time) return (planError.value = 'Indiquez le jour et l’heure convenus avec la cliente.')
  const prix = Math.round(Number(plan.value.price))
  if (!Number.isFinite(prix) || prix < 1) return (planError.value = 'Indiquez le prix convenu : la cliente le reçoit dans sa confirmation.')
  planning.value = true
  try {
    const result = await api.convert(target.value.id, { date: plan.value.date, time: plan.value.time, price: prix })
    replace(result.request)
    planOpen.value = false
    toasts.success('Rendez-vous confirmé. La cliente reçoit son message de confirmation.')
  } catch (caught) {
    planError.value = caught?.message || 'Confirmation impossible.'
  } finally {
    planning.value = false
  }
}

/* ── Annuler (ou décliner une nouvelle demande) ── */
const cancelOpen = ref(false)
const cancelling = ref(false)
const cancelTarget = ref(null)
const askCancel = (r) => {
  cancelTarget.value = r
  cancelOpen.value = true
}
const cancelMessage = computed(() => {
  const r = cancelTarget.value
  if (!r) return ''
  const nom = `${r.firstName} ${r.lastName}`
  return r.status === 'confirmed'
    ? `Le rendez-vous de ${nom} sera annulé et elle recevra un message d’annulation.`
    : `La demande de ${nom} sera déclinée et elle recevra un message pour la prévenir.`
})
const doCancel = async () => {
  const r = cancelTarget.value
  cancelling.value = true
  try {
    // Un rendez-vous déjà confirmé s'annule côté rendez-vous (créneau libéré) ; la demande suit.
    if (r.status === 'confirmed' && r.appointmentId) await appointmentsApi.setStatus(r.appointmentId, 'cancelled')
    else await api.update(r.id, { status: r.status === 'confirmed' ? 'cancelled' : 'rejected' })
    replace(r)
    cancelOpen.value = false
    toasts.success('Fait. La cliente est prévenue par message.')
  } catch (caught) {
    toasts.error(caught?.message || 'Action impossible.')
    cancelOpen.value = false
  } finally {
    cancelling.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-muted">
      <template v-if="mode === 'historique'">
        Toutes les clientes qui ont pris un rendez-vous de soin capillaire (consultation capillaire) chez Beauté Halal, de la plus récente à la plus ancienne. Touchez une cliente pour voir ses rendez-vous.
      </template>
      <template v-else>
        Uniquement les rendez-vous de consultation capillaire pris sur le site (sur place, par téléphone ou par WhatsApp). Les demandes de coiffure se suivent dans « Demandes » et « Rendez-vous ». En confirmant ou en annulant, la cliente reçoit
        automatiquement un message (WhatsApp, selon les réglages de la Messagerie).
      </template>
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <template v-if="mode !== 'historique'">
        <button
          v-for="f in FILTERS"
          :key="f.value"
          type="button"
          class="rounded-full border px-3 py-1.5 text-sm transition"
          :class="status === f.value ? 'border-transparent bg-cocoa-dark text-white' : 'border-line bg-white text-cocoa-dark hover:border-cocoa-dark'"
          @click="status = f.value"
        >
          {{ f.label }}
        </button>
      </template>
      <SearchInput v-model="search" class="ml-auto min-w-[14rem]" placeholder="Nom, téléphone, référence…" />
    </div>

    <DataState :loading="loading" :error="error" :empty="isHistory ? !clients.length : !rows.length" :empty-label="isHistory ? 'Aucune cliente n’a encore effectué de soin ou de rendez-vous.' : 'Aucune demande ici pour le moment.'" loading-label="Chargement…" @retry="load">
      <ul v-if="isHistory" class="flex flex-col gap-3">
        <li v-for="c in clients" :key="c.key" class="card flex flex-col gap-3 p-4">
          <button type="button" class="flex w-full flex-wrap items-start justify-between gap-2 text-left" :aria-expanded="opened === c.key" @click="toggleClient(c)">
            <span class="min-w-0">
              <span class="block font-display text-lg text-cocoa-dark">{{ c.firstName }} {{ c.lastName }}</span>
              <span class="block text-xs text-muted">{{ c.phone }}<template v-if="c.email"> · {{ c.email }}</template></span>
            </span>
            <span class="flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge :label="`${c.requests} demande${c.requests > 1 ? 's' : ''}`" tone="neutral" />
              <StatusBadge v-if="c.completed" :label="`${c.completed} terminé${c.completed > 1 ? 's' : ''}`" tone="ok" />
              <StatusBadge v-if="c.cancelled" :label="`${c.cancelled} annulé${c.cancelled > 1 ? 's' : ''}`" tone="danger" />
            </span>
          </button>
          <p class="text-sm text-muted">
            Dernière demande le {{ formatDateTime(c.lastAt) }} · {{ c.lastMode ? 'Consultation capillaire' : ([BESOIN_LABELS[c.lastBesoin] ?? c.lastBesoin, LOCK_TYPE_LABELS[c.lastLockType] ?? c.lastLockType].filter(Boolean).join(' · ') || '—') }} ·
            {{ statusOf(c.lastStatus).label }}
          </p>
          <div v-if="opened === c.key" class="border-t border-line pt-3">
            <p v-if="clientLoading" class="text-sm text-muted">Chargement…</p>
            <ul v-else class="flex flex-col gap-2">
              <li v-for="r in clientRequests" :key="r.id" class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ivory px-3 py-2 text-sm">
                <span>
                  {{ summary(r) || '—' }} · <span class="text-muted">{{ r.reference }} · reçue le {{ formatDateTime(r.createdAt) }}</span>
                  <span v-if="r.desiredDate" class="text-muted"> · jour souhaité {{ formatDateShort(r.desiredDate) }}</span>
                </span>
                <StatusBadge :label="statusOf(r.status).label" :tone="statusOf(r.status).tone" />
              </li>
            </ul>
          </div>
        </li>
      </ul>
      <ul v-else class="flex flex-col gap-3">
        <li v-for="r in rows" :key="r.id" class="card flex flex-col gap-3 p-4">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="font-display text-lg text-cocoa-dark">{{ r.firstName }} {{ r.lastName }}</p>
              <p class="text-xs text-muted">{{ r.phone }} · {{ r.email }} · {{ r.reference }}</p>
            </div>
            <StatusBadge :label="statusOf(r.status).label" :tone="statusOf(r.status).tone" />
          </div>
          <dl class="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt class="inline text-muted">Soin : </dt><dd class="inline">{{ summary(r) || '—' }}</dd></div>
            <div><dt class="inline text-muted">Jour souhaité : </dt><dd class="inline">{{ r.desiredDate ? formatDateLong(r.desiredDate) : '—' }}</dd></div>
            <div><dt class="inline text-muted">Estimation : </dt><dd class="inline">{{ estimateOf(r) }}</dd></div>
            <div><dt class="inline text-muted">Reçue le : </dt><dd class="inline">{{ formatDateTime(r.createdAt) }}</dd></div>
            <div v-if="consultationOf(r)" class="sm:col-span-2"><dt class="inline text-muted">Consultation : </dt><dd class="inline">{{ consultationOf(r) }}</dd></div>
            <div v-if="r.note" class="sm:col-span-2"><dt class="inline text-muted">Note de la cliente : </dt><dd class="inline">{{ r.note }}</dd></div>
          </dl>
          <div v-if="mode !== 'historique' && canAct(r)" class="flex flex-wrap gap-2">
            <BaseButton v-if="r.status !== 'confirmed'" @click="openPlan(r)">Confirmer le rendez-vous</BaseButton>
            <BaseButton variant="danger" @click="askCancel(r)">{{ r.status === 'confirmed' ? 'Annuler le rendez-vous' : 'Décliner la demande' }}</BaseButton>
          </div>
        </li>
      </ul>
      <div v-if="meta && meta.pages > 1" class="flex items-center justify-center gap-3 pt-2 text-sm">
        <BaseButton variant="subtle" :disabled="page <= 1" @click="page -= 1">Précédent</BaseButton>
        <span class="text-muted">Page {{ page }} / {{ meta.pages }}</span>
        <BaseButton variant="subtle" :disabled="page >= meta.pages" @click="page += 1">Suivant</BaseButton>
      </div>
    </DataState>

    <BaseModal :open="planOpen" title="Confirmer le rendez-vous" :subtitle="target ? `${target.firstName} ${target.lastName} · ${target.reference}` : ''" size="sm" @close="planOpen = false">
      <div class="flex flex-col gap-4">
        <p class="text-sm text-muted">
          Indiquez le jour, l’heure et le <strong class="text-cocoa-dark">prix</strong> convenus avec la cliente : elle reçoit
          ensuite un message de confirmation avec ces informations.
        </p>
        <div class="grid grid-cols-2 gap-3">
          <BaseField v-model="plan.date" label="Jour" type="date" required />
          <BaseField v-model="plan.time" label="Heure" type="time" required />
        </div>
        <BaseField v-model="plan.price" label="Prix convenu (FCFA)" type="number" min="1" step="500" required />
        <p v-if="planError" class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-xs text-danger" role="alert">{{ planError }}</p>
      </div>
      <template #footer>
        <BaseButton variant="secondary" :disabled="planning" @click="planOpen = false">Fermer</BaseButton>
        <BaseButton :loading="planning" @click="submitPlan">Confirmer et prévenir la cliente</BaseButton>
      </template>
    </BaseModal>

    <ConfirmDialog
      :open="cancelOpen"
      :busy="cancelling"
      :title="cancelTarget?.status === 'confirmed' ? 'Annuler le rendez-vous' : 'Décliner la demande'"
      :confirm-label="cancelTarget?.status === 'confirmed' ? 'Annuler et prévenir' : 'Décliner et prévenir'"
      :message="cancelMessage"
      @confirm="doCancel"
      @close="cancelOpen = false"
    />
  </div>
</template>
