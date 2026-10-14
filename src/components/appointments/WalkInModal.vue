<script setup>
import { computed, ref, watch } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import {
  agents as agentsApi,
  availability,
  customers,
  offices as officesApi,
  services as servicesApi,
  appointments as api,
} from '@/services'
import { formatDateLong, formatDuration, formatPrice, toDateKey } from '@/utils/format'

/**
 * Rendez-vous pris au comptoir.
 *
 * Une cliente est devant vous : le formulaire est fait pour être rempli en
 * parlant, pas pour être parfait. D'où trois partis pris.
 *
 *  1. LE NUMÉRO D'ABORD. Il sert de matricule : dès qu'il est complet, on
 *     cherche la fiche. Si la cliente est déjà connue, son nom et son e-mail
 *     se remplissent seuls — on ne redemande pas à quelqu'un ce qu'on sait
 *     déjà d'elle.
 *  2. LES CRÉNEAUX VIENNENT DU SERVEUR, les mêmes que voit le site. Deux
 *     calculs différents finiraient par promettre le même créneau à deux
 *     clientes.
 *  3. LE SALON PEUT PASSER OUTRE. Quand le créneau est plein, le serveur
 *     refuse une première fois en le disant ; un second clic, explicite,
 *     force le rendez-vous. Refuser une cliente présente au nom d'un calcul
 *     serait absurde, mais l'accepter sans le savoir le serait tout autant.
 */
const props = defineProps({
  open: { type: Boolean, default: false },
  /** Date pré-remplie, quand on arrive depuis une case du calendrier. */
  date: { type: String, default: '' },
})

const emit = defineEmits(['close', 'created'])

const form = ref({})
const busy = ref(false)
const error = ref('')
/** Passé à `true` par le serveur quand seul un dépassement bloque encore. */
const forcable = ref(false)

const services = ref([])
const agents = ref([])
const offices = ref([])
const creneaux = ref([])
const creneauxLoading = ref(false)

/* ── Reconnaissance de la cliente ── */
const connue = ref(null)
const rechercheEnCours = ref(false)

const reinitialiser = () => {
  error.value = ''
  forcable.value = false
  connue.value = null
  form.value = {
    phone: '',
    firstName: '',
    lastName: '',
    email: '',
    birthDate: '',
    serviceId: '',
    date: props.date || toDateKey(),
    time: '',
    staffId: '',
    officeId: '',
    note: '',
  }
}

const chargerReferentiels = async () => {
  const [s, a, o] = await Promise.all([
    servicesApi.list().catch(() => []),
    agentsApi.list().catch(() => []),
    officesApi.list().catch(() => []),
  ])
  services.value = s.filter((item) => item.isActive)
  agents.value = a.filter((item) => item.isActive)
  offices.value = o.filter((item) => item.isActive)
}

watch(
  () => props.open,
  (ouvert) => {
    if (!ouvert) return
    reinitialiser()
    chargerReferentiels()
    chargerCreneaux()
  },
)

/* ── Créneaux ── */

const chargerCreneaux = async () => {
  if (!form.value.date) {
    creneaux.value = []
    return
  }
  creneauxLoading.value = true
  try {
    const reponse = await availability.slots(
      form.value.date,
      form.value.serviceId ? Number(form.value.serviceId) : null,
    )
    creneaux.value = reponse?.slots ?? []
  } catch {
    creneaux.value = []
  } finally {
    creneauxLoading.value = false
  }
}

watch(
  () => [form.value.date, form.value.serviceId],
  () => {
    form.value.time = ''
    forcable.value = false
    chargerCreneaux()
  },
)

/*
 * Un créneau barré reste cliquable : la cliente est là, et c'est au salon de
 * décider. Choisir un créneau efface l'autorisation de dépassement obtenue
 * pour le précédent — sans quoi un « Enregistrer malgré tout » accordé à
 * 10h s'appliquerait, sans qu'on s'en aperçoive, au créneau de 15h.
 */
const choisirCreneau = (slot) => {
  form.value.time = slot.time
  forcable.value = false
}

const creneauxLibres = computed(() => creneaux.value.filter((slot) => slot.available))
const complet = computed(() => Boolean(creneaux.value.length) && !creneauxLibres.value.length)

/* ── Fiche cliente retrouvée par le numéro ── */

let rechercheDebounce = null
watch(
  () => form.value.phone,
  (numero) => {
    clearTimeout(rechercheDebounce)
    connue.value = null
    if (!numero || numero.replace(/\D/g, '').length < 8) return

    rechercheDebounce = setTimeout(async () => {
      rechercheEnCours.value = true
      try {
        const { rows } = await customers.list({ search: numero, limit: 5 })
        const chiffres = (v) => String(v ?? '').replace(/\D/g, '')
        const trouvee = rows.find((row) => chiffres(row.phone).endsWith(chiffres(numero).slice(-8)))
        if (trouvee) {
          connue.value = trouvee
          // On ne remplace pas ce qui vient d'être tapé à la main.
          form.value.firstName = form.value.firstName || trouvee.firstName
          form.value.lastName = form.value.lastName || trouvee.lastName
          form.value.email = form.value.email || trouvee.email || ''
        }
      } catch {
        connue.value = null
      } finally {
        rechercheEnCours.value = false
      }
    }, 400)
  },
)

/* ── Options ── */

const optionsServices = computed(() => [
  { value: '', label: 'Choisir une prestation…' },
  ...services.value.map((item) => ({
    value: String(item.id),
    label: `${item.name} — ${formatPrice(item.price)} · ${formatDuration(item.durationMinutes)}`,
  })),
])

const optionsAgents = computed(() => [
  { value: '', label: 'À décider plus tard' },
  ...agents.value.map((item) => ({ value: String(item.id), label: item.name })),
])

const optionsBureaux = computed(() => [
  { value: '', label: 'À décider plus tard' },
  ...offices.value.map((item) => ({
    value: String(item.id),
    label: item.number ? `${item.name} (n° ${item.number})` : item.name,
  })),
])

const prestation = computed(
  () => services.value.find((item) => String(item.id) === String(form.value.serviceId)) || null,
)

/* ── Enregistrement ── */

const valider = () => {
  if (!form.value.serviceId) return 'Choisissez la prestation.'
  if (!form.value.date) return 'Choisissez la date.'
  if (!form.value.time) return 'Choisissez l’heure.'
  if (!form.value.firstName?.trim() || !form.value.lastName?.trim()) {
    return 'Indiquez le prénom et le nom de la cliente.'
  }
  if (form.value.phone.replace(/\D/g, '').length < 8) return 'Le numéro de téléphone est incomplet.'
  if (!form.value.email?.trim()) return 'Indiquez un e-mail : c’est là que part la confirmation.'
  return ''
}

const enregistrer = async ({ force = false } = {}) => {
  const probleme = valider()
  if (probleme) {
    error.value = probleme
    return
  }

  busy.value = true
  error.value = ''
  try {
    const cree = await api.create({
      serviceId: Number(form.value.serviceId),
      date: form.value.date,
      time: form.value.time,
      firstName: form.value.firstName.trim(),
      lastName: form.value.lastName.trim(),
      phone: form.value.phone.trim(),
      email: form.value.email.trim(),
      note: form.value.note?.trim() || null,
      birthDate: form.value.birthDate || null,
      staffId: form.value.staffId ? Number(form.value.staffId) : null,
      officeId: form.value.officeId ? Number(form.value.officeId) : null,
      ...(force ? { force: true } : {}),
    })
    emit('created', cree)
  } catch (caught) {
    error.value = caught?.message || 'Enregistrement impossible.'
    // Le serveur signale lui-même qu'un second clic peut passer outre.
    forcable.value = Boolean(caught?.details?.forceable)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseModal :open="open" title="Rendez-vous au comptoir" @close="$emit('close')">
    <div class="flex flex-col gap-4">
      <p class="text-sm text-muted">
        Ce rendez-vous naît confirmé : c’est le salon qui le prend. Un proforma est établi
        automatiquement, comme pour une demande confirmée depuis le site.
      </p>

      <p
        v-if="error"
        class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
        role="alert"
      >
        {{ error }}
      </p>

      <!-- ── 1. La cliente ── -->
      <fieldset class="flex flex-col gap-3 rounded-lg border border-line p-3.5">
        <legend class="px-1 text-xs font-medium tracking-wide text-muted uppercase">
          La cliente
        </legend>

        <BaseField
          v-model="form.phone"
          label="Téléphone"
          type="tel"
          required
          placeholder="+225 07 00 00 00 01"
          hint="Le numéro identifie la cliente : s’il est déjà connu, sa fiche est retrouvée."
        />

        <p
          v-if="connue"
          class="flex flex-wrap items-center gap-2 rounded-lg bg-ivory px-3 py-2 text-sm text-cocoa"
        >
          <AdminIcon name="check" class="h-4 w-4 text-ok" />
          <span>
            Déjà cliente : <strong class="text-cocoa-dark">{{ connue.fullName }}</strong> ·
            {{ connue.visits }} visite(s)
          </span>
          <RouterLink
            :to="{ name: 'customer', params: { id: connue.id } }"
            class="text-xs text-gold underline-offset-2 hover:underline"
          >
            Voir sa fiche
          </RouterLink>
        </p>
        <p v-else-if="rechercheEnCours" class="text-xs text-muted">Recherche de la fiche…</p>

        <div class="grid gap-3 sm:grid-cols-2">
          <BaseField v-model="form.firstName" label="Prénom" required />
          <BaseField v-model="form.lastName" label="Nom" required />
        </div>
        <BaseField
          v-model="form.email"
          label="E-mail"
          type="email"
          required
          hint="La confirmation et le reçu y sont envoyés."
        />

        <!--
          Facultative, et proposée seulement quand le salon ne la connaît pas
          déjà : redemander sa date de naissance à une habituée serait pénible
          pour elle et sans intérêt pour la fiche.
        -->
        <BaseField
          v-if="!connue?.birthDate"
          v-model="form.birthDate"
          label="Date de naissance"
          type="date"
          :max="toDateKey()"
          hint="Facultatif — sert à souhaiter l’anniversaire."
        />
      </fieldset>

      <!-- ── 2. La prestation ── -->
      <fieldset class="flex flex-col gap-3 rounded-lg border border-line p-3.5">
        <legend class="px-1 text-xs font-medium tracking-wide text-muted uppercase">
          La prestation
        </legend>

        <BaseField
          v-model="form.serviceId"
          label="Prestation"
          required
          :options="optionsServices"
        />

        <p v-if="prestation" class="text-xs text-muted">
          {{ formatDuration(prestation.durationMinutes) }} ·
          {{ formatPrice(prestation.price) }}
        </p>

        <BaseField v-model="form.date" label="Date" type="date" required :min="toDateKey()" />

        <div>
          <span class="label">Heure <span class="text-danger" aria-hidden="true">*</span></span>
          <p v-if="creneauxLoading" class="text-xs text-muted">Chargement des créneaux…</p>
          <p v-else-if="!creneaux.length" class="text-xs text-muted">
            Le salon est fermé ce jour-là, ou aucun créneau n’est défini.
          </p>
          <template v-else>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="slot in creneaux"
                :key="slot.time"
                type="button"
                class="rounded-full border px-3 py-1 text-xs transition-colors"
                :class="[
                  form.time === slot.time
                    ? 'border-gold bg-gold text-white'
                    : slot.available
                      ? 'border-line text-cocoa hover:border-gold hover:text-gold'
                      : 'border-line-soft text-muted line-through',
                ]"
                :aria-pressed="form.time === slot.time"
                @click="choisirCreneau(slot)"
              >
                {{ slot.time }}
              </button>
            </div>
            <p v-if="complet" class="mt-2 text-xs text-warn">
              Toutes les coiffeuses sont déjà prises ce jour-là. Un créneau barré reste cliquable :
              le salon devra confirmer le dépassement.
            </p>
          </template>
        </div>
      </fieldset>

      <!-- ── 3. L'affectation, facultative ── -->
      <fieldset class="flex flex-col gap-3 rounded-lg border border-line p-3.5">
        <legend class="px-1 text-xs font-medium tracking-wide text-muted uppercase">
          Affectation (facultative)
        </legend>

        <div class="grid gap-3 sm:grid-cols-2">
          <BaseField v-model="form.staffId" label="Coiffeuse" :options="optionsAgents" />
          <BaseField v-model="form.officeId" label="Bureau" :options="optionsBureaux" />
        </div>

        <BaseField
          v-model="form.note"
          label="Note"
          textarea
          :rows="2"
          placeholder="Souhait particulier, longueur, couleur…"
        />
      </fieldset>

      <!-- Passer outre -->
      <div
        v-if="forcable"
        class="flex flex-col gap-2 rounded-lg border border-warn/30 bg-warn-bg px-3 py-2.5 text-sm text-cocoa"
      >
        <p>
          Ce créneau est complet. Si la cliente est devant vous et que le salon assume le
          dépassement, enregistrez quand même.
        </p>
        <BaseButton
          size="sm"
          variant="secondary"
          :loading="busy"
          @click="enregistrer({ force: true })"
        >
          Enregistrer malgré tout
        </BaseButton>
      </div>

      <p v-if="form.date" class="text-xs text-muted">
        {{ formatDateLong(form.date) }}
        <template v-if="form.time"> à {{ form.time }}</template>
      </p>
    </div>

    <template #footer>
      <BaseButton variant="secondary" :disabled="busy" @click="$emit('close')">Annuler</BaseButton>
      <BaseButton :loading="busy" @click="enregistrer()">Enregistrer le rendez-vous</BaseButton>
    </template>
  </BaseModal>
</template>
