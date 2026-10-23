<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { jeko as api } from '@/services'
import { useToastStore } from '@/stores/toasts'
import {
  JEKO_METHODS,
  JEKO_OUTCOMES,
  JEKO_SOURCES,
  JEKO_STATUSES,
  formatDateTime,
  formatFcfa,
} from '@/utils/format'

/**
 * Paiements Jèko — réservé à l'administratrice (droit « jeko »).
 *
 * Tout vient du backend : les tentatives de paiement et le journal technique (création chez Jèko, webhooks reçus,
 * vérifications). Rien n'est simulé ici. « Vérifier auprès de Jèko » demande au SERVEUR de relire le statut chez
 * Jèko ; un paiement n'est jamais réussi sans que Jèko (webhook signé ou lecture directe) l'ait confirmé.
 */
const toasts = useToastStore()

const onglet = ref('paiements') // paiements | journal
const overview = ref(null)
const overviewError = ref('')

/* ── Chiffres ── */
const loadOverview = async () => {
  try {
    overview.value = await api.overview()
    overviewError.value = ''
  } catch (caught) {
    overviewError.value = caught?.message || 'Statistiques indisponibles.'
  }
}

/* ── Liste des paiements ── */
const rows = ref([])
const meta = ref(null)
const loading = ref(false)
const error = ref(null)
const page = ref(1)
const filtres = ref({ search: '', status: '', method: '', from: '', to: '', errors: false })

const STATUS_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  ...Object.entries(JEKO_STATUSES).map(([value, { label }]) => ({ value, label })),
]
const METHOD_OPTIONS = [
  { value: '', label: 'Tous les moyens' },
  ...Object.entries(JEKO_METHODS).map(([value, label]) => ({ value, label })),
]

const params = () => ({
  search: filtres.value.search.trim() || undefined,
  status: filtres.value.status || undefined,
  method: filtres.value.method || undefined,
  from: filtres.value.from || undefined,
  to: filtres.value.to || undefined,
  errors: filtres.value.errors ? '1' : undefined,
  page: page.value,
  limit: 20,
})

const load = async ({ silent = false } = {}) => {
  if (!silent) loading.value = true
  try {
    const result = await api.payments(params())
    rows.value = result.rows
    meta.value = result.meta
    error.value = null
  } catch (caught) {
    if (!silent) {
      error.value = caught?.message || 'Chargement impossible.'
      rows.value = []
    }
  } finally {
    loading.value = false
  }
}

/* ── Journal technique ── */
const events = ref([])
const eventsMeta = ref(null)
const eventsLoading = ref(false)
const eventsError = ref(null)
const eventsPage = ref(1)
const eventFiltres = ref({ source: '', outcome: '' })
const openPayload = ref(null)

const SOURCE_OPTIONS = [
  { value: '', label: 'Toutes les sources' },
  ...Object.entries(JEKO_SOURCES).map(([value, label]) => ({ value, label })),
]
const OUTCOME_OPTIONS = [
  { value: '', label: 'Toutes les issues' },
  ...Object.entries(JEKO_OUTCOMES).map(([value, { label }]) => ({ value, label })),
]

const loadEvents = async ({ silent = false } = {}) => {
  if (!silent) eventsLoading.value = true
  try {
    const result = await api.events({
      source: eventFiltres.value.source || undefined,
      outcome: eventFiltres.value.outcome || undefined,
      page: eventsPage.value,
      limit: 25,
    })
    events.value = result.rows
    eventsMeta.value = result.meta
    eventsError.value = null
  } catch (caught) {
    if (!silent) {
      eventsError.value = caught?.message || 'Journal indisponible.'
      events.value = []
    }
  } finally {
    eventsLoading.value = false
  }
}

loadOverview()
load()

let minuteur = null
watch(
  () => filtres.value,
  () => {
    clearTimeout(minuteur)
    minuteur = setTimeout(() => {
      page.value = 1
      load()
    }, 350)
  },
  { deep: true },
)
watch(page, () => load())
watch(onglet, (valeur) => {
  if (valeur === 'journal') loadEvents()
})
watch(eventFiltres, () => {
  eventsPage.value = 1
  loadEvents()
}, { deep: true })
watch(eventsPage, () => loadEvents())

/* Relecture régulière de la BASE (aucun appel à Jèko) : un webhook reçu apparaît sans recharger la page. */
const relire = window.setInterval(() => {
  if (document.visibilityState !== 'visible') return
  loadOverview()
  if (onglet.value === 'paiements') load({ silent: true })
  else loadEvents({ silent: true })
  if (selected.value && !verifying.value) recharger(selected.value.id, { silent: true })
}, 30000)
onBeforeUnmount(() => {
  window.clearInterval(relire)
  clearTimeout(minuteur)
})

const reloadAll = async () => {
  await Promise.all([loadOverview(), onglet.value === 'paiements' ? load() : loadEvents()])
}

/* ── Actualisation chez Jèko ── */
const refreshing = ref(false)
const refresh = async () => {
  refreshing.value = true
  try {
    const r = await api.refresh()
    if (!r.checked) toasts.info('Aucun paiement en attente à vérifier pour le moment.')
    else if (r.errors) toasts.error(`${r.checked} paiement(s) vérifié(s), ${r.updated} mis à jour, ${r.errors} vérification(s) impossible(s) (voir le journal).`)
    else toasts.success(`${r.checked} paiement(s) vérifié(s) chez Jèko, ${r.updated} mis à jour.`)
    await reloadAll()
  } catch (caught) {
    toasts.error(caught?.message || 'Actualisation impossible.')
  } finally {
    refreshing.value = false
  }
}

/* ── Détail d'une transaction ── */
const selected = ref(null)
const detailLoading = ref(false)
const verifying = ref(false)

const recharger = async (id, { silent = false } = {}) => {
  try {
    selected.value = await api.payment(id)
  } catch (caught) {
    if (!silent) toasts.error(caught?.message || 'Ouverture impossible.')
  }
}
const open = async (item) => {
  detailLoading.value = true
  selected.value = null
  openPayload.value = null
  try {
    selected.value = await api.payment(item.id)
  } catch (caught) {
    toasts.error(caught?.message || 'Ouverture impossible.')
  } finally {
    detailLoading.value = false
  }
}
const verify = async () => {
  if (!selected.value) return
  verifying.value = true
  try {
    const r = await api.verify(selected.value.id)
    if (!r.ok) toasts.error(r.message || 'Jèko n’a pas pu être interrogé.')
    else if (r.changed) toasts.success(r.message)
    else toasts.info(r.message)
    await recharger(selected.value.id)
    await reloadAll()
  } catch (caught) {
    toasts.error(caught?.message || 'Vérification impossible.')
  } finally {
    verifying.value = false
  }
}
const peutVerifier = computed(() => Boolean(selected.value?.technical?.paymentRequestId) && !selected.value?.simulated)

const copier = async (texte, quoi = 'Texte') => {
  try {
    await navigator.clipboard.writeText(texte)
    toasts.success(`${quoi} copié.`)
  } catch {
    toasts.error('Copie impossible : sélectionnez le texte à la main.')
  }
}

/* ── Présentation ── */
const statutDe = (s) => JEKO_STATUSES[s] ?? { label: s, tone: 'neutral' }
const issueDe = (o) => JEKO_OUTCOMES[o] ?? { label: o, tone: 'neutral' }
const moyenDe = (m) => (m ? (JEKO_METHODS[m] ?? m) : '—')
const NIVEAUX = { danger: 'border-danger/25 bg-danger-bg text-danger', warn: 'border-warn/25 bg-warn-bg text-warn', ok: 'border-ok/25 bg-ok-bg text-ok', info: 'border-line bg-line-soft text-cocoa' }

const alertes = computed(() => {
  const c = overview.value?.config
  if (!c) return []
  const liste = []
  if (c.simulated) liste.push({ level: 'warn', text: 'Mode simulation actif (JEKO_MOCK) : aucun appel à Jèko, les paiements simulés sont exclus des statistiques.' })
  else if (c.missing?.length) liste.push({ level: 'danger', text: `Paiement non configuré sur le serveur : variables manquantes — ${c.missing.join(', ')}. Les clientes ne peuvent pas payer en ligne.` })
  if (!c.webhookSecretSet) liste.push({ level: 'danger', text: 'JEKO_WEBHOOK_SECRET n’est pas renseigné : toutes les notifications Jèko sont refusées (erreur 401) et aucun paiement ne sera confirmé automatiquement.' })
  if (!c.siteUrlSecure) liste.push({ level: 'warn', text: 'SITE_URL n’est pas une adresse https : Jèko peut refuser les adresses de retour.' })
  const w = overview.value?.webhooks
  if (w?.rejected24h > 0) liste.push({ level: 'danger', text: `${w.rejected24h} notification(s) Jèko refusée(s) pour signature invalide ces dernières 24 h : le secret du serveur ne correspond probablement pas à celui du webhook Jèko.` })
  if (w?.errors24h > 0) liste.push({ level: 'danger', text: `${w.errors24h} notification(s) reçue(s) mais en erreur de traitement ces dernières 24 h : voir le journal technique.` })
  if (overview.value?.toVerify > 0) liste.push({ level: 'warn', text: `${overview.value.toVerify} paiement(s) en attente depuis plus de 15 minutes sans confirmation : utilisez « Vérifier les paiements en attente ».` })
  return liste
})

const cartes = computed(() => {
  const o = overview.value
  if (!o) return []
  return [
    { key: 'collected', label: 'Montant encaissé', value: formatFcfa(o.collected.total), sub: `Aujourd’hui ${formatFcfa(o.collected.today)} · 30 j ${formatFcfa(o.collected.last30Days)}`, icon: 'cash', status: 'success' },
    { key: 'success', label: 'Paiements réussis', value: o.success.count, sub: formatFcfa(o.success.amount), icon: 'check', status: 'success' },
    { key: 'pending', label: 'En attente', value: o.pending.count, sub: formatFcfa(o.pending.amount), icon: 'clock', status: 'pending', warn: o.pending.count > 0 },
    { key: 'failed', label: 'Échoués', value: o.failed.count, sub: formatFcfa(o.failed.amount), icon: 'alert', status: 'failed', warn: o.failed.count > 0 },
    { key: 'cancelled', label: 'Annulés ou expirés', value: o.cancelled.count, sub: formatFcfa(o.cancelled.amount), icon: 'ban', status: 'cancelled' },
  ]
})
const filtrerPar = (statut) => {
  onglet.value = 'paiements'
  filtres.value = { ...filtres.value, status: filtres.value.status === statut ? '' : statut }
}
const reinitialiser = () => {
  filtres.value = { search: '', status: '', method: '', from: '', to: '', errors: false }
}
const filtresActifs = computed(() => Object.values(filtres.value).some(Boolean))
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Paiements Jèko"
      subtitle="Les paiements en ligne des consultations : statuts, erreurs, notifications (webhooks) et vérification auprès de Jèko."
    >
      <template #actions>
        <BaseButton variant="secondary" :disabled="refreshing" @click="reloadAll">
          <AdminIcon name="refresh" class="h-3.5 w-3.5" />
          Recharger
        </BaseButton>
        <BaseButton :loading="refreshing" @click="refresh">
          <AdminIcon name="check" class="h-3.5 w-3.5" />
          Vérifier les paiements en attente
        </BaseButton>
      </template>
    </PageHeader>

    <p v-if="overviewError && !overview" class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
      {{ overviewError }}
    </p>

    <ul v-if="alertes.length" class="flex flex-col gap-2" aria-label="Points d’attention">
      <li v-for="(a, i) in alertes" :key="i" class="rounded-lg border px-3 py-2 text-sm" :class="NIVEAUX[a.level]" role="status">
        {{ a.text }}
      </li>
    </ul>

    <!-- Statistiques : toutes lues en base, hors paiements simulés -->
    <div v-if="overview" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <button
        v-for="c in cartes"
        :key="c.key"
        type="button"
        class="card stat-card text-left transition-colors hover:border-gold/50"
        :class="filtres.status === c.status && c.key !== 'collected' ? 'border-gold' : ''"
        @click="filtrerPar(c.status)"
      >
        <span class="stat-icon" :class="c.warn ? '!bg-warn-bg !text-warn' : ''">
          <AdminIcon :name="c.icon" class="h-[1.15rem] w-[1.15rem]" />
        </span>
        <span class="block">
          <span class="block text-[0.78rem] leading-snug text-muted">{{ c.label }}</span>
          <span class="stat-value mt-1.5 block" :class="c.warn ? '!text-warn' : ''">{{ c.value }}</span>
          <span class="mt-1 block text-[0.72rem] text-muted">{{ c.sub }}</span>
        </span>
      </button>
    </div>
    <p v-if="overview?.simulated" class="-mt-3 text-xs text-muted">
      {{ overview.simulated }} tentative(s) simulée(s) existent en base (essais sans argent) : elles sont listées avec la mention « Simulation » mais jamais comptées ici.
    </p>

    <!-- Santé des webhooks -->
    <section v-if="overview" class="card flex flex-col gap-3 p-4">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-xl text-cocoa-dark">Notifications Jèko (webhooks)</h2>
        <StatusBadge
          :label="overview.webhooks.lastValidAt ? 'Notifications reçues' : 'Aucune notification valide reçue'"
          :tone="overview.webhooks.lastValidAt ? 'ok' : 'warn'"
        />
      </header>
      <dl class="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt class="text-muted">Reçues (24 h)</dt><dd class="text-cocoa-dark">{{ overview.webhooks.last24h }}</dd></div>
        <div><dt class="text-muted">Refusées (signature, 24 h)</dt><dd :class="overview.webhooks.rejected24h ? 'text-danger' : 'text-cocoa-dark'">{{ overview.webhooks.rejected24h }}</dd></div>
        <div><dt class="text-muted">En erreur de traitement (24 h)</dt><dd :class="overview.webhooks.errors24h ? 'text-danger' : 'text-cocoa-dark'">{{ overview.webhooks.errors24h }}</dd></div>
        <div><dt class="text-muted">Dernière notification valide</dt><dd class="text-cocoa-dark">{{ overview.webhooks.lastValidAt ? formatDateTime(overview.webhooks.lastValidAt) : '—' }}</dd></div>
      </dl>
      <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Adresse à enregistrer chez Jèko :</span>
        <code class="break-all rounded bg-line-soft px-2 py-1 text-cocoa-dark">{{ overview.config.webhookUrl }}</code>
        <BaseButton size="sm" variant="secondary" @click="copier(overview.config.webhookUrl, 'Adresse')">Copier</BaseButton>
      </div>
      <p class="text-xs text-muted">
        Adresse déduite de la requête en cours : si l’API est servie derrière un autre domaine, utilisez celui-là (en https).
        Jèko réessaie trois fois en trois secondes puis abandonne : « Vérifier les paiements en attente » rattrape une notification perdue.
      </p>
    </section>

    <!-- Onglets -->
    <div class="flex gap-2" role="tablist">
      <button
        v-for="o in [{ v: 'paiements', l: 'Transactions' }, { v: 'journal', l: 'Journal technique' }]"
        :key="o.v"
        type="button"
        role="tab"
        :aria-selected="onglet === o.v"
        class="rounded-full border px-4 py-1.5 text-sm transition"
        :class="onglet === o.v ? 'border-transparent bg-cocoa-dark text-white' : 'border-line bg-white text-cocoa-dark hover:border-cocoa-dark'"
        @click="onglet = o.v"
      >
        {{ o.l }}
      </button>
    </div>

    <!-- ═════ Transactions ═════ -->
    <template v-if="onglet === 'paiements'">
      <div class="card grid gap-3 p-3.5 sm:grid-cols-2 lg:grid-cols-6">
        <BaseField v-model="filtres.search" label="Recherche" placeholder="Référence, nom, téléphone, identifiant Jèko" class="lg:col-span-2" />
        <BaseField v-model="filtres.status" label="Statut" :options="STATUS_OPTIONS" />
        <BaseField v-model="filtres.method" label="Moyen de paiement" :options="METHOD_OPTIONS" />
        <BaseField v-model="filtres.from" type="date" label="Du" />
        <BaseField v-model="filtres.to" type="date" label="Au" />
        <label class="flex items-center gap-2 text-sm text-cocoa lg:col-span-2">
          <input v-model="filtres.errors" type="checkbox" class="h-4 w-4 accent-gold" />
          Seulement les paiements en erreur
        </label>
        <div v-if="filtresActifs" class="lg:col-span-4">
          <BaseButton size="sm" variant="ghost" @click="reinitialiser">Effacer les filtres</BaseButton>
        </div>
      </div>

      <section class="card overflow-hidden">
        <DataState
          :loading="loading"
          :error="error"
          :empty="!rows.length"
          loading-label="Chargement des paiements…"
          :empty-label="filtresActifs ? 'Aucun paiement ne correspond à ces filtres.' : 'Aucune tentative de paiement enregistrée pour le moment.'"
          empty-hint="Les paiements apparaissent ici dès qu’une cliente choisit un moyen de paiement sur le site."
          @retry="load"
        >
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Référence</th>
                  <th>Cliente</th>
                  <th class="hidden md:table-cell">Moyen</th>
                  <th class="text-right">Montant</th>
                  <th>Statut</th>
                  <th class="w-10"><span class="sr-only">Détail</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in rows" :key="item.id" class="cursor-pointer" @click="open(item)">
                  <td class="whitespace-nowrap text-xs">{{ formatDateTime(item.createdAt) }}</td>
                  <td class="whitespace-nowrap font-medium text-cocoa-dark">{{ item.requestReference }}</td>
                  <td class="min-w-[9rem]">
                    <span class="block text-cocoa-dark">{{ item.customerName || '—' }}</span>
                    <span class="block text-xs text-muted">{{ item.customerPhone }}</span>
                  </td>
                  <td class="hidden md:table-cell">{{ moyenDe(item.method) }}</td>
                  <td class="whitespace-nowrap text-right">{{ item.amount === null ? '—' : formatFcfa(item.amount) }}</td>
                  <td>
                    <span class="flex flex-wrap items-center gap-1.5">
                      <StatusBadge :label="statutDe(item.status).label" :tone="statutDe(item.status).tone" />
                      <StatusBadge v-if="item.simulated" label="Simulation" tone="info" />
                      <StatusBadge v-if="item.amountWarning" label="Montant à vérifier" tone="warn" />
                    </span>
                  </td>
                  <td class="text-right"><AdminIcon name="chevron-right" class="h-4 w-4 text-sand-dark" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="meta && meta.pages > 1" class="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted">
            <span>{{ meta.total }} paiements · page {{ meta.page }} sur {{ meta.pages }}</span>
            <div class="flex gap-1.5">
              <BaseButton size="sm" variant="secondary" :disabled="page <= 1" @click="page -= 1">Précédent</BaseButton>
              <BaseButton size="sm" variant="secondary" :disabled="page >= meta.pages" @click="page += 1">Suivant</BaseButton>
            </div>
          </div>
        </DataState>
      </section>

      <section v-if="overview?.byMethod?.length" class="card p-4">
        <h2 class="mb-3 font-display text-xl text-cocoa-dark">Par moyen de paiement</h2>
        <div class="table-scroll">
          <table class="table">
            <thead><tr><th>Moyen</th><th class="text-right">Tentatives</th><th class="text-right">Réussies</th><th class="text-right">En attente</th><th class="text-right">Échouées</th><th class="text-right">Encaissé</th></tr></thead>
            <tbody>
              <tr v-for="m in overview.byMethod" :key="m.method">
                <td>{{ moyenDe(m.method) }}</td>
                <td class="text-right">{{ m.count }}</td>
                <td class="text-right">{{ m.success }}</td>
                <td class="text-right">{{ m.pending }}</td>
                <td class="text-right">{{ m.failed }}</td>
                <td class="whitespace-nowrap text-right">{{ formatFcfa(m.collected) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <!-- ═════ Journal technique ═════ -->
    <template v-else>
      <div class="card grid gap-3 p-3.5 sm:grid-cols-2 lg:max-w-xl">
        <BaseField v-model="eventFiltres.source" label="Source" :options="SOURCE_OPTIONS" />
        <BaseField v-model="eventFiltres.outcome" label="Issue" :options="OUTCOME_OPTIONS" />
      </div>
      <section class="card overflow-hidden">
        <DataState
          :loading="eventsLoading"
          :error="eventsError"
          :empty="!events.length"
          loading-label="Chargement du journal…"
          empty-label="Aucun événement enregistré."
          empty-hint="Chaque création de paiement, notification Jèko reçue et vérification de statut est notée ici."
          @retry="loadEvents"
        >
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Reçu le</th><th>Source</th><th class="hidden md:table-cell">Événement</th><th>Signature</th><th>Issue</th>
                  <th class="hidden lg:table-cell">Statut Jèko</th><th>Référence</th><th class="hidden lg:table-cell">Durée</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="e in events" :key="e.id">
                  <tr class="cursor-pointer" @click="openPayload = openPayload === e.id ? null : e.id">
                    <td class="whitespace-nowrap text-xs">{{ formatDateTime(e.createdAt) }}</td>
                    <td>{{ JEKO_SOURCES[e.source] ?? e.source }}</td>
                    <td class="hidden text-xs md:table-cell">{{ e.eventType || '—' }}</td>
                    <td>
                      <StatusBadge v-if="e.signatureValid === true" label="Valide" tone="ok" />
                      <StatusBadge v-else-if="e.signatureValid === false" label="Invalide" tone="danger" />
                      <span v-else class="text-muted">—</span>
                    </td>
                    <td><StatusBadge :label="issueDe(e.outcome).label" :tone="issueDe(e.outcome).tone" /></td>
                    <td class="hidden text-xs lg:table-cell">{{ e.reportedStatus || '—' }}</td>
                    <td class="whitespace-nowrap text-xs">{{ e.requestReference || '—' }}</td>
                    <td class="hidden text-xs lg:table-cell">{{ e.durationMs === null ? '—' : `${e.durationMs} ms` }}</td>
                  </tr>
                  <tr v-if="openPayload === e.id">
                    <td colspan="8" class="bg-ivory/60">
                      <p class="text-sm text-cocoa">{{ e.message || 'Aucun détail.' }}</p>
                      <p class="mt-1 text-xs text-muted">
                        Code renvoyé : {{ e.httpStatus ?? '—' }} · Identifiant Jèko : {{ e.jekoId || '—' }}
                      </p>
                      <pre v-if="e.payload" class="mt-2 max-h-64 overflow-auto rounded bg-white p-3 text-xs">{{ e.payload }}</pre>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <div v-if="eventsMeta && eventsMeta.pages > 1" class="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted">
            <span>{{ eventsMeta.total }} événements · page {{ eventsMeta.page }} sur {{ eventsMeta.pages }}</span>
            <div class="flex gap-1.5">
              <BaseButton size="sm" variant="secondary" :disabled="eventsPage <= 1" @click="eventsPage -= 1">Précédent</BaseButton>
              <BaseButton size="sm" variant="secondary" :disabled="eventsPage >= eventsMeta.pages" @click="eventsPage += 1">Suivant</BaseButton>
            </div>
          </div>
        </DataState>
      </section>
      <p class="text-xs text-muted">
        Le corps des notifications est conservé sans clé ni signature, et les numéros de téléphone y sont masqués. Les notifications refusées (signature invalide) ne gardent aucun corps.
      </p>
    </template>

    <!-- ═════ Détail d'une transaction ═════ -->
    <BaseModal
      :open="detailLoading || Boolean(selected)"
      size="lg"
      :title="selected ? `Paiement ${selected.requestReference}` : 'Chargement…'"
      :subtitle="selected ? formatDateTime(selected.createdAt) : ''"
      @close="selected = null"
    >
      <p v-if="detailLoading && !selected" class="py-8 text-center text-sm text-muted" role="status">Chargement du détail…</p>
      <div v-if="selected" class="flex flex-col gap-5">
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge :label="statutDe(selected.status).label" :tone="statutDe(selected.status).tone" />
          <StatusBadge v-if="selected.simulated" label="Simulation" tone="info" />
          <span class="text-sm text-cocoa-dark">{{ selected.amount === null ? '—' : formatFcfa(selected.amount) }} · {{ moyenDe(selected.method) }}</span>
        </div>

        <ul v-if="selected.diagnostics?.length" class="flex flex-col gap-2" aria-label="Pistes de diagnostic">
          <li v-for="(p, i) in selected.diagnostics" :key="i" class="rounded-lg border px-3 py-2 text-sm" :class="NIVEAUX[p.level]">{{ p.text }}</li>
        </ul>

        <section class="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div><span class="text-muted">Cliente : </span>{{ selected.customerName || '—' }}</div>
          <div><span class="text-muted">Téléphone : </span>{{ selected.customerPhone || '—' }}</div>
          <div><span class="text-muted">Demande : </span>{{ selected.requestReference }}
            <template v-if="selected.request"> · {{ selected.request.paymentStatus === 'paid' ? 'payée' : 'non payée' }}</template>
            <template v-else> · supprimée</template>
          </div>
          <div><span class="text-muted">Paiement confirmé le : </span>{{ selected.completedAt ? formatDateTime(selected.completedAt) : '—' }}</div>
          <div><span class="text-muted">Dernière vérification chez Jèko : </span>{{ selected.lastCheckedAt ? formatDateTime(selected.lastCheckedAt) : 'jamais' }}</div>
        </section>

        <section>
          <h3 class="mb-2 font-display text-lg text-cocoa-dark">Informations techniques</h3>
          <dl class="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            <div><dt class="inline text-muted">Identifiant de la demande Jèko : </dt><dd class="inline break-all">{{ selected.technical.paymentRequestId || '—' }}</dd></div>
            <div><dt class="inline text-muted">Identifiant de transaction : </dt><dd class="inline break-all">{{ selected.technical.transactionId || '—' }}</dd></div>
            <div><dt class="inline text-muted">Référence envoyée à Jèko : </dt><dd class="inline break-all">{{ selected.technical.jekoReference || '—' }}</dd></div>
            <div><dt class="inline text-muted">Dernier statut Jèko : </dt><dd class="inline">{{ selected.technical.jekoStatus || '—' }}</dd></div>
            <div><dt class="inline text-muted">errorReason (Jèko) : </dt><dd class="inline">{{ selected.technical.errorReason || '—' }}</dd></div>
            <div><dt class="inline text-muted">Code HTTP d’erreur : </dt><dd class="inline">{{ selected.technical.errorHttpStatus ?? '—' }}</dd></div>
            <div><dt class="inline text-muted">Montant envoyé : </dt><dd class="inline">{{ selected.technical.amountCents === null ? '—' : `${selected.technical.amountCents} centimes XOF` }}</dd></div>
            <div><dt class="inline text-muted">Page de paiement Jèko (hôte) : </dt><dd class="inline">{{ selected.technical.redirectHost || '—' }}</dd></div>
          </dl>
          <p v-if="selected.technical.errorMessage" class="mt-2 rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger">
            {{ selected.technical.errorMessage }}
          </p>
        </section>

        <section>
          <h3 class="mb-2 font-display text-lg text-cocoa-dark">Historique</h3>
          <p v-if="!selected.events.length" class="text-sm text-muted">Aucun événement pour cette tentative.</p>
          <ol v-else class="flex flex-col gap-2">
            <li v-for="e in selected.events" :key="e.id" class="rounded-lg border border-line px-3 py-2 text-sm">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs text-muted">{{ formatDateTime(e.createdAt) }}</span>
                <span class="text-cocoa-dark">{{ JEKO_SOURCES[e.source] ?? e.source }}</span>
                <StatusBadge :label="issueDe(e.outcome).label" :tone="issueDe(e.outcome).tone" />
                <StatusBadge v-if="e.signatureValid === false" label="Signature invalide" tone="danger" />
                <span v-if="e.reportedStatus" class="text-xs text-muted">statut Jèko : {{ e.reportedStatus }}</span>
              </div>
              <p v-if="e.message" class="mt-1 text-cocoa">{{ e.message }}</p>
              <details v-if="e.payload" class="mt-1">
                <summary class="cursor-pointer text-xs text-muted">Corps reçu</summary>
                <pre class="mt-1 max-h-56 overflow-auto rounded bg-ivory p-2 text-xs">{{ e.payload }}</pre>
              </details>
            </li>
          </ol>
        </section>

        <section v-if="selected.otherAttempts?.length">
          <h3 class="mb-2 font-display text-lg text-cocoa-dark">Autres tentatives pour cette demande</h3>
          <ul class="flex flex-wrap gap-2 text-sm">
            <li v-for="a in selected.otherAttempts" :key="a.id" class="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5">
              {{ moyenDe(a.method) }} · {{ formatDateTime(a.createdAt) }}
              <StatusBadge :label="statutDe(a.status).label" :tone="statutDe(a.status).tone" />
            </li>
          </ul>
        </section>

        <section>
          <h3 class="mb-2 font-display text-lg text-cocoa-dark">Dossier pour le support Jèko</h3>
          <pre class="overflow-auto rounded bg-ivory p-3 text-xs">{{ selected.supportSummary }}</pre>
          <div class="mt-2"><BaseButton size="sm" variant="secondary" @click="copier(selected.supportSummary, 'Dossier')">Copier le dossier</BaseButton></div>
        </section>
      </div>

      <template #footer>
        <BaseButton v-if="selected" :loading="verifying" :disabled="!peutVerifier" variant="secondary" @click="verify">
          <AdminIcon name="refresh" class="h-3.5 w-3.5" />
          Vérifier auprès de Jèko
        </BaseButton>
        <BaseButton @click="selected = null">Fermer</BaseButton>
      </template>
    </BaseModal>
  </div>
</template>
