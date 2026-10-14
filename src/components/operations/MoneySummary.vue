<script setup>
import { formatPrice } from '@/utils/format'

/**
 * Le récapitulatif financier, toujours présenté dans le même ordre :
 *
 *   Prestation − Réduction = Montant à payer
 *   Payé · Reste
 *
 * Ces cinq lignes viennent telles quelles du serveur (`totals`). Rien n'est
 * recalculé ici : un montant affiché doit être celui qui sera écrit sur le
 * reçu, et deux calculs parallèles finissent toujours par diverger.
 */
defineProps({
  totals: { type: Object, required: true },
  discount: { type: Object, default: null },
  /** Le bloc « Payé / Reste » n'a de sens qu'une fois l'encaissement ouvert. */
  showPayments: { type: Boolean, default: true },
  dense: { type: Boolean, default: false },
})
</script>

<template>
  <dl class="flex flex-col" :class="dense ? 'gap-1 text-xs' : 'gap-1.5 text-sm'">
    <div class="flex items-baseline justify-between gap-3">
      <dt class="text-muted">Montant de la prestation</dt>
      <dd class="text-cocoa-dark">{{ formatPrice(totals.total, totals.currency) }}</dd>
    </div>

    <div v-if="totals.discount > 0" class="flex items-baseline justify-between gap-3">
      <dt class="min-w-0 truncate text-muted">
        Réduction
        <span v-if="discount?.reasonLabel" class="text-[0.9em]">({{ discount.reasonLabel }})</span>
      </dt>
      <dd class="whitespace-nowrap text-cocoa-dark">
        − {{ formatPrice(totals.discount, totals.currency) }}
      </dd>
    </div>

    <div
      class="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-2"
      :class="dense ? '' : 'text-base'"
    >
      <dt class="font-medium text-cocoa-dark">Montant à payer</dt>
      <dd class="font-medium text-cocoa-dark">
        {{ formatPrice(totals.payable, totals.currency) }}
      </dd>
    </div>

    <template v-if="showPayments">
      <div class="mt-1 flex items-baseline justify-between gap-3">
        <dt class="text-muted">Montant payé</dt>
        <dd class="text-cocoa-dark">{{ formatPrice(totals.paid, totals.currency) }}</dd>
      </div>

      <div class="flex items-baseline justify-between gap-3">
        <dt class="font-medium" :class="totals.balance > 0 ? 'text-danger' : 'text-ok'">
          Reste à payer
        </dt>
        <dd class="font-medium" :class="totals.balance > 0 ? 'text-danger' : 'text-ok'">
          {{ formatPrice(totals.balance, totals.currency) }}
        </dd>
      </div>

      <p class="mt-0.5 text-[0.7rem] text-muted">Mode de paiement : espèces.</p>
    </template>
  </dl>
</template>
