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
import SearchInput from '@/components/ui/SearchInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useResource } from '@/composables/useResource'
import { history as historyApi, testimonials as api } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { formatDateShort, toDateKey } from '@/utils/format'

const toasts = useToastStore()
const { data: items, loading, error, reload } = useResource(api.list, [])

/*
 * Prestations terminées, pour pouvoir rattacher un avis à celle qui l'a
 * inspiré. Le rattachement se fait par identifiant, jamais par rapprochement
 * de noms : deux clientes peuvent s'appeler pareil.
 *
 * Ce lien est facultatif. Un avis sans rendez-vous s'affiche exactement
 * comme avant sur le site public — il n'apparaît simplement pas dans
 * l'historique de la cliente.
 */
const { data: prestations } = useResource(
  () => historyApi.list({ status: 'completed', limit: 100 }).then((r) => r.rows),
  [],
)

const appointmentOptions = computed(() => [
  { value: '', label: 'Aucun rendez-vous rattaché' },
  ...(prestations.value ?? []).map((item) => ({
    value: String(item.id),
    label: `${formatDateShort(item.date)} — ${item.customer.firstName} ${item.customer.lastName} · ${item.serviceName}`,
  })),
])

const search = ref('')
const onlyUnpublished = ref(false)

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return (items.value ?? []).filter((item) => {
    if (onlyUnpublished.value && item.isPublished) return false
    if (!term) return true
    return `${item.firstName} ${item.comment} ${item.serviceName ?? ''}`.toLowerCase().includes(term)
  })
})

const publishedCount = computed(() => (items.value ?? []).filter((i) => i.isPublished).length)

const modalOpen = ref(false)
const editing = ref(null)
const busy = ref(false)
const formError = ref('')
const form = ref({})

const openCreate = () => {
  editing.value = null
  formError.value = ''
  form.value = {
    appointmentId: '',
    firstName: '',
    rating: 5,
    comment: '',
    serviceName: '',
    reviewedOn: toDateKey(),
    isPublished: true,
    position: 0,
  }
  modalOpen.value = true
}

const openEdit = (item) => {
  editing.value = item
  formError.value = ''
  form.value = {
    appointmentId: item.appointmentId ? String(item.appointmentId) : '',
    firstName: item.firstName,
    rating: item.rating,
    comment: item.comment,
    serviceName: item.serviceName ?? '',
    reviewedOn: item.reviewedOn ? String(item.reviewedOn).slice(0, 10) : '',
    isPublished: item.isPublished,
    position: item.position,
  }
  modalOpen.value = true
}

const save = async () => {
  formError.value = ''
  if (!form.value.firstName || form.value.firstName.trim().length < 2) {
    formError.value = 'Indiquez le prénom de la cliente.'
    return
  }
  if (!form.value.comment || form.value.comment.trim().length < 5) {
    formError.value = 'Le commentaire est trop court.'
    return
  }

  busy.value = true
  try {
    const payload = {
      appointmentId: form.value.appointmentId ? Number(form.value.appointmentId) : null,
      firstName: form.value.firstName.trim(),
      rating: Number(form.value.rating),
      comment: form.value.comment.trim(),
      serviceName: form.value.serviceName?.trim() || null,
      reviewedOn: form.value.reviewedOn || null,
      isPublished: Boolean(form.value.isPublished),
      position: Number(form.value.position) || 0,
    }
    if (editing.value) await api.update(editing.value.id, payload)
    else await api.create(payload)

    modalOpen.value = false
    await reload()
    toasts.success(editing.value ? 'Avis mis à jour.' : 'Avis ajouté.')
  } catch (caught) {
    formError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}

const togglePublished = async (item) => {
  try {
    await api.update(item.id, { isPublished: !item.isPublished })
    await reload()
    toasts.success(item.isPublished ? 'Avis dépublié.' : 'Avis publié.')
  } catch (caught) {
    toasts.error(caught?.message || 'Modification impossible.')
  }
}

const confirmTarget = ref(null)
const remove = async () => {
  busy.value = true
  try {
    await api.remove(confirmTarget.value.id)
    confirmTarget.value = null
    await reload()
    toasts.success('Avis supprimé.')
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
      title="Avis clientes"
      :subtitle="`${publishedCount} avis publié${publishedCount > 1 ? 's' : ''} sur ${items?.length ?? 0}. Seuls les avis publiés apparaissent sur le site.`"
    >
      <template #actions>
        <BaseButton size="sm" @click="openCreate">
          <AdminIcon name="plus" class="h-3.5 w-3.5" />
          Ajouter un avis
        </BaseButton>
      </template>
    </PageHeader>

    <div class="card flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
      <SearchInput v-model="search" placeholder="Prénom, commentaire, prestation…" />
      <label class="flex items-center gap-2 text-sm text-cocoa">
        <input
          v-model="onlyUnpublished"
          type="checkbox"
          class="h-4 w-4 accent-[var(--color-gold)]"
        />
        Afficher uniquement les avis non publiés
      </label>
    </div>

    <DataState
      :loading="loading"
      :error="error"
      :empty="!filtered.length"
      loading-label="Chargement des avis…"
      :empty-label="search || onlyUnpublished ? 'Aucun avis ne correspond.' : 'Aucun avis.'"
      @retry="reload"
    >
      <ul class="grid gap-3 lg:grid-cols-2">
        <li v-for="item in filtered" :key="item.id" class="card flex flex-col gap-3 p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-medium text-cocoa-dark">{{ item.firstName }}</p>
              <p class="text-xs text-muted">
                {{ item.serviceName || 'Prestation non précisée' }}
                <span v-if="item.reviewedOn"> · {{ formatDateShort(item.reviewedOn) }}</span>
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <span class="flex gap-0.5" :aria-label="`Note : ${item.rating} sur 5`">
                <AdminIcon
                  v-for="n in 5"
                  :key="n"
                  name="star"
                  class="h-3.5 w-3.5"
                  :class="n <= item.rating ? 'text-gold' : 'text-sand-dark'"
                />
              </span>
              <StatusBadge
                :label="item.isPublished ? 'Publié' : 'Masqué'"
                :tone="item.isPublished ? 'ok' : 'neutral'"
              />
            </div>
          </div>

          <p class="text-sm leading-relaxed text-cocoa">« {{ item.comment }} »</p>

          <div class="mt-auto flex items-center justify-end gap-0.5 border-t border-line-soft pt-2">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark"
              @click="togglePublished(item)"
            >
              <AdminIcon :name="item.isPublished ? 'eye-off' : 'eye'" class="h-3.5 w-3.5" />
              {{ item.isPublished ? 'Dépublier' : 'Publier' }}
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
        </li>
      </ul>
    </DataState>

    <BaseModal
      :open="modalOpen"
      :title="editing ? 'Modifier l’avis' : 'Ajouter un avis'"
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

        <div class="grid gap-4 sm:grid-cols-2">
          <BaseField v-model="form.firstName" label="Prénom" required placeholder="Fanta" />
          <BaseField
            v-model="form.rating"
            label="Note"
            :options="[5, 4, 3, 2, 1].map((n) => ({ value: n, label: `${n} / 5` }))"
          />
          <BaseField
            v-model="form.serviceName"
            label="Prestation"
            placeholder="Création de locks"
            hint="Texte libre : ce champ n’est pas relié au catalogue."
          />
          <BaseField v-model="form.reviewedOn" label="Date de l’avis" type="date" />
        </div>

        <BaseField v-model="form.comment" label="Commentaire" textarea :rows="4" required />

        <BaseField
          v-model="form.appointmentId"
          label="Rendez-vous concerné"
          :options="appointmentOptions"
          hint="Facultatif. Rattaché, l’avis remonte dans l’historique de la cliente."
        />
        <BaseField v-model="form.position" label="Position" type="number" :min="0" />
        <BaseToggle v-model="form.isPublished" label="Publier sur le site" />
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
      title="Supprimer l’avis"
      :message="`L’avis de ${confirmTarget?.firstName} sera supprimé.`"
      @confirm="remove"
      @close="confirmTarget = null"
    />
  </div>
</template>
