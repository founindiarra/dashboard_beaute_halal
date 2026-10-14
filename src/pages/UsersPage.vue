<script setup>
import { computed, ref } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useResource } from '@/composables/useResource'
import { auth as api } from '@/services'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toasts'
import { formatDateTime, initialsOf } from '@/utils/format'

/**
 * Comptes d'accès au dashboard.
 *
 * ⚠️ À ne pas confondre avec les AGENTS. Un utilisateur se connecte et
 * enregistre des opérations ; un agent réalise les coiffures. Le reçu porte
 * les deux, sur deux lignes distinctes, et ce sont rarement les mêmes
 * personnes.
 *
 * Un mot de passe existant n'est jamais affiché ni récupérable : l'API ne
 * renvoie que le condensé, jamais le mot de passe. Le seul geste possible
 * est d'en définir un nouveau.
 *
 * La page est réservée au rôle « admin », comme les routes
 * /admin/auth/users côté serveur. La garde du routeur évite seulement
 * d'ouvrir un écran qui ne renverrait que des 403 — c'est le serveur qui
 * protège réellement.
 */
const toasts = useToastStore()
const auth = useAuthStore()
const { data: users, loading, error, reload } = useResource(api.listUsers, [])

const sorted = computed(() =>
  [...(users.value ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
)

/*
 * Deux rôles, et un seul compte administratrice dans l'usage prévu par le
 * salon. Le rôle « Équipe » est donc proposé en premier et sert de valeur
 * par défaut : créer une seconde administratrice doit rester un geste
 * délibéré, pas un défaut de formulaire.
 */
const ROLES = [
  { value: 'staff', label: 'Équipe — rendez-vous, encaissement, contenu' },
  { value: 'admin', label: 'Administratrice — tout, comptabilité et comptes compris' },
]

/** Ce que chaque rôle ouvre, dit en clair sous le sélecteur. */
const DETAIL_ROLE = {
  staff:
    'Accède aux rendez-vous, à l’encaissement, aux prestations, aux coiffures, aux horaires et aux agents. N’accède ni à la comptabilité ni aux comptes.',
  admin: 'Accède à tout, y compris la comptabilité et la gestion des comptes.',
}

const administratrices = computed(() =>
  (users.value ?? []).filter((item) => item.role === 'admin' && item.isActive),
)

const modalOpen = ref(false)
const editing = ref(null)
const busy = ref(false)
const formError = ref('')
const form = ref({})

const openCreate = () => {
  editing.value = null
  formError.value = ''
  form.value = { name: '', email: '', role: 'staff', password: '', isActive: true }
  modalOpen.value = true
}

const openEdit = (item) => {
  editing.value = item
  formError.value = ''
  // Le mot de passe repart vide : on ne peut que le remplacer, jamais le lire.
  form.value = {
    name: item.name,
    email: item.email,
    role: item.role,
    password: '',
    isActive: item.isActive,
  }
  modalOpen.value = true
}

const save = async () => {
  formError.value = ''
  const nom = form.value.name?.trim() ?? ''
  const email = form.value.email?.trim() ?? ''

  if (nom.length < 2) {
    formError.value = 'Le nom doit faire au moins 2 caractères.'
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    formError.value = 'Adresse e-mail invalide.'
    return
  }
  // À la création le mot de passe est obligatoire ; en modification, il n'est
  // envoyé que s'il a été saisi — un champ vide laisse l'ancien en place.
  if (!editing.value && form.value.password.length < 10) {
    formError.value = 'Le mot de passe doit faire au moins 10 caractères.'
    return
  }
  if (editing.value && form.value.password && form.value.password.length < 10) {
    formError.value = 'Le nouveau mot de passe doit faire au moins 10 caractères.'
    return
  }

  busy.value = true
  try {
    if (editing.value) {
      const payload = {
        name: nom,
        email,
        role: form.value.role,
        isActive: Boolean(form.value.isActive),
      }
      if (form.value.password) payload.password = form.value.password
      await api.updateUser(editing.value.id, payload)
    } else {
      await api.createUser({
        name: nom,
        email,
        role: form.value.role,
        password: form.value.password,
      })
    }

    modalOpen.value = false
    await reload()
    toasts.success(editing.value ? 'Compte mis à jour.' : 'Compte créé.')
  } catch (caught) {
    formError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}

/** Activation / désactivation directe depuis la liste. */
const toggleActive = async (item) => {
  try {
    await api.updateUser(item.id, { isActive: !item.isActive })
    await reload()
    toasts.success(item.isActive ? 'Compte désactivé.' : 'Compte réactivé.')
  } catch (caught) {
    toasts.error(caught?.message || 'Modification impossible.')
  }
}

const confirmTarget = ref(null)
const remove = async () => {
  busy.value = true
  try {
    await api.deleteUser(confirmTarget.value.id)
    confirmTarget.value = null
    await reload()
    toasts.success('Compte supprimé.')
  } catch (caught) {
    toasts.error(caught?.message || 'Suppression impossible.')
    confirmTarget.value = null
  } finally {
    busy.value = false
  }
}

const isSelf = (item) => item.id === auth.user?.id
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Utilisateurs"
      subtitle="Les comptes qui accèdent au tableau de bord. À distinguer des agents, qui réalisent les prestations."
    >
      <template #actions>
        <span
          class="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-muted sm:inline-flex"
        >
          <AdminIcon name="shield" class="h-3.5 w-3.5 text-gold" />
          {{ administratrices.length }} administratrice(s) · {{ (users ?? []).length }} compte(s)
        </span>
        <BaseButton size="sm" @click="openCreate">
          <AdminIcon name="plus" class="h-3.5 w-3.5" />
          Créer un compte
        </BaseButton>
      </template>
    </PageHeader>

    <section class="card overflow-hidden">
      <DataState
        :loading="loading"
        :error="error"
        :empty="!sorted.length"
        loading-label="Chargement des comptes…"
        empty-label="Aucun compte."
        @retry="reload"
      >
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th class="hidden md:table-cell">Rôle</th>
                <th class="hidden lg:table-cell">Dernière connexion</th>
                <th>État</th>
                <th class="w-24"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in sorted" :key="item.id">
                <td>
                  <div class="flex items-center gap-2.5">
                    <span class="avatar">{{ initialsOf(item.name) }}</span>
                    <span class="min-w-0">
                      <span class="block truncate text-cocoa-dark">
                        {{ item.name }}
                        <span v-if="isSelf(item)" class="text-xs text-muted">(vous)</span>
                      </span>
                      <span class="block max-w-[14rem] truncate text-xs text-muted">
                        {{ item.email }}
                      </span>
                    </span>
                  </div>
                </td>
                <td class="hidden md:table-cell">
                  <StatusBadge
                    :label="item.roleLabel"
                    :tone="item.role === 'admin' ? 'info' : 'neutral'"
                  />
                </td>
                <td class="hidden text-xs text-muted lg:table-cell">
                  {{ item.lastLoginAt ? formatDateTime(item.lastLoginAt) : 'Jamais connectée' }}
                </td>
                <td>
                  <StatusBadge
                    :label="item.isActive ? 'Actif' : 'Désactivé'"
                    :tone="item.isActive ? 'ok' : 'neutral'"
                  />
                </td>
                <td>
                  <div class="flex items-center justify-end gap-0.5">
                    <!--
                      On ne peut ni se désactiver ni se supprimer soi-même :
                      l'API le refuse, autant ne pas proposer le geste.
                    -->
                    <button
                      type="button"
                      class="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark disabled:opacity-30"
                      :disabled="isSelf(item)"
                      :aria-label="item.isActive ? 'Désactiver' : 'Réactiver'"
                      :title="item.isActive ? 'Désactiver' : 'Réactiver'"
                      @click="toggleActive(item)"
                    >
                      <AdminIcon :name="item.isActive ? 'eye-off' : 'eye'" class="h-4 w-4" />
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
                      class="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-30"
                      :disabled="isSelf(item)"
                      aria-label="Supprimer"
                      @click="confirmTarget = item"
                    >
                      <AdminIcon name="trash" class="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DataState>
    </section>

    <BaseModal
      :open="modalOpen"
      :title="editing ? 'Modifier le compte' : 'Créer un compte'"
      :subtitle="editing ? editing.email : ''"
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
          <BaseField v-model="form.name" label="Nom complet" required placeholder="Awa Koné" />
          <BaseField
            v-model="form.email"
            label="Adresse e-mail"
            type="email"
            required
            autocomplete="off"
            placeholder="awa@beaute-halal.ci"
          />
        </div>

        <BaseField
          v-model="form.role"
          label="Rôle"
          :options="ROLES"
          :hint="DETAIL_ROLE[form.role]"
        />

        <!--
          Le salon fonctionne avec une seule administratrice. En créer une
          seconde reste possible — un jour d'absence, cela peut sauver la
          journée — mais l'écran le dit, pour que ce soit un choix.
        -->
        <p
          v-if="form.role === 'admin' && administratrices.length >= 1 && !editing"
          class="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-xs text-warn"
        >
          <AdminIcon name="info" class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Il y a déjà {{ administratrices.length }} compte(s) administratrice. Ce nouveau compte
            aura lui aussi accès à la comptabilité et à la gestion des comptes.
          </span>
        </p>

        <BaseField
          v-model="form.password"
          :label="editing ? 'Nouveau mot de passe' : 'Mot de passe'"
          type="password"
          autocomplete="new-password"
          :required="!editing"
          :hint="
            editing
              ? 'Laissez vide pour conserver le mot de passe actuel. Un mot de passe existant ne peut pas être affiché.'
              : 'Au moins 10 caractères.'
          "
        />

        <BaseToggle
          v-if="editing"
          v-model="form.isActive"
          label="Compte actif"
          hint="Un compte désactivé ne peut plus se connecter, mais son historique est conservé."
        />
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="busy" @click="modalOpen = false">
          Annuler
        </BaseButton>
        <BaseButton :loading="busy" @click="save">
          {{ editing ? 'Enregistrer' : 'Créer' }}
        </BaseButton>
      </template>
    </BaseModal>

    <ConfirmDialog
      :open="Boolean(confirmTarget)"
      :busy="busy"
      title="Supprimer le compte"
      :message="`« ${confirmTarget?.name} » ne pourra plus se connecter. Les opérations qu’elle a enregistrées gardent son nom.`"
      @confirm="remove"
      @close="confirmTarget = null"
    />
  </div>
</template>
