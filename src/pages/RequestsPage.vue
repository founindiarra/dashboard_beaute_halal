<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { agents as agentsApi, bookingRequests as api, offices as officesApi } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { toDateKey } from '@/utils/format'
import {
  BESOIN_LABELS,
  DELAI_LABELS,
  ETAT_LABELS,
  FORMULE_LABELS,
  LOCK_TYPE_LABELS,
  REQUEST_NOTIFIED,
  REQUEST_STATUSES,
  VOLUME_LABELS,
  formatDateLong,
  formatDateShort,
  formatDateTime,
  formatFcfa,
  whatsappNumber,
} from '@/utils/format'

/**
 * Demandes envoyées depuis le site : la cliente indique son besoin et le
 * JOUR souhaité — jamais d'heure. Le salon la rappelle, fixe l'heure avec
 * elle, puis passe la demande en « Confirmée » (ou « Déclinée »).
 *
 * Le montant affiché est l'estimation indicative calculée par le serveur au
 * moment de la demande ; le tarif final est annoncé par le salon.
 */
const route = useRoute()
const toasts = useToastStore()

const rows = ref([])
const meta = ref(null)
const counts = ref(null)
const loading = ref(false)
const error = ref(null)
const page = ref(1)
const filters = ref({
  status: typeof route.query.status === 'string' ? route.query.status : '',
  search: typeof route.query.search === 'string' ? route.query.search : '',
})

const STATUS_OPTIONS = [
  { value: '', label: 'Toutes les demandes' },
  ...Object.entries(REQUEST_STATUSES).map(([value, { label }]) => ({ value, label })),
]

const statusOf = (value) => REQUEST_STATUSES[value] ?? { label: value, tone: 'neutral' }

const load = async () => {
  loading.value = true
  error.value = null
  try {
    const [result, stats] = await Promise.all([
      api.list({
        status: filters.value.status || undefined,
        search: filters.value.search.trim() || undefined,
        page: page.value,
        limit: 20,
      }),
      api.stats().catch(() => null),
    ])
    rows.value = result.rows
    meta.value = result.meta
    counts.value = stats
  } catch (caught) {
    error.value = caught?.message || 'Chargement impossible.'
    rows.value = []
  } finally {
    loading.value = false
  }
}
load()

let timer = null
watch(
  () => filters.value.search,
  () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      page.value = 1
      load()
    }, 300)
  },
)
watch(
  () => filters.value.status,
  () => {
    page.value = 1
    load()
  },
)
watch(page, load)

const summary = (item) =>
  [BESOIN_LABELS[item.besoin] ?? item.besoin, LOCK_TYPE_LABELS[item.lockType] ?? item.lockType]
    .filter(Boolean)
    .join(' · ')

const estimateOf = (item) =>
  item.estimate ? `${item.estimate.partial ? 'À partir de ' : ''}${formatFcfa(item.estimate.total)}` : '—'

/* ── Détail ── */
const selected = ref(null)
const adminNote = ref('')
const saving = ref(false)

const open = (item) => {
  selected.value = item
  adminNote.value = item.adminNote ?? ''
}

const replaceInList = (updated) => {
  rows.value = rows.value.map((row) => (row.id === updated.id ? updated : row))
}

/* ── Confirmer et planifier : la demande devient un rendez-vous ── */
const planOpen = ref(false)
const planning = ref(false)
const planError = ref('')
const plan = ref({ date: '', time: '', price: '', duration: '', officeId: '', staffId: '' })
const officeOptions = ref([{ value: '', label: 'Non attribué' }])
const agentOptions = ref([{ value: '', label: 'Non attribué' }])

const openPlan = async () => {
  const r = selected.value
  plan.value = {
    date: r.desiredDate || toDateKey(),
    time: '',
    price: r.estimate ? String(r.estimate.total) : '',
    duration: '',
    officeId: '',
    staffId: '',
  }
  planError.value = ''
  planOpen.value = true
  try {
    const [offices, team] = await Promise.all([officesApi.list(), agentsApi.list()])
    officeOptions.value = [
      { value: '', label: 'Non attribué' },
      ...offices.filter((o) => o.isActive !== false).map((o) => ({ value: String(o.id), label: o.name })),
    ]
    agentOptions.value = [
      { value: '', label: 'Non attribué' },
      ...team.filter((a) => a.isActive !== false).map((a) => ({ value: String(a.id), label: a.name })),
    ]
  } catch {
    /* listes facultatives : la planification reste possible sans */
  }
}

const submitPlan = async () => {
  planError.value = ''
  if (!plan.value.date || !plan.value.time) {
    planError.value = 'Indiquez le jour et l’heure convenus avec la cliente.'
    return
  }
  const prix = Math.round(Number(plan.value.price))
  if (!Number.isFinite(prix) || prix < 1) {
    planError.value = 'Indiquez le prix convenu avec la cliente : elle le recevra dans sa confirmation.'
    return
  }
  planning.value = true
  try {
    const payload = { date: plan.value.date, time: plan.value.time, price: prix }
    if (plan.value.duration !== '') payload.durationMinutes = Math.round(Number(plan.value.duration))
    if (plan.value.officeId) payload.officeId = Number(plan.value.officeId)
    if (plan.value.staffId) payload.staffId = Number(plan.value.staffId)
    const result = await api.convert(selected.value.id, payload)
    selected.value = result.request
    replaceInList(result.request)
    api.stats().then((s) => (counts.value = s)).catch(() => {})
    planOpen.value = false
    toasts.success('Rendez-vous planifié. La cliente est prévenue si WhatsApp est actif.')
  } catch (caught) {
    planError.value = caught?.message || 'Planification impossible.'
  } finally {
    planning.value = false
  }
}

const setStatus = async (status) => {
  if (!selected.value || selected.value.status === status) return
  // Confirmer = fixer l'heure et créer le rendez-vous suivi.
  if (status === 'confirmed' && !selected.value.appointmentId) {
    openPlan()
    return
  }
  saving.value = true
  try {
    const updated = await api.update(selected.value.id, { status })
    selected.value = updated
    replaceInList(updated)
    api.stats().then((s) => (counts.value = s)).catch(() => {})
    toasts.success(
      REQUEST_NOTIFIED.includes(status)
        ? 'Statut mis à jour. La cliente est prévenue si WhatsApp est actif.'
        : 'Statut mis à jour.',
    )
  } catch (caught) {
    toasts.error(caught?.message || 'Modification impossible.')
  } finally {
    saving.value = false
  }
}

const saveNote = async () => {
  saving.value = true
  try {
    const updated = await api.update(selected.value.id, { adminNote: adminNote.value.trim() || null })
    selected.value = updated
    replaceInList(updated)
    toasts.success('Note enregistrée.')
  } catch (caught) {
    toasts.error(caught?.message || 'Enregistrement impossible.')
  } finally {
    saving.value = false
  }
}

const noteChanged = computed(() => (selected.value?.adminNote ?? '') !== adminNote.value.trim())

const details = computed(() => {
  const r = selected.value
  if (!r) return []
  return [
    ['Besoin', BESOIN_LABELS[r.besoin] ?? r.besoin],
    ['Type de locks', LOCK_TYPE_LABELS[r.lockType] ?? r.lockType],
    ['Volume', VOLUME_LABELS[r.volume] ?? r.volume],
    ['Longueur', r.longueur],
    ['Formule', FORMULE_LABELS[r.formule] ?? r.formule],
    ['Dernière séance', DELAI_LABELS[r.delai] ?? r.delai],
    ['État des locks', ETAT_LABELS[r.etat] ?? r.etat],
    ['Coiffure choisie', r.inspiration?.title],
    ['Estimation indicative', r.estimate ? estimateOf(r) : null],
  ].filter(([, value]) => value)
})

const waHref = computed(() => {
  const number = whatsappNumber(selected.value?.phone)
  return number ? `https://wa.me/${number}` : null
})

/* ── Suppression ── */
const confirmTarget = ref(null)
const busy = ref(false)
const remove = async () => {
  busy.value = true
  try {
    await api.remove(confirmTarget.value.id)
    confirmTarget.value = null
    selected.value = null
    await load()
    toasts.success('Demande supprimée.')
  } catch (caught) {
    toasts.error(caught?.message || 'Suppression impossible.')
    confirmTarget.value = null
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Demandes du site"
      subtitle="Les demandes de rendez-vous envoyées depuis le site : la cliente choisit un jour, vous la rappelez pour fixer l’heure."
    />

    <div v-if="counts" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <button
        v-for="key in ['pending', 'contacted', 'confirmed', 'rejected']"
        :key="key"
        type="button"
        class="card p-3.5 text-left transition-colors hover:border-gold"
        :class="filters.status === key ? 'border-gold' : ''"
        @click="filters.status = filters.status === key ? '' : key"
      >
        <span class="block text-[0.7rem] uppercase tracking-[0.1em] text-muted">
          {{ statusOf(key).label }}
        </span>
        <span class="mt-1 block font-display text-2xl text-cocoa-dark">
          {{ counts.byStatus?.[key] ?? 0 }}
        </span>
      </button>
    </div>

    <div class="card grid gap-3 p-3.5 sm:grid-cols-2">
      <SearchInput v-model="filters.search" placeholder="Nom, téléphone, référence…" />
      <BaseField v-model="filters.status" label="Statut" :options="STATUS_OPTIONS" />
    </div>

    <section class="card overflow-hidden">
      <DataState
        :loading="loading"
        :error="error"
        :empty="!rows.length"
        loading-label="Chargement des demandes…"
        :empty-label="
          filters.status || filters.search ? 'Aucune demande ne correspond.' : 'Aucune demande reçue.'
        "
        @retry="load"
      >
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Reçue le</th>
                <th>Cliente</th>
                <th class="hidden md:table-cell">Demande</th>
                <th>Jour souhaité</th>
                <th class="hidden lg:table-cell">Estimation</th>
                <th>Statut</th>
                <th class="w-10"><span class="sr-only">Détail</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in rows"
                :key="item.id"
                class="cursor-pointer"
                :class="item.status === 'pending' ? 'font-medium' : ''"
                @click="open(item)"
              >
                <td class="whitespace-nowrap text-xs">{{ formatDateTime(item.createdAt) }}</td>
                <td class="min-w-[10rem]">
                  <span class="block text-cocoa-dark">{{ item.firstName }} {{ item.lastName }}</span>
                  <span class="block text-xs text-muted">{{ item.phone }}</span>
                </td>
                <td class="hidden max-w-[16rem] truncate font-normal md:table-cell">
                  {{ summary(item) }}
                </td>
                <td class="whitespace-nowrap text-xs">
                  {{ item.desiredDate ? formatDateShort(item.desiredDate) : '—' }}
                </td>
                <td class="hidden whitespace-nowrap text-xs lg:table-cell">{{ estimateOf(item) }}</td>
                <td>
                  <StatusBadge :label="statusOf(item.status).label" :tone="statusOf(item.status).tone" />
                </td>
                <td class="text-right">
                  <AdminIcon name="chevron-right" class="h-4 w-4 text-sand-dark" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="meta && meta.pages > 1"
          class="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted"
        >
          <span>{{ meta.total }} demandes · page {{ meta.page }} sur {{ meta.pages }}</span>
          <div class="flex gap-1.5">
            <BaseButton size="sm" variant="secondary" :disabled="page <= 1" @click="page -= 1">
              Précédent
            </BaseButton>
            <BaseButton size="sm" variant="secondary" :disabled="page >= meta.pages" @click="page += 1">
              Suivant
            </BaseButton>
          </div>
        </div>
      </DataState>
    </section>

    <BaseModal
      :open="Boolean(selected)"
      :title="selected ? `${selected.firstName} ${selected.lastName}` : ''"
      :subtitle="selected ? `Demande ${selected.reference} · ${formatDateTime(selected.createdAt)}` : ''"
      @close="selected = null"
    >
      <div v-if="selected" class="flex flex-col gap-5">
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge :label="statusOf(selected.status).label" :tone="statusOf(selected.status).tone" />
          <span v-if="selected.handledAt" class="text-xs text-muted">
            Prise en charge le {{ formatDateTime(selected.handledAt) }}
          </span>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <a
            :href="`tel:${selected.phone}`"
            class="flex items-center gap-2.5 text-sm text-cocoa-dark hover:text-gold"
          >
            <AdminIcon name="phone" class="h-4 w-4 shrink-0 text-gold" />
            {{ selected.phone }}
          </a>
          <a
            v-if="selected.email"
            :href="`mailto:${selected.email}`"
            class="flex items-center gap-2.5 break-all text-sm text-cocoa-dark hover:text-gold"
          >
            <AdminIcon name="mail" class="h-4 w-4 shrink-0 text-gold" />
            {{ selected.email }}
          </a>
          <p v-if="selected.birthDate" class="flex items-center gap-2.5 text-sm text-cocoa-dark">
            <AdminIcon name="gift" class="h-4 w-4 shrink-0 text-gold" />
            Née le {{ formatDateLong(selected.birthDate) }}
          </p>
        </div>

        <div class="rounded-xl bg-gold/10 p-4">
          <p class="text-[0.7rem] uppercase tracking-[0.1em] text-muted">Jour souhaité</p>
          <p class="mt-0.5 font-display text-lg text-cocoa-dark">
            {{ selected.desiredDate ? formatDateLong(selected.desiredDate) : 'Non précisé' }}
          </p>
          <p class="mt-1 text-xs text-muted">
            La cliente n’a pas choisi d’heure : c’est à vous de la fixer en la rappelant.
          </p>
        </div>

        <dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div v-for="[label, value] in details" :key="label" class="flex flex-col">
            <dt class="text-[0.7rem] uppercase tracking-[0.08em] text-muted">{{ label }}</dt>
            <dd class="text-cocoa-dark">{{ value }}</dd>
          </div>
        </dl>

        <div v-if="selected.note" class="rounded-xl bg-ivory/70 p-4">
          <p class="mb-1 text-[0.7rem] uppercase tracking-[0.1em] text-muted">Précision de la cliente</p>
          <p class="whitespace-pre-line text-sm text-cocoa">{{ selected.note }}</p>
        </div>

        <div
          v-if="selected.appointmentId"
          class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ok/25 bg-ok-bg px-4 py-3 text-sm text-ok"
        >
          <span>Cette demande est devenue un rendez-vous confirmé.</span>
          <BaseButton size="sm" variant="secondary" :to="{ name: 'operation', params: { id: selected.appointmentId } }">
            Ouvrir le rendez-vous
          </BaseButton>
        </div>
        <div
          v-else-if="!['rejected', 'cancelled', 'completed'].includes(selected.status)"
          class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3"
        >
          <span class="text-sm text-cocoa-dark">
            Vous avez rappelé la cliente et fixé l’heure ?
          </span>
          <BaseButton size="sm" :disabled="saving" @click="openPlan">Confirmer et planifier</BaseButton>
        </div>

        <div class="flex flex-col gap-2">
          <p class="text-[0.7rem] uppercase tracking-[0.1em] text-muted">Statut</p>
          <div class="flex flex-wrap gap-2">
            <BaseButton
              v-for="(option, key) in REQUEST_STATUSES"
              :key="key"
              size="sm"
              :variant="selected.status === key ? 'primary' : 'secondary'"
              :disabled="selected.status === key || saving"
              @click="setStatus(key)"
            >
              {{ option.label }}
            </BaseButton>
          </div>
          <p class="text-xs text-muted">
            « Contactée », « Confirmée » et « Déclinée » préviennent la cliente par WhatsApp, selon les
            réglages de la Messagerie.
          </p>
        </div>

        <div class="flex flex-col gap-2">
          <BaseField
            v-model="adminNote"
            label="Note interne (jamais visible par la cliente)"
            textarea
            :rows="3"
            placeholder="Ex. : rappelée à 10 h, vient jeudi à 14 h."
          />
          <div>
            <BaseButton size="sm" variant="secondary" :disabled="!noteChanged || saving" @click="saveNote">
              Enregistrer la note
            </BaseButton>
          </div>
        </div>
      </div>

      <template #footer>
        <BaseButton variant="ghost" @click="confirmTarget = selected">
          <AdminIcon name="trash" class="h-3.5 w-3.5" />
          Supprimer
        </BaseButton>
        <BaseButton v-if="waHref" variant="secondary" :href="waHref">
          <AdminIcon name="send" class="h-3.5 w-3.5" />
          Écrire sur WhatsApp
        </BaseButton>
        <BaseButton @click="selected = null">Fermer</BaseButton>
      </template>
    </BaseModal>

    <BaseModal
      :open="planOpen"
      title="Confirmer et planifier"
      :subtitle="selected ? `${selected.firstName} ${selected.lastName} · demande ${selected.reference}` : ''"
      size="sm"
      @close="planOpen = false"
    >
      <div class="flex flex-col gap-4">
        <p class="text-sm text-muted">
          La cliente avait souhaité
          <strong class="text-cocoa-dark">{{ selected?.desiredDate ? formatDateLong(selected.desiredDate) : 'un jour non précisé' }}</strong>.
          Indiquez le jour, l’heure et le <strong class="text-cocoa-dark">prix</strong> convenus : la demande devient un rendez-vous confirmé et la cliente reçoit le prix dans sa confirmation WhatsApp.
        </p>
        <div class="grid grid-cols-2 gap-3">
          <BaseField v-model="plan.date" label="Jour" type="date" required />
          <BaseField v-model="plan.time" label="Heure" type="time" required />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <BaseField
            v-model="plan.price"
            label="Prix convenu (FCFA)"
            type="number"
            min="1"
            step="500"
            required
            :hint="
              selected?.estimate
                ? 'Prérempli avec l’estimation indicative : ajustez-le si besoin.'
                : 'Nouvelle création : à fixer avec la cliente.'
            "
          />
          <BaseField v-model="plan.duration" label="Durée (minutes)" type="number" min="15" step="15" hint="Vide = 3 heures." />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <BaseField v-model="plan.officeId" label="Bureau" :options="officeOptions" />
          <BaseField v-model="plan.staffId" label="Agent" :options="agentOptions" />
        </div>
        <p v-if="planError" class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-xs text-danger" role="alert">
          {{ planError }}
        </p>
      </div>
      <template #footer>
        <BaseButton variant="secondary" :disabled="planning" @click="planOpen = false">Annuler</BaseButton>
        <BaseButton :loading="planning" @click="submitPlan">Confirmer le rendez-vous</BaseButton>
      </template>
    </BaseModal>

    <ConfirmDialog
      :open="Boolean(confirmTarget)"
      :busy="busy"
      title="Supprimer la demande"
      :message="`La demande ${confirmTarget?.reference} sera supprimée définitivement.`"
      @confirm="remove"
      @close="confirmTarget = null"
    />
  </div>
</template>
