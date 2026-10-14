<script setup>
import { computed, ref } from 'vue'

import AdminIcon from './AdminIcon.vue'
import BaseButton from './BaseButton.vue'
import BaseField from './BaseField.vue'
import BaseModal from './BaseModal.vue'
import BaseToggle from './BaseToggle.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import DataState from './DataState.vue'
import StatusBadge from './StatusBadge.vue'
import { useToastStore } from '@/stores/toasts'

/**
 * Gestion d'une liste de catégories. Le même écran sert aux catégories de
 * prestations et à celles de la galerie : seules l'API et quelques libellés
 * changent, la logique est identique.
 */
const props = defineProps({
  /** Objet { list, create, update, remove } de la couche services. */
  api: { type: Object, required: true },
  itemLabel: { type: String, default: 'catégorie' },
  /** Certaines catégories (galerie) n'ont pas de description en base. */
  withDescription: { type: Boolean, default: true },
  /** Message affiché lorsqu'une suppression est refusée pour cause de contenu. */
  inUseHint: { type: String, default: '' },
})

const toasts = useToastStore()

const items = ref([])
const loading = ref(false)
const error = ref(null)

const load = async () => {
  loading.value = true
  error.value = null
  try {
    items.value = await props.api.list()
  } catch (caught) {
    error.value = caught?.message || 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}
load()

const sorted = computed(() =>
  [...items.value].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
)

/* ── Formulaire ── */
const modalOpen = ref(false)
const editing = ref(null)
const busy = ref(false)
const formError = ref('')
const form = ref({ name: '', description: '', position: 0, isActive: true })

const openCreate = () => {
  editing.value = null
  formError.value = ''
  form.value = { name: '', description: '', position: items.value.length, isActive: true }
  modalOpen.value = true
}

const openEdit = (item) => {
  editing.value = item
  formError.value = ''
  form.value = {
    name: item.name,
    description: item.description ?? '',
    position: item.position,
    isActive: item.isActive !== false,
  }
  modalOpen.value = true
}

const save = async () => {
  formError.value = ''
  if (!form.value.name || form.value.name.trim().length < 2) {
    formError.value = 'Le nom doit faire au moins 2 caractères.'
    return
  }

  busy.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      position: Number(form.value.position) || 0,
      isActive: Boolean(form.value.isActive),
    }
    // Le slug n'est pas renvoyé : le backend le regénère depuis le nom
    // uniquement à la création, pour ne jamais casser une adresse existante.
    if (props.withDescription) payload.description = form.value.description?.trim() || null

    if (editing.value) await props.api.update(editing.value.id, payload)
    else await props.api.create(payload)

    modalOpen.value = false
    await load()
    toasts.success(editing.value ? 'Catégorie mise à jour.' : 'Catégorie créée.')
  } catch (caught) {
    formError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}

/** Déplacement d'un cran : on échange les positions des deux voisins. */
const move = async (item, direction) => {
  const list = sorted.value
  const index = list.findIndex((entry) => entry.id === item.id)
  const target = list[index + direction]
  if (!target) return

  try {
    await Promise.all([
      props.api.update(item.id, { position: target.position }),
      props.api.update(target.id, { position: item.position }),
    ])
    await load()
  } catch (caught) {
    toasts.error(caught?.message || 'Réorganisation impossible.')
  }
}

/* ── Suppression ── */
const confirmTarget = ref(null)
const remove = async () => {
  busy.value = true
  try {
    await props.api.remove(confirmTarget.value.id)
    confirmTarget.value = null
    await load()
    toasts.success('Catégorie supprimée.')
  } catch (caught) {
    toasts.error(caught?.message || 'Suppression impossible.')
    confirmTarget.value = null
  } finally {
    busy.value = false
  }
}

defineExpose({ reload: load })
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex justify-end">
      <BaseButton size="sm" @click="openCreate">
        <AdminIcon name="plus" class="h-3.5 w-3.5" />
        Nouvelle {{ itemLabel }}
      </BaseButton>
    </div>

    <div class="card overflow-hidden">
      <DataState
        :loading="loading"
        :error="error"
        :empty="!sorted.length"
        :loading-label="`Chargement des ${itemLabel}s…`"
        :empty-label="`Aucune ${itemLabel} enregistrée.`"
        @retry="load"
      >
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th class="w-20">Ordre</th>
                <th>Nom</th>
                <th v-if="withDescription" class="hidden md:table-cell">Description</th>
                <th>Statut</th>
                <th class="w-20 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in sorted" :key="item.id">
                <td>
                  <div class="flex items-center gap-0.5">
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
                  </div>
                </td>
                <td>
                  <span class="block text-cocoa-dark">{{ item.name }}</span>
                  <span class="block text-xs text-muted">{{ item.slug }}</span>
                </td>
                <td v-if="withDescription" class="hidden max-w-[24rem] truncate md:table-cell">
                  {{ item.description || '—' }}
                </td>
                <td>
                  <StatusBadge
                    :label="item.isActive === false ? 'Inactive' : 'Active'"
                    :tone="item.isActive === false ? 'neutral' : 'ok'"
                  />
                </td>
                <td>
                  <div class="flex items-center justify-end gap-0.5">
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
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DataState>
    </div>

    <BaseModal
      :open="modalOpen"
      :title="editing ? `Modifier la ${itemLabel}` : `Nouvelle ${itemLabel}`"
      size="sm"
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

        <BaseField v-model="form.name" label="Nom" required />
        <BaseField
          v-if="withDescription"
          v-model="form.description"
          label="Description"
          textarea
          :rows="3"
        />
        <BaseField v-model="form.position" label="Position" type="number" :min="0" />
        <BaseToggle v-model="form.isActive" label="Catégorie active" />
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
      :title="`Supprimer la ${itemLabel}`"
      :message="`« ${confirmTarget?.name} » sera supprimée. ${inUseHint}`"
      @confirm="remove"
      @close="confirmTarget = null"
    />
  </div>
</template>
