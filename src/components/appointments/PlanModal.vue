<script setup>
/*
 * « Confirmer et planifier » : le salon a rappelé la cliente et convenu avec elle
 * du jour, de l'heure et du prix. Le rendez-vous passe en « confirmé » et la
 * cliente reçoit un message complet — l'aperçu ci-dessous montre exactement
 * la phrase qui lui sera adressée, prix compris.
 */
import { computed, ref, watch } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { agents as agentsApi, appointments as api, offices as officesApi } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { formatDateLong, formatFcfa, toDateKey } from '@/utils/format'

const props = defineProps({
  open: { type: Boolean, default: false },
  appointment: { type: Object, default: null },
})
const emit = defineEmits(['close', 'planned'])

const toasts = useToastStore()
const planning = ref(false)
const error = ref('')
const form = ref({ date: '', time: '', price: '', duration: '', officeId: '', staffId: '' })
const officeOptions = ref([{ value: '', label: 'Non attribué' }])
const agentOptions = ref([{ value: '', label: 'Non attribué' }])

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen || !props.appointment) return
    const a = props.appointment
    form.value = {
      date: a.date || toDateKey(),
      time: '',
      price: Number(a.price) > 0 ? String(Math.round(Number(a.price))) : '',
      duration: '',
      officeId: '',
      staffId: '',
    }
    error.value = ''
    try {
      const [offices, team] = await Promise.all([officesApi.list(), agentsApi.list()])
      officeOptions.value = [
        { value: '', label: 'Non attribué' },
        ...offices.filter((o) => o.isActive !== false).map((o) => ({ value: String(o.id), label: o.name })),
      ]
      agentOptions.value = [
        { value: '', label: 'Non attribué' },
        ...team.filter((t) => t.isActive !== false).map((t) => ({ value: String(t.id), label: t.name })),
      ]
    } catch {
      /* listes facultatives */
    }
  },
)

const prenom = computed(() => props.appointment?.customer?.firstName || 'Madame')
const prix = computed(() => {
  const n = Math.round(Number(form.value.price))
  return Number.isFinite(n) && n > 0 ? formatFcfa(n) : '… FCFA'
})
const quand = computed(() => (form.value.date ? formatDateLong(form.value.date) : '…'))
const heure = computed(() => form.value.time || '…')

const submit = async () => {
  error.value = ''
  if (!form.value.date || !form.value.time) {
    error.value = 'Indiquez le jour et l’heure convenus avec la cliente.'
    return
  }
  const price = Math.round(Number(form.value.price))
  if (!Number.isFinite(price) || price < 1) {
    error.value = 'Indiquez le prix convenu avec la cliente : elle le recevra dans son message de confirmation.'
    return
  }
  planning.value = true
  try {
    const payload = { date: form.value.date, time: form.value.time, price }
    if (form.value.duration !== '') payload.durationMinutes = Math.round(Number(form.value.duration))
    if (form.value.officeId) payload.officeId = Number(form.value.officeId)
    if (form.value.staffId) payload.staffId = Number(form.value.staffId)
    const result = await api.plan(props.appointment.id, payload)
    toasts.success('Rendez-vous confirmé. La cliente reçoit son message avec le prix.')
    emit('planned', result.appointment)
  } catch (caught) {
    error.value = caught?.message || 'Planification impossible.'
  } finally {
    planning.value = false
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    title="Confirmer et planifier"
    :subtitle="appointment ? `${appointment.customer?.firstName ?? ''} ${appointment.customer?.lastName ?? ''} · ${appointment.reference}` : ''"
    size="md"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-5">
      <p class="text-sm text-muted">
        La cliente avait souhaité
        <strong class="text-cocoa-dark">{{ appointment?.date ? formatDateLong(appointment.date) : 'un jour non précisé' }}</strong>.
        Indiquez ce que vous avez convenu avec elle.
      </p>

      <div class="grid grid-cols-2 gap-3">
        <BaseField v-model="form.date" label="Jour" type="date" required />
        <BaseField v-model="form.time" label="Heure" type="time" required />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <BaseField
          v-model="form.price"
          label="Prix convenu (FCFA)"
          type="number"
          min="1"
          step="500"
          required
          hint="Obligatoire : il figure dans le message envoyé à la cliente."
        />
        <BaseField v-model="form.duration" label="Durée (minutes)" type="number" min="15" step="15" hint="Vide = 3 heures." />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <BaseField v-model="form.officeId" label="Bureau" :options="officeOptions" />
        <BaseField v-model="form.staffId" label="Agent" :options="agentOptions" />
      </div>

      <!-- Aperçu du message WhatsApp : une vraie phrase, adressée à la cliente -->
      <div class="overflow-hidden rounded-2xl border border-line">
        <div class="flex items-center gap-2 bg-[#0b6b5a] px-4 py-2 text-white">
          <AdminIcon name="phone" class="h-3.5 w-3.5" />
          <p class="text-xs font-medium tracking-wide">Message WhatsApp envoyé à {{ prenom }}</p>
        </div>
        <div class="bg-[#efe7dc] p-4">
          <div class="max-w-[30rem] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm leading-relaxed text-cocoa-dark shadow-sm">
            <p class="mb-1 text-[0.7rem] font-semibold text-[#0b6b5a]">Beauté Halal</p>
            Bonjour <strong>{{ prenom }}</strong>, votre rendez-vous chez Beauté Halal est confirmé pour le
            <strong>{{ quand }}</strong> à <strong>{{ heure }}</strong>. Comme convenu avec vous, le tarif de votre coiffure est de
            <strong class="rounded bg-gold/15 px-1">{{ prix }}</strong>. Référence de votre dossier : {{ appointment?.reference }}.
            Nous vous attendons avec plaisir !
          </div>
          <p class="mt-2 text-[0.68rem] text-muted">
            Le message part tel quel (prix compris) dès que vous confirmez, si WhatsApp est activé.
          </p>
        </div>
      </div>

      <p v-if="error" class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-xs text-danger" role="alert">
        {{ error }}
      </p>
    </div>
    <template #footer>
      <BaseButton variant="secondary" :disabled="planning" @click="emit('close')">Annuler</BaseButton>
      <BaseButton :loading="planning" @click="submit">Confirmer le rendez-vous</BaseButton>
    </template>
  </BaseModal>
</template>
