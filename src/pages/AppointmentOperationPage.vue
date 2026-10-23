<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import MoneySummary from '@/components/operations/MoneySummary.vue'
import PaymentPanel from '@/components/operations/PaymentPanel.vue'
import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import DataState from '@/components/ui/DataState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useResource } from '@/composables/useResource'
import {
  agents as agentsApi,
  documents as documentsApi,
  offices as officesApi,
  operations as api,
} from '@/services'
import { useToastStore } from '@/stores/toasts'
import {
  DISCOUNT_REASONS,
  capitalize,
  formatDateLong,
  formatDateTime,
  formatDuration,
  formatPrice,
  initialsOf,
  paymentStatusOf,
  statusOf,
} from '@/utils/format'

/**
 * Fiche d'un rendez-vous confirmé — tout ce qui se passe entre l'accueil de
 * la cliente et son reçu.
 *
 * Le parcours est linéaire et l'écran le suit :
 *
 *   confirmé → présence → (bureau, agent) → paiement → terminé → reçu
 *
 * Deux principes tiennent la page :
 *
 *  1. Le serveur fait foi. Chaque action renvoie la fiche complète remise à
 *     jour, et c'est elle qu'on réaffiche. Aucun total n'est recalculé ici,
 *     aucun statut n'est deviné.
 *
 *  2. L'AGENT et l'UTILISATEUR ne sont jamais confondus. L'agent est la
 *     coiffeuse qui réalise la prestation ; l'utilisateur est le compte
 *     connecté qui enregistre l'opération. Le reçu porte les deux, et cette
 *     page les affiche séparément partout.
 */
const route = useRoute()
const router = useRouter()
const toasts = useToastStore()

const id = computed(() => Number(route.params.id))

const { data: operation, loading, error, reload } = useResource(() => api.find(id.value), null)

const { data: offices } = useResource(officesApi.list, [])
const { data: agents } = useResource(agentsApi.list, [])

watch(id, () => reload())

const busy = ref('')

/** Remplace la fiche par celle que vient de renvoyer le serveur. */
const onUpdated = (updated) => {
  operation.value = updated
}

/* ═══════════════════════ Avancement ═══════════════════════ */

const ETAPES = [
  { key: 'confirmed', label: 'Confirmé' },
  { key: 'arrived', label: 'Présente' },
  { key: 'in_progress', label: 'En cours' },
  { key: 'completed', label: 'Terminé' },
]

const etapeCourante = computed(() => {
  const index = ETAPES.findIndex((etape) => etape.key === operation.value?.status)
  return index < 0 ? -1 : index
})

/** Un rendez-vous annulé, refusé ou non honoré sort du parcours. */
const horsParcours = computed(() =>
  ['cancelled', 'rejected', 'no_show', 'pending'].includes(operation.value?.status),
)

const presente = computed(() => Boolean(operation.value?.handling?.present))

/* ═══════════════════ Bureau et agent ═══════════════════ */

const officeOptions = computed(() => [
  { value: '', label: 'Aucun bureau' },
  ...(offices.value ?? [])
    .filter((item) => item.isActive || String(item.id) === String(operation.value?.office?.id))
    .map((item) => ({ value: String(item.id), label: `${item.number} — ${item.name}` })),
])

const agentOptions = computed(() => [
  { value: '', label: 'Aucun agent' },
  ...(agents.value ?? [])
    .filter((item) => item.isActive || String(item.id) === String(operation.value?.agent?.id))
    .map((item) => ({ value: String(item.id), label: `${item.name} — ${item.role}` })),
])

/**
 * L'agent attitré d'un bureau est proposé dès qu'on choisit ce bureau —
 * c'est presque toujours le bon. Il reste modifiable : un remplacement, une
 * absence, et c'est quelqu'un d'autre ce jour-là.
 */
const agentDuBureau = (officeId) => {
  const bureau = (offices.value ?? []).find((item) => String(item.id) === String(officeId))
  return bureau?.agent?.isActive ? String(bureau.agent.id) : ''
}

/* ═══════════════ Enregistrement de la présence ═══════════════ */

const arrivalOpen = ref(false)
/** 'saisie' puis 'recap' : rien n'est écrit avant d'avoir été relu. */
const arrivalStep = ref('saisie')
const arrivalForm = ref({ officeId: '', staffId: '' })
const arrivalError = ref('')

const openArrival = () => {
  arrivalError.value = ''
  arrivalStep.value = 'saisie'
  arrivalForm.value = {
    officeId: operation.value?.office ? String(operation.value.office.id) : '',
    staffId: operation.value?.agent ? String(operation.value.agent.id) : '',
  }
  arrivalOpen.value = true
}

watch(
  () => arrivalForm.value.officeId,
  (officeId) => {
    if (!officeId) return
    // On ne remplace pas un agent déjà choisi à la main.
    if (!arrivalForm.value.staffId) arrivalForm.value.staffId = agentDuBureau(officeId)
  },
)

const libelleOption = (options, value) =>
  options.find((option) => option.value === String(value))?.label ?? '—'

const confirmArrival = async () => {
  arrivalError.value = ''
  busy.value = 'arrival'
  try {
    const updated = await api.markPresent(operation.value.id, {
      officeId: arrivalForm.value.officeId ? Number(arrivalForm.value.officeId) : null,
      staffId: arrivalForm.value.staffId ? Number(arrivalForm.value.staffId) : null,
    })
    onUpdated(updated)
    arrivalOpen.value = false
    toasts.success('Présence de la cliente enregistrée.')
  } catch (caught) {
    arrivalError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    busy.value = ''
  }
}

/* ═══════ Modification du bureau / de l'agent après coup ═══════ */

const editingAssignment = ref(false)
const assignmentForm = ref({ officeId: '', staffId: '' })

const openAssignment = () => {
  assignmentForm.value = {
    officeId: operation.value?.office ? String(operation.value.office.id) : '',
    staffId: operation.value?.agent ? String(operation.value.agent.id) : '',
  }
  editingAssignment.value = true
}

watch(
  () => assignmentForm.value.officeId,
  (officeId) => {
    if (officeId && !assignmentForm.value.staffId) {
      assignmentForm.value.staffId = agentDuBureau(officeId)
    }
  },
)

const saveAssignment = async () => {
  busy.value = 'assignment'
  try {
    const updated = await api.assign(operation.value.id, {
      officeId: assignmentForm.value.officeId ? Number(assignmentForm.value.officeId) : null,
      staffId: assignmentForm.value.staffId ? Number(assignmentForm.value.staffId) : null,
    })
    onUpdated(updated)
    editingAssignment.value = false
    toasts.success('Affectation mise à jour.')
  } catch (caught) {
    toasts.error(caught?.message || 'Modification impossible.')
  } finally {
    busy.value = ''
  }
}

/* ═══════════════════ Démarrage et fin ═══════════════════ */

const start = async () => {
  busy.value = 'start'
  try {
    onUpdated(await api.start(operation.value.id))
    toasts.success('Prestation démarrée.')
  } catch (caught) {
    toasts.error(caught?.message || 'Démarrage impossible.')
  } finally {
    busy.value = ''
  }
}

/**
 * Terminer déclenche le remerciement — SMS et e-mail —, qui ne part qu'une fois.
 * C'est irréversible du point de vue de la cliente : on demande confirmation.
 */
const completeOpen = ref(false)
const notifyOnComplete = ref(true)

const complete = async () => {
  busy.value = 'complete'
  try {
    onUpdated(await api.complete(operation.value.id, { notify: notifyOnComplete.value }))
    completeOpen.value = false
    toasts.success(
      notifyOnComplete.value
        ? 'Prestation terminée. Un message de remerciement part vers la cliente.'
        : 'Prestation terminée.',
    )
  } catch (caught) {
    toasts.error(caught?.message || 'Clôture impossible.')
    completeOpen.value = false
  } finally {
    busy.value = ''
  }
}

/* ═══════════════════ Proforma et reçu ═══════════════════ */

const telecharger = async (document) => {
  busy.value = `doc-${document.id}`
  try {
    await documentsApi.download(document.id, document.number)
  } catch (caught) {
    toasts.error(caught?.message || 'Téléchargement impossible.')
  } finally {
    busy.value = ''
  }
}

const editer = async (kind) => {
  busy.value = `new-${kind}`
  try {
    const document =
      kind === 'receipt'
        ? await documentsApi.createReceipt(operation.value.id)
        : await documentsApi.createProforma(operation.value.id)
    await reload()
    toasts.success(`${kind === 'receipt' ? 'Reçu' : 'Proforma'} ${document.number} établi.`)
    await documentsApi.download(document.id, document.number)
  } catch (caught) {
    toasts.error(caught?.message || 'Édition impossible.')
  } finally {
    busy.value = ''
  }
}

const KIND_LABELS = { proforma: 'Proforma', receipt: 'Reçu' }

const discountLabel = computed(() => DISCOUNT_REASONS[operation.value?.discount?.reason] ?? null)

const retour = () => router.push({ name: 'confirmed' })
</script>

<template>
  <div class="flex flex-col gap-5">
    <DataState
      :loading="loading"
      :error="error"
      :empty="!loading && !error && !operation"
      loading-label="Chargement de la fiche…"
      empty-label="Ce rendez-vous est introuvable."
      @retry="reload"
    >
      <template #empty-action>
        <BaseButton size="sm" variant="secondary" class="mt-2" @click="retour">
          Retour à la liste
        </BaseButton>
      </template>

      <div v-if="operation" class="flex flex-col gap-5">
        <!-- ══ En-tête ══ -->
        <header class="flex flex-col gap-3">
          <RouterLink
            :to="{ name: 'confirmed' }"
            class="inline-flex w-fit items-center gap-1.5 text-xs text-muted transition-colors hover:text-cocoa-dark"
          >
            <AdminIcon name="arrow-left" class="h-3.5 w-3.5" />
            Rendez-vous confirmés
          </RouterLink>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div class="flex min-w-0 items-center gap-3">
              <span class="avatar h-11 w-11 text-sm">{{ initialsOf(operation.customer) }}</span>
              <div class="min-w-0">
                <h1 class="truncate font-display text-[1.5rem] sm:text-[1.8rem]">
                  {{ operation.customer.firstName }} {{ operation.customer.lastName }}
                </h1>
                <p class="truncate text-[0.85rem] text-muted">
                  {{ operation.reference }} · {{ capitalize(formatDateLong(operation.date)) }} à
                  {{ operation.time }}
                </p>
              </div>
            </div>
            <div class="flex shrink-0 flex-wrap items-center gap-2">
              <StatusBadge
                :label="statusOf(operation.status).label"
                :tone="statusOf(operation.status).tone"
              />
              <StatusBadge
                :label="paymentStatusOf(operation.totals.status).label"
                :tone="paymentStatusOf(operation.totals.status).tone"
              />
            </div>
          </div>
        </header>

        <!-- ══ Avancement ══
          Une seule ligne pour dire où l'on en est, et ce qu'il reste à faire.
        -->
        <!--
          « table-scroll » n'est pas réservé aux tableaux : c'est le conteneur
          défilable de la charte, avec le « contain: paint » qui empêche la
          largeur intérieure de remonter jusqu'au défilement de la page. Sans
          lui, ce fil d'avancement faisait déborder l'écran de 20 px sur
          téléphone.
        -->
        <ol
          v-if="!horsParcours"
          class="card table-scroll flex items-center gap-1 p-3"
          aria-label="Avancement du rendez-vous"
        >
          <li
            v-for="(etape, index) in ETAPES"
            :key="etape.key"
            class="flex min-w-0 flex-1 items-center gap-2"
          >
            <span
              class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.7rem] font-medium transition-colors"
              :class="
                index <= etapeCourante
                  ? 'bg-cocoa-dark text-cream'
                  : 'border border-line bg-surface text-muted'
              "
              :aria-current="index === etapeCourante ? 'step' : undefined"
            >
              <AdminIcon v-if="index < etapeCourante" name="check" class="h-3.5 w-3.5" />
              <template v-else>{{ index + 1 }}</template>
            </span>
            <span
              class="hidden truncate text-xs sm:block"
              :class="index <= etapeCourante ? 'text-cocoa-dark' : 'text-muted'"
            >
              {{ etape.label }}
            </span>
            <span
              v-if="index < ETAPES.length - 1"
              class="hidden h-px flex-1 sm:block"
              :class="index < etapeCourante ? 'bg-cocoa-dark/30' : 'bg-line'"
            />
          </li>
        </ol>

        <p
          v-else
          class="flex items-start gap-2.5 rounded-xl border border-warn/25 bg-warn-bg px-3.5 py-3 text-sm text-warn"
          role="status"
        >
          <AdminIcon name="info" class="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Ce rendez-vous est « {{ statusOf(operation.status).label.toLowerCase() }} » : il n’y a
            rien à traiter. Les informations ci-dessous restent consultables.
          </span>
        </p>

        <div class="grid min-w-0 gap-4 xl:grid-cols-3">
          <!-- ══════════ Colonne gauche ══════════ -->
          <div class="flex min-w-0 flex-col gap-4 xl:col-span-2">
            <!-- ── Cliente ── -->
            <section class="card p-4">
              <h2 class="mb-3 text-xs uppercase tracking-[0.1em] text-muted">Cliente</h2>
              <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt class="text-xs text-muted">Prénom</dt>
                  <dd class="text-sm text-cocoa-dark">{{ operation.customer.firstName }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">Nom</dt>
                  <dd class="text-sm text-cocoa-dark">{{ operation.customer.lastName }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">Téléphone</dt>
                  <dd class="text-sm">
                    <a
                      :href="`tel:${operation.customer.phone}`"
                      class="text-cocoa-dark transition-colors hover:text-gold"
                    >
                      {{ operation.customer.phone }}
                    </a>
                  </dd>
                </div>
                <div class="min-w-0">
                  <dt class="text-xs text-muted">E-mail</dt>
                  <dd class="text-sm">
                    <a
                      :href="`mailto:${operation.customer.email}`"
                      class="break-all text-cocoa-dark transition-colors hover:text-gold"
                    >
                      {{ operation.customer.email }}
                    </a>
                  </dd>
                </div>
              </dl>

              <RouterLink
                :to="{ name: 'history', query: { search: operation.customer.email } }"
                class="panel-link mt-3"
              >
                Voir l’historique de cette cliente
                <AdminIcon name="arrow-right" class="h-3 w-3" />
              </RouterLink>
            </section>

            <!-- ── Rendez-vous et prestation ── -->
            <section class="card p-4">
              <h2 class="mb-3 text-xs uppercase tracking-[0.1em] text-muted">Rendez-vous</h2>
              <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt class="text-xs text-muted">Date</dt>
                  <dd class="text-sm text-cocoa-dark">
                    {{ capitalize(formatDateLong(operation.date)) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">Heure</dt>
                  <dd class="text-sm text-cocoa-dark">{{ operation.time }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">Service</dt>
                  <dd class="text-sm text-cocoa-dark">{{ operation.service.name }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">Coiffure</dt>
                  <dd class="text-sm text-cocoa-dark">
                    {{ operation.hairstyle ? operation.hairstyle.title : '—' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">Durée</dt>
                  <dd class="text-sm text-cocoa-dark">
                    {{ formatDuration(operation.durationMinutes) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">Tarif</dt>
                  <dd class="text-sm text-cocoa-dark">
                    {{ formatPrice(operation.price, operation.currency) }}
                  </dd>
                </div>
              </dl>

              <div v-if="operation.note" class="mt-3 rounded-lg bg-ivory/70 p-3">
                <p class="mb-1 text-xs uppercase tracking-[0.1em] text-muted">
                  Commentaire de la cliente
                </p>
                <p class="whitespace-pre-line text-sm text-cocoa">{{ operation.note }}</p>
              </div>
            </section>

            <!-- ── Prise en charge ── -->
            <section class="card p-4">
              <div class="mb-3 flex items-center justify-between gap-3">
                <h2 class="text-xs uppercase tracking-[0.1em] text-muted">Prise en charge</h2>
                <BaseButton
                  v-if="!editingAssignment && !horsParcours"
                  size="sm"
                  variant="ghost"
                  @click="openAssignment"
                >
                  <AdminIcon name="edit" class="h-3.5 w-3.5" />
                  Modifier
                </BaseButton>
              </div>

              <div v-if="editingAssignment" class="flex flex-col gap-3">
                <div class="grid gap-3 sm:grid-cols-2">
                  <BaseField
                    v-model="assignmentForm.officeId"
                    label="Salon / bureau"
                    :options="officeOptions"
                  />
                  <BaseField
                    v-model="assignmentForm.staffId"
                    label="Agent / coiffeuse"
                    :options="agentOptions"
                    hint="Proposé d’après le bureau, modifiable."
                  />
                </div>
                <div class="flex gap-2">
                  <BaseButton size="sm" :loading="busy === 'assignment'" @click="saveAssignment">
                    Enregistrer
                  </BaseButton>
                  <BaseButton size="sm" variant="ghost" @click="editingAssignment = false">
                    Annuler
                  </BaseButton>
                </div>
              </div>

              <dl v-else class="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt class="text-xs text-muted">Salon / bureau</dt>
                  <dd class="text-sm" :class="operation.office ? 'text-cocoa-dark' : 'text-muted'">
                    {{
                      operation.office
                        ? `${operation.office.number} — ${operation.office.name}`
                        : 'Non attribué'
                    }}
                  </dd>
                </div>
                <div>
                  <!--
                    L'agent réalise la coiffure. Ce n'est pas la personne qui
                    saisit l'opération : celle-ci figure deux lignes plus bas.
                  -->
                  <dt class="text-xs text-muted">Agent / coiffeuse</dt>
                  <dd class="text-sm" :class="operation.agent ? 'text-cocoa-dark' : 'text-muted'">
                    {{ operation.agent ? operation.agent.name : 'Non attribué' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">Cliente présente</dt>
                  <dd class="text-sm" :class="presente ? 'text-ok' : 'text-muted'">
                    {{
                      presente
                        ? `Oui — ${formatDateTime(operation.handling.arrivedAt)}`
                        : 'Pas encore'
                    }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">Présence enregistrée par</dt>
                  <dd class="text-sm text-cocoa-dark">
                    {{ operation.handling.arrivedBy ? operation.handling.arrivedBy.name : '—' }}
                  </dd>
                </div>
                <div v-if="operation.handling.completedAt">
                  <dt class="text-xs text-muted">Prestation clôturée par</dt>
                  <dd class="text-sm text-cocoa-dark">
                    {{ operation.handling.completedBy?.name ?? '—' }}
                  </dd>
                </div>
                <div v-if="operation.handling.completedAt">
                  <dt class="text-xs text-muted">Clôturée le</dt>
                  <dd class="text-sm text-cocoa-dark">
                    {{ formatDateTime(operation.handling.completedAt) }}
                  </dd>
                </div>
              </dl>
            </section>

            <!-- ── Avis de la cliente ── -->
            <section v-if="operation.review" class="card p-4">
              <h2 class="mb-2 text-xs uppercase tracking-[0.1em] text-muted">Avis de la cliente</h2>
              <div class="flex items-center gap-1 text-gold">
                <AdminIcon
                  v-for="n in 5"
                  :key="n"
                  name="star"
                  class="h-4 w-4"
                  :class="n <= operation.review.rating ? 'fill-current' : 'opacity-30'"
                />
                <span class="ml-1 text-xs text-muted">{{ operation.review.rating }}/5</span>
              </div>
              <p class="mt-2 whitespace-pre-line text-sm text-cocoa">
                {{ operation.review.comment }}
              </p>
            </section>
          </div>

          <!-- ══════════ Colonne droite ══════════ -->
          <div class="flex min-w-0 flex-col gap-4">
            <!-- ── Actions ── -->
            <section v-if="!horsParcours" class="card flex flex-col gap-2.5 p-4">
              <h2 class="text-sm font-medium text-cocoa-dark">Prochaine étape</h2>

              <template v-if="operation.status === 'confirmed'">
                <p class="text-xs text-muted">
                  La cliente est attendue. Enregistrez sa présence à son arrivée : vous pourrez lui
                  attribuer un bureau et une coiffeuse dans le même geste.
                </p>
                <BaseButton block :loading="busy === 'arrival'" @click="openArrival">
                  <AdminIcon name="user" class="h-4 w-4" />
                  Client présent
                </BaseButton>
              </template>

              <template v-else-if="operation.status === 'arrived'">
                <p class="text-xs text-muted">
                  La cliente est arrivée. Démarrez la prestation quand la coiffeuse commence.
                </p>
                <BaseButton block :loading="busy === 'start'" @click="start">
                  <AdminIcon name="play" class="h-4 w-4" />
                  Démarrer la prestation
                </BaseButton>
                <BaseButton
                  block
                  variant="secondary"
                  :loading="busy === 'complete'"
                  @click="completeOpen = true"
                >
                  <AdminIcon name="check" class="h-4 w-4" />
                  Marquer terminé
                </BaseButton>
              </template>

              <template v-else-if="operation.status === 'in_progress'">
                <p class="text-xs text-muted">
                  Prestation en cours.
                  <span v-if="operation.totals.balance > 0">
                    Il reste
                    {{ formatPrice(operation.totals.balance, operation.totals.currency) }} à
                    encaisser.
                  </span>
                </p>
                <BaseButton block :loading="busy === 'complete'" @click="completeOpen = true">
                  <AdminIcon name="check" class="h-4 w-4" />
                  Marquer terminé
                </BaseButton>
              </template>

              <template v-else>
                <p class="flex items-start gap-2 text-xs text-ok">
                  <AdminIcon name="check" class="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Prestation terminée le
                    {{ formatDateTime(operation.handling.completedAt) }}.
                    <template v-if="operation.handling.thankedAt">
                      Un message de remerciement a été envoyé.
                    </template>
                  </span>
                </p>
              </template>
            </section>

            <!-- ── Paiement ── -->
            <PaymentPanel
              :operation="operation"
              :disabled="!presente || horsParcours"
              @updated="onUpdated"
            />

            <!-- ── Documents ── -->
            <section class="card flex flex-col gap-3 p-4">
              <h2 class="flex items-center gap-2 text-sm font-medium text-cocoa-dark">
                <AdminIcon name="receipt" class="h-4 w-4 text-gold" />
                Documents
              </h2>

              <ul v-if="operation.documents.length" class="flex flex-col divide-y divide-line-soft">
                <li
                  v-for="document in operation.documents"
                  :key="document.id"
                  class="flex items-center gap-3 py-2"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm text-cocoa-dark">
                      {{ KIND_LABELS[document.kind] }} {{ document.number }}
                    </span>
                    <span class="block truncate text-[0.7rem] text-muted">
                      {{ formatDateTime(document.createdAt) }} — {{ document.issuedByName }}
                    </span>
                  </span>
                  <button
                    type="button"
                    class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark disabled:opacity-40"
                    :disabled="busy === `doc-${document.id}`"
                    :aria-label="`Télécharger ${document.number}`"
                    title="Télécharger le PDF"
                    @click="telecharger(document)"
                  >
                    <AdminIcon name="download" class="h-4 w-4" />
                  </button>
                </li>
              </ul>

              <p v-else class="text-xs text-muted">Aucun document établi pour l’instant.</p>

              <div class="flex flex-col gap-2">
                <BaseButton
                  size="sm"
                  variant="secondary"
                  block
                  :loading="busy === 'new-proforma'"
                  @click="editer('proforma')"
                >
                  <AdminIcon name="receipt" class="h-3.5 w-3.5" />
                  Éditer un proforma
                </BaseButton>
                <!--
                  Le reçu n'est proposé qu'une fois un versement enregistré :
                  un reçu sans paiement ne prouverait rien.
                -->
                <BaseButton
                  size="sm"
                  block
                  :disabled="operation.totals.paid <= 0"
                  :loading="busy === 'new-receipt'"
                  @click="editer('receipt')"
                >
                  <AdminIcon name="receipt" class="h-3.5 w-3.5" />
                  Éditer le reçu
                </BaseButton>
                <p v-if="operation.totals.paid <= 0" class="text-[0.7rem] text-muted">
                  Le reçu s’édite après le premier versement.
                </p>
              </div>
            </section>
          </div>

          <!--
            Le journal occupe toute la largeur sous les deux colonnes. Sur
            téléphone, cela le place après les actions et l'encaissement :
            c'est un historique, il se consulte, il n'attend rien de personne.
          -->
          <!-- ── Journal ── -->
          <section class="card p-4 xl:col-span-2">
            <h2 class="mb-3 text-xs uppercase tracking-[0.1em] text-muted">
              Historique des opérations
            </h2>
            <p v-if="!operation.events.length" class="text-sm text-muted">
              Rien n’a encore été enregistré sur ce rendez-vous.
            </p>
            <ol v-else class="flex flex-col gap-0">
              <li
                v-for="event in operation.events"
                :key="event.id"
                class="flex gap-3 border-b border-line-soft py-2.5 last:border-0"
              >
                <span
                  class="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ivory text-gold"
                >
                  <AdminIcon
                    :name="
                      {
                        arrival: 'user',
                        start: 'play',
                        complete: 'check',
                        payment: 'cash',
                        auto_confirm: 'check',
                        payment_review: 'alert',
                        discount: 'percent',
                        document: 'receipt',
                        assignment: 'door',
                        mail: 'mail',
                      }[event.kind] || 'info'
                    "
                    class="h-3.5 w-3.5"
                  />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm text-cocoa-dark">{{ event.label }}</span>
                  <span class="block text-[0.7rem] text-muted">
                    {{ formatDateTime(event.createdAt) }} — {{ event.actorName }}
                  </span>
                </span>
              </li>
            </ol>
          </section>
        </div>
      </div>
    </DataState>

    <!-- ══ Enregistrement de la présence : saisie puis relecture ══ -->
    <BaseModal
      :open="arrivalOpen"
      title="Enregistrer la présence de la cliente"
      :subtitle="operation ? `${operation.customer.firstName} ${operation.customer.lastName}` : ''"
      @close="arrivalOpen = false"
    >
      <div v-if="operation" class="flex flex-col gap-4">
        <p
          v-if="arrivalError"
          class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ arrivalError }}
        </p>

        <!-- Étape 1 : la saisie -->
        <template v-if="arrivalStep === 'saisie'">
          <p class="text-sm text-muted">
            Choisissez le bureau où la cliente est installée et la coiffeuse qui s’en occupe.
            L’heure et votre nom sont enregistrés automatiquement.
          </p>
          <div class="grid gap-4 sm:grid-cols-2">
            <BaseField
              v-model="arrivalForm.officeId"
              label="Salon / bureau"
              :options="officeOptions"
            />
            <BaseField
              v-model="arrivalForm.staffId"
              label="Agent / coiffeuse"
              :options="agentOptions"
              hint="Proposé d’après le bureau choisi."
            />
          </div>
        </template>

        <!-- Étape 2 : la relecture, avant écriture -->
        <template v-else>
          <p class="text-sm text-muted">Vérifiez avant d’enregistrer.</p>

          <dl class="flex flex-col divide-y divide-line-soft rounded-xl bg-ivory/50 px-3.5">
            <div class="flex items-baseline justify-between gap-3 py-2 text-sm">
              <dt class="text-muted">Cliente</dt>
              <dd class="text-right text-cocoa-dark">
                {{ operation.customer.firstName }} {{ operation.customer.lastName }}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-3 py-2 text-sm">
              <dt class="text-muted">Rendez-vous</dt>
              <dd class="text-right text-cocoa-dark">
                {{ capitalize(formatDateLong(operation.date)) }} à {{ operation.time }}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-3 py-2 text-sm">
              <dt class="text-muted">Service</dt>
              <dd class="text-right text-cocoa-dark">{{ operation.service.name }}</dd>
            </div>
            <div class="flex items-baseline justify-between gap-3 py-2 text-sm">
              <dt class="text-muted">Coiffure</dt>
              <dd class="text-right text-cocoa-dark">
                {{ operation.hairstyle ? operation.hairstyle.title : '—' }}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-3 py-2 text-sm">
              <dt class="text-muted">Bureau</dt>
              <dd class="text-right text-cocoa-dark">
                {{ libelleOption(officeOptions, arrivalForm.officeId) }}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-3 py-2 text-sm">
              <dt class="text-muted">Agent</dt>
              <dd class="text-right text-cocoa-dark">
                {{ libelleOption(agentOptions, arrivalForm.staffId) }}
              </dd>
            </div>
          </dl>

          <MoneySummary
            :totals="operation.totals"
            :discount="{ reasonLabel: discountLabel }"
            :show-payments="operation.totals.paid > 0"
          />
        </template>
      </div>

      <template #footer>
        <template v-if="arrivalStep === 'saisie'">
          <BaseButton variant="secondary" @click="arrivalOpen = false">Annuler</BaseButton>
          <BaseButton @click="arrivalStep = 'recap'">
            Vérifier
            <AdminIcon name="arrow-right" class="h-3.5 w-3.5" />
          </BaseButton>
        </template>
        <template v-else>
          <BaseButton
            variant="secondary"
            :disabled="busy === 'arrival'"
            @click="arrivalStep = 'saisie'"
          >
            <AdminIcon name="arrow-left" class="h-3.5 w-3.5" />
            Modifier
          </BaseButton>
          <BaseButton :loading="busy === 'arrival'" @click="confirmArrival">Enregistrer</BaseButton>
        </template>
      </template>
    </BaseModal>

    <!-- ══ Fin de prestation ══ -->
    <BaseModal
      :open="completeOpen"
      title="Terminer la prestation"
      size="sm"
      @close="completeOpen = false"
    >
      <div v-if="operation" class="flex flex-col gap-3">
        <p class="text-sm leading-relaxed text-cocoa">
          La prestation sera marquée comme terminée. L’heure et votre nom seront enregistrés.
        </p>

        <p
          v-if="operation.totals.balance > 0"
          class="rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-sm text-warn"
        >
          Il reste
          {{ formatPrice(operation.totals.balance, operation.totals.currency) }}
          à encaisser. Vous pouvez terminer quand même et enregistrer le solde plus tard.
        </p>

        <label class="flex items-start gap-2.5 text-sm text-cocoa">
          <input
            v-model="notifyOnComplete"
            type="checkbox"
            class="mt-0.5 h-4 w-4 accent-[var(--color-gold)]"
          />
          <span>
            Remercier la cliente par SMS et par e-mail
            <span class="block text-xs text-muted">
              Il ne part qu’une seule fois, même si vous repassez par cette étape.
            </span>
          </span>
        </label>
      </div>

      <template #footer>
        <BaseButton
          variant="secondary"
          :disabled="busy === 'complete'"
          @click="completeOpen = false"
        >
          Annuler
        </BaseButton>
        <BaseButton :loading="busy === 'complete'" @click="complete">
          Terminer la prestation
        </BaseButton>
      </template>
    </BaseModal>
  </div>
</template>
