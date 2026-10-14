<script setup>
import { computed, ref } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataState from '@/components/ui/DataState.vue'
import ImageField from '@/components/ui/ImageField.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useResource } from '@/composables/useResource'
import { agents as api } from '@/services'
import { useToastStore } from '@/stores/toasts'

/**
 * Agents / coiffeuses.
 *
 * Cette page pilote la table historique `team_members` : c'est elle qui
 * porte les agents depuis toujours, et c'est à elle que les rendez-vous
 * renvoient par `staff_id`. Elle sert désormais à trois choses :
 *  – affecter une coiffeuse à un bureau et à un rendez-vous ;
 *  – nourrir le calcul de capacité (un agent de plus = des créneaux en plus) ;
 *  – nommer la coiffeuse sur le reçu remis à la cliente.
 *
 * Un agent désactivé disparaît des listes de choix mais garde tout son
 * passé : son nom reste sur les rendez-vous et les reçus déjà établis.
 */
const toasts = useToastStore()
const { data: members, loading, error, reload } = useResource(api.list, [])

const sorted = computed(() =>
  [...(members.value ?? [])].sort((a, b) => a.position - b.position || a.id - b.id),
)

const actifs = computed(() => sorted.value.filter((item) => item.isActive))

/** « 09:00 – 17:00 » ou, sans plage propre, les horaires du salon. */
const horaires = (item) =>
  item.worksFrom && item.worksTo
    ? `${item.worksFrom} – ${item.worksTo}`
    : 'Horaires du salon'

const modalOpen = ref(false)
const editing = ref(null)
const busy = ref(false)
const formError = ref('')
const form = ref({})

const openCreate = () => {
  editing.value = null
  formError.value = ''
  form.value = {
    name: '',
    role: '',
    phone: '',
    email: '',
    specialty: '',
    bio: '',
    imageUrl: '',
    isActive: true,
    position: sorted.value.length,
    worksFrom: '',
    worksTo: '',
  }
  modalOpen.value = true
}

const openEdit = (item) => {
  editing.value = item
  formError.value = ''
  form.value = {
    name: item.name,
    role: item.role,
    phone: item.phone ?? '',
    email: item.email ?? '',
    specialty: item.specialty ?? '',
    bio: item.bio ?? '',
    imageUrl: item.imageUrl ? String(item.imageUrl).replace(/^https?:\/\/[^/]+/, '') : '',
    isActive: item.isActive,
    position: item.position,
    worksFrom: item.worksFrom ?? '',
    worksTo: item.worksTo ?? '',
  }
  modalOpen.value = true
}

const save = async () => {
  formError.value = ''
  if (!form.value.name || form.value.name.trim().length < 2) {
    formError.value = 'Le nom doit faire au moins 2 caractères.'
    return
  }
  if (!form.value.role || form.value.role.trim().length < 2) {
    formError.value = 'Indiquez le rôle (ex. « Locticienne »).'
    return
  }
  // Une plage de travail se donne entière ou pas du tout : la moitié d'une
  // plage ne veut rien dire pour le calcul de capacité.
  if (Boolean(form.value.worksFrom) !== Boolean(form.value.worksTo)) {
    formError.value = 'Indiquez les deux horaires de travail, ou aucun des deux.'
    return
  }
  if (form.value.worksFrom && form.value.worksFrom >= form.value.worksTo) {
    formError.value = 'L’heure de fin doit suivre l’heure de début.'
    return
  }

  busy.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      role: form.value.role.trim(),
      phone: form.value.phone?.trim() || null,
      email: form.value.email?.trim() || null,
      specialty: form.value.specialty?.trim() || null,
      bio: form.value.bio?.trim() || null,
      imageUrl: form.value.imageUrl || null,
      isActive: Boolean(form.value.isActive),
      position: Number(form.value.position) || 0,
      worksFrom: form.value.worksFrom || null,
      worksTo: form.value.worksTo || null,
    }
    if (editing.value) await api.update(editing.value.id, payload)
    else await api.create(payload)

    modalOpen.value = false
    await reload()
    toasts.success(editing.value ? 'Agent mis à jour.' : 'Agent ajouté.')
  } catch (caught) {
    formError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}

const move = async (item, direction) => {
  const list = sorted.value
  const index = list.findIndex((entry) => entry.id === item.id)
  const target = list[index + direction]
  if (!target) return
  try {
    await Promise.all([
      api.update(item.id, { position: target.position }),
      api.update(target.id, { position: item.position }),
    ])
    await reload()
  } catch (caught) {
    toasts.error(caught?.message || 'Réorganisation impossible.')
  }
}

const confirmTarget = ref(null)
const remove = async () => {
  busy.value = true
  try {
    await api.remove(confirmTarget.value.id)
    confirmTarget.value = null
    await reload()
    toasts.success('Agent supprimé.')
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
      title="Agents & coiffeuses"
      subtitle="Qui réalise les prestations. Chaque agent actif augmente la capacité d’accueil du salon."
    >
      <template #actions>
        <BaseButton size="sm" @click="openCreate">
          <AdminIcon name="plus" class="h-3.5 w-3.5" />
          Ajouter un agent
        </BaseButton>
      </template>
    </PageHeader>

    <!--
      Sans agent actif, la capacité ne peut pas être calculée : l'API garde
      alors l'ancienne règle (seules les heures d'ouverture décident) plutôt
      que de fermer toutes les dates du site. On le dit ici, c'est la page
      où l'on peut y remédier.
    -->
    <p
      v-if="!loading && !error && !actifs.length"
      class="flex items-start gap-2.5 rounded-xl border border-warn/25 bg-warn-bg px-3.5 py-3 text-sm text-warn"
      role="status"
    >
      <AdminIcon name="info" class="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Aucun agent actif. Tant qu’il n’y en a pas, le site public propose les créneaux comme
        avant, sans limite de capacité. Ajoutez vos coiffeuses pour que les dates complètes
        se grisent automatiquement.
      </span>
    </p>

    <DataState
      :loading="loading"
      :error="error"
      :empty="!sorted.length"
      loading-label="Chargement des agents…"
      empty-label="Aucun agent enregistré."
      empty-hint="Ajoutez vos coiffeuses : elles pourront être affectées aux bureaux et aux rendez-vous."
      @retry="reload"
    >
      <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="(item, index) in sorted" :key="item.id" class="card flex gap-3 p-3">
          <div class="h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-ivory">
            <img
              v-if="item.imageUrl"
              :src="item.imageUrl"
              :alt="item.name"
              class="h-full w-full object-cover"
            />
            <div v-else class="grid h-full place-items-center">
              <AdminIcon name="user" class="h-6 w-6 text-sand-dark" />
            </div>
          </div>

          <div class="flex min-w-0 flex-1 flex-col">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate font-medium text-cocoa-dark">{{ item.name }}</p>
                <p class="truncate text-xs text-gold">{{ item.role }}</p>
              </div>
              <StatusBadge v-if="!item.isActive" label="Inactif" tone="neutral" />
            </div>

            <p v-if="item.specialty" class="mt-1 truncate text-xs text-cocoa">
              {{ item.specialty }}
            </p>

            <dl class="mt-1.5 flex flex-col gap-0.5 text-[0.72rem] text-muted">
              <div v-if="item.phone" class="flex items-center gap-1.5">
                <AdminIcon name="phone" class="h-3 w-3 shrink-0 text-gold" />
                <dd class="truncate">{{ item.phone }}</dd>
              </div>
              <div v-if="item.email" class="flex items-center gap-1.5">
                <AdminIcon name="mail" class="h-3 w-3 shrink-0 text-gold" />
                <dd class="truncate">{{ item.email }}</dd>
              </div>
              <div class="flex items-center gap-1.5">
                <AdminIcon name="clock" class="h-3 w-3 shrink-0 text-gold" />
                <dd class="truncate">{{ horaires(item) }}</dd>
              </div>
            </dl>

            <div class="mt-auto flex items-center justify-end gap-0.5 pt-2">
              <button
                type="button"
                class="grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark disabled:opacity-30"
                :disabled="index === 0"
                aria-label="Monter"
                @click="move(item, -1)"
              >
                <AdminIcon name="chevron-down" class="h-3.5 w-3.5 rotate-180" />
              </button>
              <button
                type="button"
                class="grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark disabled:opacity-30"
                :disabled="index === sorted.length - 1"
                aria-label="Descendre"
                @click="move(item, 1)"
              >
                <AdminIcon name="chevron-down" class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                class="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark"
                aria-label="Modifier"
                @click="openEdit(item)"
              >
                <AdminIcon name="edit" class="h-4 w-4" />
              </button>
              <button
                type="button"
                class="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                aria-label="Supprimer"
                @click="confirmTarget = item"
              >
                <AdminIcon name="trash" class="h-4 w-4" />
              </button>
            </div>
          </div>
        </li>
      </ul>
    </DataState>

    <BaseModal
      :open="modalOpen"
      :title="editing ? 'Modifier l’agent' : 'Ajouter un agent'"
      :subtitle="editing ? editing.name : ''"
      @close="modalOpen = false"
    >
      <div class="flex flex-col gap-4">
        <p
          v-if="formError"
          class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ formError }}
        </p>

        <div class="grid gap-4 sm:grid-cols-2">
          <BaseField v-model="form.name" label="Nom" required placeholder="Awa Koné" />
          <BaseField v-model="form.role" label="Rôle" required placeholder="Locticienne" />
          <BaseField v-model="form.phone" label="Téléphone" type="tel" placeholder="+225 07 00 00 00 00" />
          <BaseField v-model="form.email" label="E-mail" type="email" placeholder="awa@beaute-halal.ci" />
          <BaseField
            v-model="form.specialty"
            label="Spécialité"
            placeholder="Création et réparation"
          />
          <BaseField v-model="form.position" label="Position" type="number" :min="0" />
          <BaseField
            v-model="form.worksFrom"
            label="Travaille de"
            type="time"
            hint="Laissez vide pour suivre les horaires du salon."
          />
          <BaseField v-model="form.worksTo" label="Jusqu’à" type="time" />
        </div>

        <BaseField
          v-model="form.bio"
          label="Biographie"
          textarea
          :rows="4"
          placeholder="Parcours, approche, expérience…"
        />

        <ImageField v-model="form.imageUrl" label="Photo" @error="formError = $event" />

        <BaseToggle
          v-model="form.isActive"
          label="Agent en poste"
          hint="Décochez pour le retirer des listes de choix et du calcul de capacité. Son passé est conservé."
        />
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="busy" @click="modalOpen = false">
          Annuler
        </BaseButton>
        <BaseButton :loading="busy" @click="save">
          {{ editing ? 'Enregistrer' : 'Ajouter' }}
        </BaseButton>
      </template>
    </BaseModal>

    <ConfirmDialog
      :open="Boolean(confirmTarget)"
      :busy="busy"
      title="Supprimer l’agent"
      :message="`« ${confirmTarget?.name} » sera retiré. Un agent déjà inscrit sur un rendez-vous ne peut pas être supprimé : désactivez-le.`"
      @confirm="remove"
      @close="confirmTarget = null"
    />
  </div>
</template>
