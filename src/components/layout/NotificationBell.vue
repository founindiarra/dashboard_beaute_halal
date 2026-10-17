<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import {
  appointments as appointmentsApi,
  customers as customersApi,
} from '@/services'
import { useAuthStore } from '@/stores/auth'
import { formatDateShort, initialsOf } from '@/utils/format'

/**
 * Cloche des choses à traiter.
 *
 * Deux sujets y vivent, et deux seulement — ce sont ceux qui coûtent quelque
 * chose si on les rate.
 *
 *  1. LES DEMANDES EN ATTENTE. Le compteur n'est pas décoratif : c'est le
 *     nombre réel de rendez-vous au statut « pending », lu sur
 *     /admin/appointments. Un seul appel sert le compteur et la liste.
 *
 *  2. LES ANNIVERSAIRES QUI ARRIVENT. Prévenir le jour même ne sert à rien :
 *     le salon veut préparer un mot, parfois un geste. La fenêtre couvre donc
 *     aujourd'hui et les sept jours suivants, ce qui garantit de voir chaque
 *     anniversaire au moins la veille — même en ne se connectant pas tous les
 *     jours.
 *
 * Les deux listes se chargent en parallèle et chacune tient debout sans
 * l'autre : un échec sur les anniversaires n'efface pas les demandes, et
 * inversement. Un compteur faux serait pire que pas de compteur du tout.
 *
 * Les anniversaires ne sont demandés qu'aux comptes qui ont le droit
 * « clientes » — sans quoi l'appel reviendrait en 403 à chaque ouverture.
 */
const props = defineProps({
  /** Nombre de demandes en attente déjà connu (compteur du tableau de bord). */
  pending: { type: Number, default: 0 },
})

const emit = defineEmits(['seen'])

const auth = useAuthStore()

const open = ref(false)
const rows = ref([])
const total = ref(0)
const anniversaires = ref([])
const loading = ref(false)
const error = ref(null)
const conteneur = ref(null)

/** Le rond rouge additionne les deux sujets : rien ne passe inaperçu. */
const count = computed(
  () => (total.value || props.pending) + anniversaires.value.length,
)

/** « aujourd'hui », « demain », puis la date. */
const quand = (jours) => {
  if (jours === 0) return 'aujourd’hui'
  if (jours === 1) return 'demain'
  return `dans ${jours} jours`
}

const load = async () => {
  loading.value = true
  error.value = null

  const [demandes, fetes] = await Promise.allSettled([
    auth.can('appointments')
      ? appointmentsApi.list({ status: 'pending', order: 'asc', limit: 5, page: 1 })
      : Promise.resolve({ rows: [], meta: { total: 0 } }),
    auth.can('customers') ? customersApi.upcomingBirthdays(7) : Promise.resolve([]),
  ])

  if (demandes.status === 'fulfilled') {
    rows.value = demandes.value.rows
    total.value = demandes.value.meta?.total ?? demandes.value.rows.length
    emit('seen', total.value)
  } else {
    error.value = demandes.reason?.message || 'Chargement impossible.'
    rows.value = []
  }

  // Un échec ici est silencieux : les anniversaires sont un confort, pas une
  // alerte. Les faire crier masquerait les demandes, qui, elles, pressent.
  anniversaires.value = fetes.status === 'fulfilled' ? (fetes.value ?? []) : []

  loading.value = false
}

const toggle = () => {
  open.value = !open.value
  if (open.value) load()
}

/** Un clic à côté ou la touche Échap referment le panneau. */
const onDocumentClick = (event) => {
  if (!open.value) return
  if (conteneur.value && !conteneur.value.contains(event.target)) open.value = false
}
const onKeydown = (event) => {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  load()
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

defineExpose({ load })
</script>

<template>
  <div ref="conteneur" class="relative">
    <button
      type="button"
      class="relative grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark"
      :aria-expanded="open"
      aria-haspopup="dialog"
      :aria-label="count > 0 ? `${count} élément(s) à traiter` : 'Rien à traiter'"
      @click="toggle"
    >
      <AdminIcon name="bell" class="h-[1.15rem] w-[1.15rem]" />
      <span
        v-if="count > 0"
        class="absolute -right-0.5 -top-0.5 grid min-w-[1.05rem] place-items-center rounded-full bg-danger px-1 text-[0.6rem] font-medium leading-[1.05rem] text-white"
      >
        {{ count > 99 ? '99+' : count }}
      </span>
    </button>

    <!--
      Sur téléphone le panneau est FIXE et collé aux deux bords de l'écran :
      ancré à droite de la cloche, il débordait à gauche du viewport et se
      faisait rogner — on lisait « andes en attente ». La cloche n'est pas au
      bord droit de l'écran, l'avatar et la déconnexion la suivent. À partir
      de « sm », il redevient un menu ancré sous le bouton.
    -->
    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition duration-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        role="dialog"
        aria-label="Notifications"
        class="card fixed inset-x-3 top-[3.6rem] z-50 overflow-hidden p-0 shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[21rem]"
      >
        <div class="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
          <p class="text-[0.8rem] font-medium text-cocoa-dark">Rendez-vous en attente</p>
          <span v-if="total > 0" class="text-[0.7rem] text-muted">{{ total }} au total</span>
        </div>

        <div v-if="loading" class="px-3.5 py-6 text-center text-xs text-muted">Chargement…</div>

        <p v-else-if="error" class="px-3.5 py-6 text-center text-xs text-danger">{{ error }}</p>

        <!-- Rien en attente : on le dit franchement plutôt que d'afficher un vide. -->
        <div v-else-if="!rows.length" class="flex flex-col items-center gap-1.5 px-3.5 py-5">
          <span class="grid h-9 w-9 place-items-center rounded-full bg-ok-bg text-ok">
            <AdminIcon name="check" class="h-4 w-4" />
          </span>
          <p class="text-[0.82rem] text-cocoa-dark">Aucune demande en attente</p>
          <p class="text-[0.7rem] text-muted">Tout est traité.</p>
        </div>

        <ul v-else class="max-h-[18rem] overflow-y-auto">
          <li v-for="item in rows" :key="item.id" class="border-b border-line-soft last:border-0">
            <RouterLink
              :to="{ name: 'appointments', query: { status: 'pending' } }"
              class="flex items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-ivory/60"
              @click="open = false"
            >
              <span class="avatar">{{ initialsOf(item.customer) }}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[0.82rem] text-cocoa-dark">
                  {{ item.customer.firstName }} {{ item.customer.lastName }}
                </span>
                <span class="block truncate text-[0.7rem] text-muted">
                  {{ formatDateShort(item.date) }}{{ item.timeToSet ? '' : ` à ${item.time}` }} · {{ item.service.name }}
                </span>
              </span>
              <AdminIcon name="chevron-right" class="h-3.5 w-3.5 shrink-0 text-sand-dark" />
            </RouterLink>
          </li>
        </ul>

        <!--
          Les anniversaires : une section à part, sous les demandes. Le salon
          les voit au moins la veille, ce qui laisse le temps d'écrire.
        -->
        <template v-if="anniversaires.length">
          <div
            class="flex items-center justify-between gap-2 border-t border-b border-line bg-ivory/60 px-3.5 py-2.5"
          >
            <p class="flex items-center gap-1.5 text-[0.8rem] font-medium text-cocoa-dark">
              <AdminIcon name="gift" class="h-3.5 w-3.5 text-gold" />
              Anniversaires à venir
            </p>
            <span class="text-[0.7rem] text-muted">{{ anniversaires.length }}</span>
          </div>

          <ul class="max-h-[14rem] overflow-y-auto">
            <li
              v-for="cliente in anniversaires"
              :key="cliente.id"
              class="border-b border-line-soft last:border-0"
            >
              <RouterLink
                :to="{ name: 'customer', params: { id: cliente.id } }"
                class="flex items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-ivory/60"
                @click="open = false"
              >
                <span class="avatar">{{ initialsOf(cliente) }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[0.82rem] text-cocoa-dark">
                    {{ cliente.fullName }}
                  </span>
                  <span class="block truncate text-[0.7rem] text-muted">
                    Anniversaire {{ quand(cliente.inDays) }}
                  </span>
                </span>
                <span
                  v-if="cliente.inDays <= 1"
                  class="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[0.65rem] font-medium text-gold"
                >
                  {{ cliente.inDays === 0 ? 'Aujourd’hui' : 'Demain' }}
                </span>
              </RouterLink>
            </li>
          </ul>

          <RouterLink
            :to="{ name: 'messaging' }"
            class="flex items-center justify-center gap-1.5 border-t border-line px-3.5 py-2.5 text-[0.76rem] text-cocoa transition-colors hover:text-gold"
            @click="open = false"
          >
            Envoyer les vœux depuis la messagerie
            <AdminIcon name="arrow-right" class="h-3.5 w-3.5" />
          </RouterLink>
        </template>

        <RouterLink
          :to="{ name: 'appointments', query: { status: 'pending' } }"
          class="flex items-center justify-center gap-1.5 border-t border-line px-3.5 py-2.5 text-[0.76rem] text-cocoa transition-colors hover:text-gold"
          @click="open = false"
        >
          Voir tous les rendez-vous
          <AdminIcon name="arrow-right" class="h-3.5 w-3.5" />
        </RouterLink>
      </div>
    </Transition>
  </div>
</template>
