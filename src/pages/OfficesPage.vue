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
import { agents as agentsApi, offices as api } from '@/services'
import { useToastStore } from '@/stores/toasts'

/**
 * Bureaux / salons.
 *
 * Le numéro est unique et c'est la base qui l'impose : si deux personnes
 * créent « Bureau 3 » en même temps, la seconde reçoit un 409 et le message
 * s'affiche tel quel. On ne vérifie donc pas l'unicité ici — une
 * vérification côté écran donnerait une fausse impression de sécurité.
 *
 * Un bureau peut porter un agent « habituel ». Ce n'est qu'une proposition
 * reprise au moment de traiter un rendez-vous, jamais une contrainte.
 */
const toasts = useToastStore()
const { data: offices, loading, error, reload } = useResource(api.list, [])
const { data: agents } = useResource(agentsApi.list, [])

const sorted = computed(() =>
  [...(offices.value ?? [])].sort(
    (a, b) =>
      a.position - b.position ||
      String(a.number).localeCompare(String(b.number), 'fr', { numeric: true }),
  ),
)

/** Un agent désactivé ne doit plus pouvoir être affecté à un bureau. */
const agentOptions = computed(() => [
  { value: '', label: 'Aucun agent attitré' },
  ...(agents.value ?? [])
    .filter((agent) => agent.isActive)
    .map((agent) => ({ value: String(agent.id), label: `${agent.name} — ${agent.role}` })),
])

const modalOpen = ref(false)
const editing = ref(null)
const busy = ref(false)
const formError = ref('')
const form = ref({})

const openCreate = () => {
  editing.value = null
  formError.value = ''
  form.value = {
    number: '',
    name: '',
    agentId: '',
    phone: '',
    email: '',
    address: '',
    description: '',
    imageUrl: '',
    isActive: true,
    position: sorted.value.length,
  }
  modalOpen.value = true
}

const openEdit = (item) => {
  editing.value = item
  formError.value = ''
  form.value = {
    number: item.number,
    name: item.name,
    agentId: item.agent ? String(item.agent.id) : '',
    phone: item.phone ?? '',
    email: item.email ?? '',
    address: item.address ?? '',
    description: item.description ?? '',
    imageUrl: item.imageUrl ? String(item.imageUrl).replace(/^https?:\/\/[^/]+/, '') : '',
    isActive: item.isActive,
    position: item.position,
  }
  modalOpen.value = true
}

const save = async () => {
  formError.value = ''
  if (!String(form.value.number).trim()) {
    formError.value = 'Le numéro du bureau est obligatoire.'
    return
  }
  if (!form.value.name || form.value.name.trim().length < 2) {
    formError.value = 'Le nom doit faire au moins 2 caractères.'
    return
  }

  busy.value = true
  try {
    const payload = {
      number: String(form.value.number).trim(),
      name: form.value.name.trim(),
      agentId: form.value.agentId ? Number(form.value.agentId) : null,
      phone: form.value.phone?.trim() || null,
      email: form.value.email?.trim() || null,
      address: form.value.address?.trim() || null,
      description: form.value.description?.trim() || null,
      imageUrl: form.value.imageUrl || null,
      isActive: Boolean(form.value.isActive),
      position: Number(form.value.position) || 0,
    }
    if (editing.value) await api.update(editing.value.id, payload)
    else await api.create(payload)

    modalOpen.value = false
    await reload()
    toasts.success(editing.value ? 'Bureau mis à jour.' : 'Bureau créé.')
  } catch (caught) {
    // Notamment le 409 « Le bureau n° X existe déjà. », renvoyé par la base.
    formError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}

const confirmTarget = ref(null)
const remove = async () => {
  busy.value = true
  try {
    await api.remove(confirmTarget.value.id)
    confirmTarget.value = null
    await reload()
    toasts.success('Bureau supprimé.')
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
      title="Bureaux & salons"
      subtitle="Les postes de travail où sont reçues les clientes. Chaque numéro est unique."
    >
      <template #actions>
        <BaseButton size="sm" @click="openCreate">
          <AdminIcon name="plus" class="h-3.5 w-3.5" />
          Ajouter un bureau
        </BaseButton>
      </template>
    </PageHeader>

    <DataState
      :loading="loading"
      :error="error"
      :empty="!sorted.length"
      loading-label="Chargement des bureaux…"
      empty-label="Aucun bureau enregistré."
      empty-hint="Créez vos bureaux pour pouvoir y installer les clientes à leur arrivée."
      @retry="reload"
    >
      <template #empty-action>
        <BaseButton size="sm" class="mt-2" @click="openCreate">
          <AdminIcon name="plus" class="h-3.5 w-3.5" />
          Ajouter un bureau
        </BaseButton>
      </template>

      <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <li v-for="item in sorted" :key="item.id" class="card flex flex-col gap-3 p-3.5">
          <div class="flex items-start gap-3">
            <span
              class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cocoa-dark font-display text-lg text-gold-soft"
            >
              {{ item.number }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-cocoa-dark">{{ item.name }}</p>
              <p class="truncate text-xs text-muted">
                {{ item.address || 'Adresse non renseignée' }}
              </p>
            </div>
            <StatusBadge
              :label="item.isActive ? 'Actif' : 'Inactif'"
              :tone="item.isActive ? 'ok' : 'neutral'"
            />
          </div>

          <div v-if="item.imageUrl" class="h-24 overflow-hidden rounded-lg bg-ivory">
            <img :src="item.imageUrl" :alt="item.name" class="h-full w-full object-cover" />
          </div>

          <dl class="flex flex-col gap-1 text-xs">
            <div class="flex items-center gap-2">
              <AdminIcon name="user" class="h-3.5 w-3.5 shrink-0 text-gold" />
              <dd class="min-w-0 truncate" :class="item.agent ? 'text-cocoa-dark' : 'text-muted'">
                {{ item.agent ? item.agent.name : 'Aucun agent attitré' }}
                <span v-if="item.agent && !item.agent.isActive" class="text-danger">
                  (désactivé)
                </span>
              </dd>
            </div>
            <div v-if="item.phone" class="flex items-center gap-2">
              <AdminIcon name="phone" class="h-3.5 w-3.5 shrink-0 text-gold" />
              <dd class="truncate text-cocoa">{{ item.phone }}</dd>
            </div>
            <div v-if="item.email" class="flex items-center gap-2">
              <AdminIcon name="mail" class="h-3.5 w-3.5 shrink-0 text-gold" />
              <dd class="truncate text-cocoa">{{ item.email }}</dd>
            </div>
          </dl>

          <p v-if="item.description" class="line-clamp-2 text-xs text-muted">
            {{ item.description }}
          </p>

          <div class="mt-auto flex items-center justify-end gap-0.5 pt-1">
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
        </li>
      </ul>
    </DataState>

    <BaseModal
      :open="modalOpen"
      :title="editing ? 'Modifier le bureau' : 'Ajouter un bureau'"
      :subtitle="editing ? `Bureau ${editing.number}` : ''"
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
          <BaseField
            v-model="form.number"
            label="Numéro"
            required
            placeholder="1"
            hint="Unique. « 1 », « B12 » ou « RDC-3 » conviennent."
          />
          <BaseField v-model="form.name" label="Nom" required placeholder="Bureau 1" />
          <BaseField v-model="form.agentId" label="Agent attitré" :options="agentOptions" />
          <BaseField v-model="form.position" label="Position" type="number" :min="0" />
          <BaseField v-model="form.phone" label="Téléphone" type="tel" />
          <BaseField v-model="form.email" label="E-mail" type="email" />
        </div>

        <BaseField v-model="form.address" label="Adresse" placeholder="Cocody, Abidjan" />
        <BaseField
          v-model="form.description"
          label="Description"
          textarea
          :rows="3"
          placeholder="Équipement, particularités, accès…"
        />

        <ImageField v-model="form.imageUrl" label="Photo du bureau" @error="formError = $event" />

        <BaseToggle
          v-model="form.isActive"
          label="Bureau en service"
          hint="Décochez pour le retirer des listes de choix sans perdre son historique."
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
      title="Supprimer le bureau"
      :message="`« ${confirmTarget?.name} » sera supprimé. Un bureau déjà inscrit sur un rendez-vous ne peut pas l’être : désactivez-le.`"
      @confirm="remove"
      @close="confirmTarget = null"
    />
  </div>
</template>
