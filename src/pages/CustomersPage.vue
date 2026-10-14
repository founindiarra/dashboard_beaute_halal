<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useResource } from '@/composables/useResource'
import { customers as api } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { formatDateShort, formatPrice, initialsOf } from '@/utils/format'

const router = useRouter()

/*
 * Toute la ligne ouvre la fiche, pas seulement le nom.
 *
 * Les colonnes « téléphone », « visites » et « total réglé » n'étaient
 * pas cliquables : on cliquait sur la ligne d'une cliente et rien ne se
 * passait, ce qui se lit comme une panne alors que c'était une zone morte.
 * Le nom et le chevron restent des liens véritables — pour le clavier, et
 * pour ouvrir dans un nouvel onglet — et ce gestionnaire ne fait que
 * rattraper les clics tombés à côté.
 */
const ouvrirFiche = (item, evenement) => {
  // Un clic parti d'un lien ou d'un bouton se débrouille tout seul.
  if (evenement?.target?.closest?.('a, button')) return
  router.push({ name: 'customer', params: { id: item.id } })
}

/**
 * Les clientes du salon.
 *
 * Cette liste ne se saisit pas : une fiche naît toute seule dès qu'un
 * rendez-vous est déposé, le numéro de téléphone faisant office de
 * matricule. Deux réservations avec le même numéro, à six mois d'écart,
 * tombent sur la même fiche — c'est ce qui permet de compter les visites.
 *
 * On peut tout de même en créer une à la main : une cliente qui passe au
 * salon pour demander un prix, et qu'on veut pouvoir rappeler.
 */
const toasts = useToastStore()

const rows = ref([])
const meta = ref(null)
const loading = ref(false)
const error = ref(null)

const { data: stats, reload: reloadStats } = useResource(api.stats, null)

const filters = ref({ search: '', segment: '', order: 'recent', page: 1 })

const SEGMENTS = [
  { value: '', label: 'Toutes les clientes' },
  { value: 'returning', label: 'Fidèles — au moins deux visites' },
  { value: 'new', label: 'Nouvelles — une visite au plus' },
  { value: 'birthday', label: 'Anniversaire ce mois-ci' },
]

const ORDRES = [
  { value: 'recent', label: 'Vues récemment' },
  { value: 'visits', label: 'Nombre de visites' },
  { value: 'name', label: 'Ordre alphabétique' },
]

const hasFilters = computed(() => Boolean(filters.value.search || filters.value.segment))

const load = async () => {
  loading.value = true
  error.value = null
  try {
    const result = await api.list({
      search: filters.value.search || undefined,
      segment: filters.value.segment || undefined,
      order: filters.value.order,
      page: filters.value.page,
      limit: 25,
    })
    rows.value = result.rows
    meta.value = result.meta
  } catch (caught) {
    error.value = caught?.message || 'Chargement impossible.'
    rows.value = []
  } finally {
    loading.value = false
  }
}

let debounce = null
watch(
  () => filters.value.search,
  () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      filters.value.page = 1
      load()
    }, 350)
  },
)
watch(
  () => [filters.value.segment, filters.value.order],
  () => {
    filters.value.page = 1
    load()
  },
)
watch(() => filters.value.page, load)

load()

/* ── Création manuelle ── */
const modalOpen = ref(false)
const busy = ref(false)
const formError = ref('')
const form = ref({})

const openCreate = () => {
  formError.value = ''
  form.value = {
    phone: '',
    firstName: '',
    lastName: '',
    email: '',
    birthDate: '',
    note: '',
    smsOptIn: true,
  }
  modalOpen.value = true
}

const save = async () => {
  formError.value = ''
  if (!form.value.phone || form.value.phone.replace(/\D/g, '').length < 8) {
    formError.value = 'Le numéro de téléphone est incomplet.'
    return
  }
  if (!form.value.firstName?.trim() || !form.value.lastName?.trim()) {
    formError.value = 'Indiquez le prénom et le nom.'
    return
  }

  busy.value = true
  try {
    await api.create({
      phone: form.value.phone.trim(),
      firstName: form.value.firstName.trim(),
      lastName: form.value.lastName.trim(),
      email: form.value.email?.trim() || null,
      birthDate: form.value.birthDate || null,
      note: form.value.note?.trim() || null,
      smsOptIn: Boolean(form.value.smsOptIn),
    })
    modalOpen.value = false
    await Promise.all([load(), reloadStats()])
    toasts.success('Fiche cliente créée.')
  } catch (caught) {
    // Notamment le 409 « Ce numéro est déjà celui de … ».
    formError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}

const fidelite = (visites) => {
  if (visites >= 5) return { label: 'Habituée', tone: 'ok' }
  if (visites >= 2) return { label: 'Fidèle', tone: 'info' }
  if (visites === 1) return { label: 'Première visite', tone: 'neutral' }
  return { label: 'Pas encore venue', tone: 'warn' }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Clientes"
      subtitle="Une fiche par numéro de téléphone. Elle se crée toute seule dès la première réservation."
    >
      <template #actions>
        <BaseButton size="sm" variant="secondary" :to="{ name: 'messaging' }">
          <AdminIcon name="send" class="h-3.5 w-3.5" />
          Messagerie
        </BaseButton>
        <BaseButton size="sm" @click="openCreate">
          <AdminIcon name="plus" class="h-3.5 w-3.5" />
          Ajouter une cliente
        </BaseButton>
      </template>
    </PageHeader>

    <!-- ── Compteurs ── -->
    <div v-if="stats" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="tuile in [
          { icon: 'users', value: stats.total, label: 'Clientes enregistrées' },
          { icon: 'star', value: stats.returning, label: 'Revenues au moins deux fois' },
          { icon: 'gift', value: stats.birthdaysThisMonth, label: 'Anniversaires ce mois-ci' },
          { icon: 'send', value: stats.smsReachable, label: 'Joignables par SMS' },
        ]"
        :key="tuile.label"
        class="card stat-card"
      >
        <span class="stat-icon"><AdminIcon :name="tuile.icon" class="h-5 w-5" /></span>
        <span class="stat-value">{{ tuile.value }}</span>
        <span class="text-[0.78rem] text-muted">{{ tuile.label }}</span>
      </div>
    </div>

    <!-- ── Filtres ── -->
    <div class="card flex flex-col gap-3 p-3.5 lg:flex-row lg:items-end">
      <SearchInput
        v-model="filters.search"
        label="Rechercher une cliente"
        placeholder="Nom, téléphone, e-mail…"
      />
      <div class="grid flex-1 gap-3 sm:grid-cols-2">
        <BaseField v-model="filters.segment" label="Segment" :options="SEGMENTS" />
        <BaseField v-model="filters.order" label="Trier par" :options="ORDRES" />
      </div>
    </div>

    <!-- ── Liste ── -->
    <section class="card overflow-hidden">
      <DataState
        :loading="loading"
        :error="error"
        :empty="!rows.length"
        loading-label="Chargement des clientes…"
        :empty-label="
          hasFilters ? 'Aucune cliente ne correspond.' : 'Aucune cliente pour l’instant.'
        "
        empty-hint="Les fiches apparaissent dès la première réservation, sans rien saisir."
        @retry="load"
      >
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th class="hidden md:table-cell">Téléphone</th>
                <th>Visites</th>
                <th class="hidden lg:table-cell">Dernière visite</th>
                <th class="hidden sm:table-cell">Total réglé</th>
                <th class="w-10"><span class="sr-only">Ouvrir</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in rows"
                :key="item.id"
                class="cursor-pointer"
                @click="ouvrirFiche(item, $event)"
              >
                <td class="min-w-[11rem]">
                  <RouterLink
                    :to="{ name: 'customer', params: { id: item.id } }"
                    class="flex items-center gap-2.5"
                  >
                    <span class="avatar">{{ initialsOf(item) }}</span>
                    <span class="min-w-0">
                      <span class="block truncate text-cocoa-dark">{{ item.fullName }}</span>
                      <span class="block max-w-[13rem] truncate text-xs text-muted">
                        {{ item.email || 'Sans e-mail' }}
                      </span>
                    </span>
                  </RouterLink>
                </td>
                <td class="hidden whitespace-nowrap md:table-cell">
                  <a
                    :href="`tel:${item.phone}`"
                    class="text-cocoa-dark transition-colors hover:text-gold"
                  >
                    {{ item.phone }}
                  </a>
                </td>
                <td>
                  <StatusBadge
                    :label="`${item.visits} · ${fidelite(item.visits).label}`"
                    :tone="fidelite(item.visits).tone"
                  />
                  <span v-if="item.upcoming" class="mt-0.5 block text-[0.7rem] text-muted">
                    {{ item.upcoming }} à venir
                  </span>
                </td>
                <td class="hidden whitespace-nowrap text-xs lg:table-cell">
                  {{ item.lastVisit ? formatDateShort(item.lastVisit) : '—' }}
                </td>
                <td class="hidden whitespace-nowrap sm:table-cell">
                  {{ formatPrice(item.totalPaid) }}
                </td>
                <td class="text-right">
                  <RouterLink
                    :to="{ name: 'customer', params: { id: item.id } }"
                    class="inline-grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark"
                    :aria-label="`Ouvrir la fiche de ${item.fullName}`"
                  >
                    <AdminIcon name="chevron-right" class="h-4 w-4" />
                  </RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="meta && meta.pages > 1"
          class="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted"
        >
          <span>{{ meta.total }} clientes · page {{ meta.page }} sur {{ meta.pages }}</span>
          <div class="flex gap-1.5">
            <BaseButton
              size="sm"
              variant="secondary"
              :disabled="filters.page <= 1"
              @click="filters.page -= 1"
            >
              <AdminIcon name="chevron-left" class="h-3.5 w-3.5" />
              Précédent
            </BaseButton>
            <BaseButton
              size="sm"
              variant="secondary"
              :disabled="filters.page >= meta.pages"
              @click="filters.page += 1"
            >
              Suivant
              <AdminIcon name="chevron-right" class="h-3.5 w-3.5" />
            </BaseButton>
          </div>
        </div>
      </DataState>
    </section>

    <BaseModal :open="modalOpen" title="Ajouter une cliente" @close="modalOpen = false">
      <div class="flex flex-col gap-4">
        <p
          v-if="formError"
          class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ formError }}
        </p>

        <BaseField
          v-model="form.phone"
          label="Téléphone"
          type="tel"
          required
          placeholder="+225 07 00 00 00 01"
          hint="C’est lui qui identifie la cliente. Le même numéro retrouvera toujours cette fiche."
        />

        <div class="grid gap-4 sm:grid-cols-2">
          <BaseField v-model="form.firstName" label="Prénom" required />
          <BaseField v-model="form.lastName" label="Nom" required />
          <BaseField v-model="form.email" label="E-mail" type="email" />
          <BaseField
            v-model="form.birthDate"
            label="Date de naissance"
            type="date"
            hint="Pour le message d’anniversaire."
          />
        </div>

        <BaseField v-model="form.note" label="Note" textarea :rows="3" />

        <BaseToggle
          v-model="form.smsOptIn"
          label="Accepte de recevoir des SMS"
          hint="Décochez si la cliente ne souhaite pas être contactée."
        />
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="busy" @click="modalOpen = false">
          Annuler
        </BaseButton>
        <BaseButton :loading="busy" @click="save">Ajouter</BaseButton>
      </template>
    </BaseModal>
  </div>
</template>
