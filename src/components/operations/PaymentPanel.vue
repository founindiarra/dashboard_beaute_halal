<script setup>
import { computed, ref, watch } from 'vue'

import MoneySummary from './MoneySummary.vue'
import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { operations as api } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { DISCOUNT_REASONS, formatDateTime, formatPrice } from '@/utils/format'

/**
 * Encaissement : réduction, versements, reste à payer.
 *
 * Le paiement se fait uniquement en espèces, et peut se faire en plusieurs
 * fois — d'où une liste de versements plutôt qu'un montant unique.
 *
 * Deux refus viennent du serveur et sont affichés tels quels, parce qu'ils
 * protègent les comptes : un versement ne peut pas dépasser le reste dû, et
 * une réduction ne peut pas ramener le total sous ce qui a déjà été encaissé.
 * L'écran ne cherche pas à les contourner ni à les reproduire.
 *
 * L'auteur de chaque versement est le compte connecté. Il n'est jamais
 * saisi : l'API le déduit du jeton, et c'est ce nom qui figure sur le reçu.
 */
const props = defineProps({
  operation: { type: Object, required: true },
  /** Ouvert seulement une fois la cliente arrivée. */
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['updated'])

const toasts = useToastStore()

const busy = ref(false)
const erreur = ref('')

/* ── Réduction ── */
const editingDiscount = ref(false)
const discountForm = ref({ amount: 0, reason: 'loyalty', note: '' })

const REASON_OPTIONS = Object.entries(DISCOUNT_REASONS).map(([value, label]) => ({ value, label }))

const discountLabel = computed(() => DISCOUNT_REASONS[props.operation.discount?.reason] ?? null)

const openDiscount = () => {
  erreur.value = ''
  discountForm.value = {
    amount: props.operation.discount?.amount || 0,
    reason: props.operation.discount?.reason || 'loyalty',
    note: props.operation.discount?.note || '',
  }
  editingDiscount.value = true
}

const saveDiscount = async () => {
  erreur.value = ''
  const montant = Number(discountForm.value.amount)
  if (!Number.isFinite(montant) || montant < 0) {
    erreur.value = 'Montant de réduction invalide.'
    return
  }
  busy.value = true
  try {
    const updated = await api.setDiscount(props.operation.id, {
      amount: montant,
      reason: montant > 0 ? discountForm.value.reason : null,
      note: discountForm.value.note?.trim() || null,
    })
    emit('updated', updated)
    editingDiscount.value = false
    toasts.success(montant > 0 ? 'Réduction appliquée.' : 'Réduction retirée.')
  } catch (caught) {
    erreur.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}

/* ── Versements ── */
const paymentForm = ref({ amount: '', note: '' })

/** Le champ se pré-remplit avec le reste dû : c'est le cas le plus fréquent. */
watch(
  () => props.operation.totals.balance,
  (reste) => {
    paymentForm.value.amount = reste > 0 ? String(reste) : ''
  },
  { immediate: true },
)

const addPayment = async () => {
  erreur.value = ''
  const montant = Number(paymentForm.value.amount)
  if (!Number.isFinite(montant) || montant <= 0) {
    erreur.value = 'Indiquez un montant supérieur à zéro.'
    return
  }
  busy.value = true
  try {
    const updated = await api.addPayment(props.operation.id, {
      amount: montant,
      note: paymentForm.value.note?.trim() || null,
    })
    emit('updated', updated)
    paymentForm.value.note = ''
    toasts.success(`Versement de ${formatPrice(montant, props.operation.totals.currency)} enregistré.`)
  } catch (caught) {
    erreur.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}

const paiementARetirer = ref(null)
const removePayment = async () => {
  busy.value = true
  try {
    const updated = await api.removePayment(props.operation.id, paiementARetirer.value.id)
    emit('updated', updated)
    paiementARetirer.value = null
    toasts.success('Versement annulé.')
  } catch (caught) {
    toasts.error(caught?.message || 'Annulation impossible.')
    paiementARetirer.value = null
  } finally {
    busy.value = false
  }
}

const solde = computed(() => props.operation.totals.balance)
</script>

<template>
  <section class="card flex flex-col gap-4 p-4">
    <header class="flex items-center justify-between gap-3">
      <h2 class="flex items-center gap-2 text-sm font-medium text-cocoa-dark">
        <AdminIcon name="cash" class="h-4 w-4 text-gold" />
        Paiement
      </h2>
      <BaseButton
        v-if="!editingDiscount && !disabled"
        size="sm"
        variant="ghost"
        @click="openDiscount"
      >
        <AdminIcon name="percent" class="h-3.5 w-3.5" />
        {{ operation.totals.discount > 0 ? 'Modifier la réduction' : 'Appliquer une réduction' }}
      </BaseButton>
    </header>

    <p
      v-if="erreur"
      class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
      role="alert"
    >
      {{ erreur }}
    </p>

    <!-- ── Réduction ── -->
    <div v-if="editingDiscount" class="flex flex-col gap-3 rounded-xl bg-ivory/60 p-3">
      <div class="grid gap-3 sm:grid-cols-2">
        <BaseField
          v-model="discountForm.amount"
          label="Montant de la réduction"
          type="number"
          :min="0"
          :max="operation.totals.total"
          :hint="`Au maximum ${formatPrice(operation.totals.total, operation.totals.currency)}.`"
        />
        <BaseField v-model="discountForm.reason" label="Motif" :options="REASON_OPTIONS" />
      </div>
      <BaseField
        v-model="discountForm.note"
        label="Précision (facultatif)"
        placeholder="Cliente fidèle depuis 2024"
      />
      <div class="flex gap-2">
        <BaseButton size="sm" :loading="busy" @click="saveDiscount">Enregistrer</BaseButton>
        <BaseButton
          size="sm"
          variant="ghost"
          :disabled="busy"
          @click="((editingDiscount = false), (erreur = ''))"
        >
          Annuler
        </BaseButton>
      </div>
    </div>

    <!-- ── Récapitulatif financier ── -->
    <MoneySummary
      :totals="operation.totals"
      :discount="{ reasonLabel: discountLabel }"
      :show-payments="true"
    />

    <p v-if="operation.discount?.appliedBy" class="text-[0.7rem] text-muted">
      Réduction appliquée par {{ operation.discount.appliedBy.name }} le
      {{ formatDateTime(operation.discount.appliedAt) }}.
      <span v-if="operation.discount.note">« {{ operation.discount.note }} »</span>
    </p>

    <!-- ── Versements enregistrés ── -->
    <div v-if="operation.payments.length" class="flex flex-col gap-1.5">
      <h3 class="text-xs uppercase tracking-[0.1em] text-muted">Versements</h3>
      <ul class="flex flex-col divide-y divide-line-soft">
        <li
          v-for="payment in operation.payments"
          :key="payment.id"
          class="flex items-center gap-3 py-2"
        >
          <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ok-bg text-ok">
            <AdminIcon name="check" class="h-3.5 w-3.5" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm text-cocoa-dark">
              {{ formatPrice(payment.amount, operation.totals.currency) }} · espèces
            </span>
            <span class="block truncate text-[0.7rem] text-muted">
              {{ formatDateTime(payment.createdAt) }} — enregistré par
              {{ payment.recordedByName }}
            </span>
          </span>
          <button
            v-if="!disabled"
            type="button"
            class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-danger-bg hover:text-danger"
            aria-label="Annuler ce versement"
            title="Annuler ce versement"
            @click="paiementARetirer = payment"
          >
            <AdminIcon name="close" class="h-3.5 w-3.5" />
          </button>
        </li>
      </ul>
    </div>

    <!-- ── Nouveau versement ── -->
    <div v-if="disabled" class="rounded-lg bg-ivory/60 px-3 py-2.5 text-xs text-muted">
      L’encaissement s’ouvre une fois la présence de la cliente enregistrée.
    </div>

    <div v-else-if="solde <= 0" class="rounded-lg bg-ok-bg px-3 py-2.5 text-xs text-ok">
      Cette prestation est intégralement réglée.
    </div>

    <form v-else class="flex flex-col gap-3" @submit.prevent="addPayment">
      <div class="grid gap-3 sm:grid-cols-2">
        <BaseField
          v-model="paymentForm.amount"
          label="Montant reçu"
          type="number"
          :min="1"
          :max="solde"
          :hint="`Reste ${formatPrice(solde, operation.totals.currency)}.`"
        />
        <BaseField v-model="paymentForm.note" label="Note (facultatif)" placeholder="Acompte" />
      </div>
      <BaseButton type="submit" size="sm" :loading="busy" block>
        <AdminIcon name="cash" class="h-3.5 w-3.5" />
        Enregistrer le versement
      </BaseButton>
    </form>

    <ConfirmDialog
      :open="Boolean(paiementARetirer)"
      :busy="busy"
      title="Annuler ce versement"
      confirm-label="Annuler le versement"
      :message="`Le versement de ${paiementARetirer ? formatPrice(paiementARetirer.amount, operation.totals.currency) : ''} sera retiré des comptes. L’opération restera inscrite au journal.`"
      @confirm="removePayment"
      @close="paiementARetirer = null"
    />
  </section>
</template>
