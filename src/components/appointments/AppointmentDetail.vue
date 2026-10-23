<script setup>
import { computed, ref, watch } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import PlanModal from '@/components/appointments/PlanModal.vue'
import { appointments as api, documents as documentsApi } from '@/services'
import { useToastStore } from '@/stores/toasts'
import {
  APPOINTMENT_STATUSES,
  BESOIN_LABELS,
  DELAI_LABELS,
  ETAT_LABELS,
  FORMULE_LABELS,
  LOCK_TYPE_LABELS,
  OPERATION_STATUSES,
  VOLUME_LABELS,
  capitalize,
  formatDateLong,
  formatDateTime,
  libelleMethode,
  formatDuration,
  formatFcfa,
  formatPrice,
  whatsappNumber,
} from '@/utils/format'

/**
 * Détail d'un rendez-vous : consultation, changement de statut, correction
 * de la date, de l'heure et des coordonnées, suppression.
 *
 * ⚠️ Ni le prix ni la durée ne sont modifiables : l'API ne les expose pas en
 * écriture, le serveur les fige à la réservation d'après la prestation.
 */
const props = defineProps({
  appointment: { type: Object, default: null },
})

const emit = defineEmits(['close', 'updated', 'deleted'])

const toasts = useToastStore()

const editing = ref(false)
const busy = ref(false)
const confirmOpen = ref(false)
const statusBusy = ref('')
const form = ref({})
const cancelReason = ref('')
const notify = ref(true)

const open = computed(() => Boolean(props.appointment))
const statusOf = (status) => APPOINTMENT_STATUSES[status] ?? { label: status, tone: 'neutral' }

/**
 * Décisions prises depuis cette fenêtre : accepter, refuser, annuler,
 * constater une absence. Les étapes du traitement en sont exclues — elles
 * enregistrent un auteur et une heure, ce que seule la fiche de traitement
 * sait faire.
 */
/** Rendez-vous né d'une demande du site (jour souhaité, heure et prix encore à convenir). */
const fromSite = computed(() => props.appointment?.source === 'site-v3')
const timeToSet = computed(() => Boolean(props.appointment?.timeToSet))
const request = computed(() => props.appointment?.request ?? null)

const decisions = computed(() =>
  Object.fromEntries(
    Object.entries(APPOINTMENT_STATUSES)
      .filter(([key]) => !['arrived', 'in_progress'].includes(key))
      // « Contactée » n'a de sens que pour une demande du site.
      .filter(([key]) => key !== 'contacted' || fromSite.value)
      .map(([key, option]) =>
        key === 'confirmed' && timeToSet.value
          ? [key, { ...option, label: 'Confirmer et planifier' }]
          : [key, option],
      ),
  ),
)

const planOpen = ref(false)
const onPlanned = (updated) => {
  planOpen.value = false
  emit('updated', updated)
}

const CONSULT_MODES = { telephone: 'par téléphone', whatsapp: 'par WhatsApp', sur_place: 'en salon' }
const PAY_METHODS = { wave: 'Wave', orange: 'Orange Money', mtn: 'MTN MoMo', moov: 'Moov Money', djamo: 'Djamo' }
const consultationText = (k) => {
  if (!k) return ''
  if (!k.mode) return 'Ignorée par la cliente'
  const how = CONSULT_MODES[k.mode] ?? k.mode
  const locks = k.hasLocks === null ? '' : k.hasLocks ? ' · a des locks' : ' · n’a pas de locks'
  const day = k.mode === 'sur_place' && k.date ? ` le ${formatDateLong(String(k.date).slice(0, 10))}${k.time ? ` à ${k.time}` : ''}` : ''
  return `Souhaitée ${how}${day}${locks}`
}
const paymentText = (p) => {
  if (!p || p.status === 'none') return ''
  const amount = p.amount ? formatFcfa(p.amount) : ''
  if (p.status === 'paid') {
    const via = PAY_METHODS[p.method] ? ` via ${PAY_METHODS[p.method]}` : ''
    return `Payé · ${amount}${via}${p.paidAt ? ` · ${formatDateTime(p.paidAt)}` : ''}`
  }
  return `${p.status === 'failed' ? 'Échoué' : 'En attente'} · ${amount}`
}

const confirmationText = (p) => {
  if (!p || p.status !== 'paid') return ''
  if (p.needsReview) return 'Paiement reçu, rendez-vous NON confirmé : à régulariser (créneau indisponible, montant ou demande annulée)'
  return p.autoConfirmed ? 'Confirmé automatiquement après le paiement' : ''
}

const requestLines = computed(() => {
  const r = request.value
  if (!r) return []
  const lines = [
    ['Besoin', BESOIN_LABELS[r.besoin] ?? r.besoin],
    ['Type de locks', LOCK_TYPE_LABELS[r.lockType] ?? r.lockType],
    ['Méthode de pose', r.besoin === 'creation' ? libelleMethode(r.lockType, r.methode) : null],
    ['Volume', VOLUME_LABELS[r.volume] ?? r.volume],
    ['Longueur', r.longueur],
    ['Prestation', FORMULE_LABELS[r.formule] ?? r.formule],
    ['Délai depuis la pose', DELAI_LABELS[r.delai] ?? r.delai],
    ['État des locks', ETAT_LABELS[r.etat] ?? r.etat],
    ['Inspiration', r.inspirationTitle],
    ['Profil', r.customerKind === 'nouvelle' ? 'Nouvelle cliente' : r.customerKind === 'ancienne' ? 'Ancienne cliente' : null],
    ['Consultation', consultationText(r.consultation)],
    ['Paiement de la consultation', paymentText(r.payment)],
    ['Référence de transaction', r.payment?.status === 'paid' ? r.payment.transactionId : null],
    ['Confirmation', confirmationText(r.payment)],
  ]
  return lines.filter(([, value]) => value)
})

watch(
  () => props.appointment,
  (value) => {
    editing.value = false
    cancelReason.value = value?.cancelReason || ''
    form.value = value
      ? {
          date: value.date ? String(value.date).slice(0, 10) : '',
          time: value.time || '',
          firstName: value.customer.firstName,
          lastName: value.customer.lastName,
          phone: value.customer.phone,
          email: value.customer.email,
          note: value.note || '',
        }
      : {}
  },
)

/**
 * Proforma du rendez-vous.
 *
 * Il est établi tout seul au moment de la confirmation : l'API le crée dans
 * la foulée du changement de statut et renvoie son numéro. On le garde ici
 * pour pouvoir le télécharger sans quitter la fenêtre. Le bouton « Éditer un
 * proforma » de la fiche de traitement sert, lui, à en refaire un après
 * coup — par exemple si la date a changé.
 */
const proforma = ref(null)
const documentBusy = ref(false)

watch(
  () => props.appointment,
  () => {
    proforma.value = null
  },
)

const telechargerProforma = async () => {
  if (!proforma.value) return
  documentBusy.value = true
  try {
    await documentsApi.download(proforma.value.id, proforma.value.number)
  } catch (error) {
    toasts.error(error?.message || 'Téléchargement impossible.')
  } finally {
    documentBusy.value = false
  }
}

/** Le traitement (présence, bureau, paiement) commence une fois confirmé. */
const traitable = computed(() => OPERATION_STATUSES.includes(props.appointment?.status))

const changeStatus = async (status) => {
  if (!props.appointment || status === props.appointment.status) return
  // Une demande du site se confirme en la planifiant : jour, heure et prix convenus.
  if (status === 'confirmed' && timeToSet.value) {
    planOpen.value = true
    return
  }
  statusBusy.value = status
  try {
    const updated = await api.setStatus(props.appointment.id, status, {
      // Le motif accompagne les deux décisions négatives : il est repris tel
      // quel dans le courriel envoyé à la cliente.
      cancelReason: ['cancelled', 'rejected'].includes(status)
        ? cancelReason.value || null
        : null,
      notify: notify.value,
    })
    emit('updated', updated)

    // L'API joint le proforma qu'elle vient d'établir, le cas échéant.
    if (updated.proforma) {
      proforma.value = updated.proforma
      toasts.success(`Rendez-vous confirmé. Proforma ${updated.proforma.number} établi.`)
    } else {
      toasts.success(`Rendez-vous marqué « ${statusOf(status).label.toLowerCase()} ».`)
    }
  } catch (error) {
    toasts.error(error?.message || 'Changement de statut impossible.')
  } finally {
    statusBusy.value = ''
  }
}

const save = async () => {
  if (!props.appointment) return
  busy.value = true
  try {
    const updated = await api.update(props.appointment.id, {
      date: form.value.date || undefined,
      time: timeToSet.value ? undefined : form.value.time || undefined,
      firstName: form.value.firstName,
      lastName: form.value.lastName,
      phone: form.value.phone,
      email: form.value.email,
      note: form.value.note?.trim() ? form.value.note.trim() : null,
    })
    emit('updated', updated)
    editing.value = false
    toasts.success('Rendez-vous mis à jour.')
  } catch (error) {
    toasts.error(error?.message || 'Enregistrement impossible.')
  } finally {
    busy.value = false
  }
}

const remove = async () => {
  if (!props.appointment) return
  busy.value = true
  try {
    await api.remove(props.appointment.id)
    confirmOpen.value = false
    emit('deleted')
    toasts.success('Rendez-vous supprimé.')
  } catch (error) {
    toasts.error(error?.message || 'Suppression impossible.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    :title="appointment ? `Rendez-vous ${appointment.reference}` : ''"
    :subtitle="appointment ? capitalize(formatDateLong(appointment.date)) : ''"
    size="lg"
    @close="$emit('close')"
  >
    <div v-if="appointment" class="flex flex-col gap-6">
      <!-- ── Statut ── -->
      <section class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs uppercase tracking-[0.1em] text-muted">Statut actuel</span>
          <StatusBadge
            :label="statusOf(appointment.status).label"
            :tone="statusOf(appointment.status).tone"
          />
        </div>

        <!--
          « Client présent », « En cours » et « Terminé » ne se posent pas à
          la main : ils s'enregistrent depuis la fiche de traitement, qui
          note aussi l'heure et l'utilisateur. Les proposer ici créerait des
          rendez-vous terminés sans trace de qui les a terminés.
        -->
        <div class="flex flex-wrap gap-2">
          <BaseButton
            v-for="(option, key) in decisions"
            :key="key"
            size="sm"
            :variant="appointment.status === key ? 'primary' : 'secondary'"
            :disabled="appointment.status === key"
            :loading="statusBusy === key"
            @click="changeStatus(key)"
          >
            {{ option.label }}
          </BaseButton>
        </div>

        <BaseField
          v-model="cancelReason"
          label="Motif du refus ou de l’annulation"
          placeholder="Repris tel quel dans l’e-mail envoyé à la cliente"
          hint="Facultatif. Renseignez-le avant de cliquer sur « Refusé » ou « Annulé »."
        />

        <label class="flex items-center gap-2 text-xs text-muted">
          <input v-model="notify" type="checkbox" class="h-4 w-4 accent-[var(--color-gold)]" />
          Prévenir la cliente de cette décision (WhatsApp ou e-mail)
        </label>

        <a
          v-if="fromSite && ['pending', 'contacted'].includes(appointment.status)"
          :href="`https://wa.me/${whatsappNumber(appointment.customer.phone)}`"
          target="_blank"
          rel="noopener"
          class="inline-flex w-fit items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-cocoa-dark transition-colors hover:border-gold hover:text-gold"
        >
          <AdminIcon name="phone" class="h-3.5 w-3.5" />
          Écrire à la cliente sur WhatsApp
        </a>

        <!-- Proforma tout juste établi : proposé sur place, sans détour. -->
        <div
          v-if="proforma"
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-ivory/60 px-3 py-2"
        >
          <span class="text-xs text-cocoa-dark">
            Proforma {{ proforma.number }} établi pour ce rendez-vous.
          </span>
          <BaseButton size="sm" variant="secondary" :loading="documentBusy" @click="telechargerProforma">
            <AdminIcon name="download" class="h-3.5 w-3.5" />
            Télécharger
          </BaseButton>
        </div>

        <!--
          Passé la décision, tout se joue sur la fiche de traitement :
          présence, bureau, agent, encaissement, reçu. On y renvoie plutôt
          que de dédoubler ces gestes ici.
        -->
        <BaseButton
          v-if="traitable"
          variant="secondary"
          size="sm"
          :to="{ name: 'operation', params: { id: appointment.id } }"
          @click="$emit('close')"
        >
          <AdminIcon name="arrow-right" class="h-3.5 w-3.5" />
          Ouvrir la fiche de traitement
        </BaseButton>
      </section>

      <!-- ── Prestation (lecture seule) ── -->
      <section class="rounded-xl border border-line bg-canvas p-4">
        <h3 class="mb-3 text-xs uppercase tracking-[0.1em] text-muted">Prestation</h3>
        <dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div class="flex justify-between gap-3 sm:block">
            <dt class="text-muted sm:text-xs">Service</dt>
            <dd class="text-right text-cocoa-dark sm:text-left">{{ appointment.service.name }}</dd>
          </div>
          <div class="flex justify-between gap-3 sm:block">
            <dt class="text-muted sm:text-xs">Durée</dt>
            <dd class="text-right text-cocoa-dark sm:text-left">
              {{ timeToSet ? 'À fixer' : formatDuration(appointment.durationMinutes) }}
            </dd>
          </div>
          <div class="flex justify-between gap-3 sm:block">
            <dt class="text-muted sm:text-xs">Prix</dt>
            <dd class="text-right text-cocoa-dark sm:text-left">
              <template v-if="timeToSet">
                {{ Number(appointment.price) > 0 ? `Estimation ${formatFcfa(appointment.price)} · ` : '' }}à convenir avec la cliente
              </template>
              <template v-else>{{ formatPrice(appointment.price, appointment.currency) }}</template>
            </dd>
          </div>
          <div class="flex justify-between gap-3 sm:block">
            <dt class="text-muted sm:text-xs">Réservé le</dt>
            <dd class="text-right text-cocoa-dark sm:text-left">
              {{ formatDateTime(appointment.createdAt) }}
            </dd>
          </div>
        </dl>
        <dl v-if="requestLines.length" class="mt-4 grid gap-x-6 gap-y-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
          <div v-for="[label, value] in requestLines" :key="label" class="flex justify-between gap-3 sm:block">
            <dt class="text-muted sm:text-xs">{{ label }}</dt>
            <dd class="text-right text-cocoa-dark sm:text-left">{{ value }}</dd>
          </div>
        </dl>
        <p v-if="!fromSite" class="mt-3 text-xs text-muted">
          La durée et le prix sont figés par le serveur au moment de la réservation : ils ne sont
          pas modifiables ici.
        </p>
      </section>

      <!-- ── Cliente et créneau ── -->
      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-xs uppercase tracking-[0.1em] text-muted">Cliente et créneau</h3>
          <BaseButton v-if="!editing" size="sm" variant="ghost" @click="editing = true">
            <AdminIcon name="edit" class="h-3.5 w-3.5" />
            Modifier
          </BaseButton>
        </div>

        <div v-if="!editing" class="grid gap-3 sm:grid-cols-2">
          <div class="flex items-start gap-2.5 text-sm">
            <AdminIcon name="user" class="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span class="text-cocoa-dark">
              {{ appointment.customer.firstName }} {{ appointment.customer.lastName }}
            </span>
          </div>
          <div class="flex items-start gap-2.5 text-sm">
            <AdminIcon name="calendar" class="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span class="text-cocoa-dark">
              {{ capitalize(formatDateLong(appointment.date)) }}{{ timeToSet ? (appointment.request?.desiredTime ? ` · créneau souhaité : ${appointment.request.desiredTime}` : ' · heure à fixer') : ` à ${appointment.time}` }}
            </span>
          </div>
          <div class="flex items-start gap-2.5 text-sm">
            <AdminIcon name="phone" class="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <a
              :href="`tel:${appointment.customer.phone}`"
              class="text-cocoa-dark transition-colors hover:text-gold"
            >
              {{ appointment.customer.phone }}
            </a>
          </div>
          <div class="flex items-start gap-2.5 text-sm">
            <AdminIcon name="mail" class="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <a
              :href="`mailto:${appointment.customer.email}`"
              class="break-all text-cocoa-dark transition-colors hover:text-gold"
            >
              {{ appointment.customer.email }}
            </a>
          </div>
        </div>

        <div v-else class="grid gap-3 sm:grid-cols-2">
          <BaseField v-model="form.date" label="Date" type="date" />
          <BaseField v-if="!timeToSet" v-model="form.time" label="Heure" type="time" />
          <BaseField v-model="form.firstName" label="Prénom" />
          <BaseField v-model="form.lastName" label="Nom" />
          <BaseField v-model="form.phone" label="Téléphone" type="tel" />
          <BaseField v-model="form.email" label="E-mail" type="email" />
          <div class="sm:col-span-2">
            <BaseField v-model="form.note" label="Commentaire" textarea :rows="3" />
          </div>
          <div class="flex gap-2 sm:col-span-2">
            <BaseButton size="sm" :loading="busy" @click="save">Enregistrer</BaseButton>
            <BaseButton size="sm" variant="ghost" :disabled="busy" @click="editing = false">
              Annuler
            </BaseButton>
          </div>
        </div>

        <div v-if="!editing && appointment.note" class="rounded-lg bg-ivory/70 p-3 text-sm">
          <p class="mb-1 text-xs uppercase tracking-[0.1em] text-muted">Commentaire de la cliente</p>
          <p class="whitespace-pre-line text-cocoa">{{ appointment.note }}</p>
        </div>
      </section>
    </div>

    <template #footer>
      <BaseButton variant="ghost" @click="confirmOpen = true">
        <AdminIcon name="trash" class="h-3.5 w-3.5" />
        Supprimer
      </BaseButton>
      <BaseButton variant="secondary" @click="$emit('close')">Fermer</BaseButton>
    </template>
  </BaseModal>

  <PlanModal :open="planOpen" :appointment="appointment" @close="planOpen = false" @planned="onPlanned" />

  <ConfirmDialog
    :open="confirmOpen"
    :busy="busy"
    title="Supprimer ce rendez-vous"
    message="Le rendez-vous sera retiré définitivement de la base. La cliente n’en sera pas informée."
    @confirm="remove"
    @close="confirmOpen = false"
  />
</template>
