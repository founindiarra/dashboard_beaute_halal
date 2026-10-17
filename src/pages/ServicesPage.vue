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
import SearchInput from '@/components/ui/SearchInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useResource } from '@/composables/useResource'
import { lockTypes, services as api } from '@/services'
import { useToastStore } from '@/stores/toasts'

const toasts = useToastStore()

/**
 * Une prestation EST une coiffure du salon (celles de la page « Nos coiffures »
 * du site). Sa catégorie est l'un des trois types de locks ; aucun prix ni
 * horaire ici : le prix se fixe à la confirmation du rendez-vous.
 */
const load = async () => {
  const [items, types] = await Promise.all([api.list(), lockTypes.list()])
  // `categories` = les trois types, avec l'identifiant de catégorie attendu par l'API.
  const categories = types.filter((t) => t.categoryId).map((t) => ({ id: t.categoryId, name: t.name }))
  const ids = new Set(categories.map((c) => c.id))
  // La prestation technique des demandes du site n'est pas une coiffure : on ne l'affiche pas.
  return { items: items.filter((i) => ids.has(i.category.id)), categories }
}

const { data, loading, error, reload } = useResource(load, { items: [], categories: [] })

const search = ref('')
const categoryFilter = ref('')

const categoryOptions = computed(() => [
  { value: '', label: 'Tous les types' },
  ...(data.value?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name })),
])

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return (data.value?.items ?? []).filter((item) => {
    if (categoryFilter.value && String(item.category.id) !== categoryFilter.value) return false
    if (!term) return true
    return `${item.name} ${item.description ?? ''} ${item.category.name}`
      .toLowerCase()
      .includes(term)
  })
})

/* ── Formulaire ── */
const modalOpen = ref(false)
const editing = ref(null)
const busy = ref(false)
const formError = ref('')
const form = ref({})

const emptyForm = () => ({
  categoryId: data.value?.categories?.[0]?.id ?? '',
  name: '',
  description: '',
  imageUrl: '',
  isFeatured: false,
  isActive: true,
  position: 0,
})

const openCreate = () => {
  editing.value = null
  formError.value = ''
  form.value = emptyForm()
  modalOpen.value = true
}

const openEdit = (item) => {
  editing.value = item
  formError.value = ''
  form.value = {
    categoryId: item.category.id,
    name: item.name,
    description: item.description ?? '',
    // On renvoie le chemin relatif d'origine, pas l'URL absolue reconstruite
    // par l'API, pour ne pas figer le domaine dans la base.
    imageUrl: item.imageUrl ? String(item.imageUrl).replace(/^https?:\/\/[^/]+/, '') : '',
    isFeatured: item.isFeatured,
    isActive: item.isActive,
    position: item.position,
  }
  modalOpen.value = true
}

const save = async () => {
  formError.value = ''
  if (!form.value.name || form.value.name.trim().length < 2) {
    formError.value = 'Le nom doit faire au moins 2 caractères.'
    return
  }
  if (!form.value.categoryId) {
    formError.value = 'Choisissez une catégorie.'
    return
  }

  busy.value = true
  try {
    const payload = {
      categoryId: Number(form.value.categoryId),
      name: form.value.name.trim(),
      description: form.value.description?.trim() || null,
      imageUrl: form.value.imageUrl || null,
      isFeatured: Boolean(form.value.isFeatured),
      isActive: Boolean(form.value.isActive),
      position: Number(form.value.position) || 0,
    }

    if (editing.value) await api.update(editing.value.id, payload)
    else await api.create(payload)

    modalOpen.value = false
    await reload()
    toasts.success(editing.value ? 'Coiffure mise à jour.' : 'Coiffure enregistrée.')
  } catch (caught) {
    formError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}

/** Bascule rapide depuis la liste, sans ouvrir le formulaire. */
const toggleActive = async (item) => {
  try {
    await api.update(item.id, { isActive: !item.isActive })
    await reload()
    toasts.success(item.isActive ? 'Coiffure masquée du site.' : 'Coiffure visible sur le site.')
  } catch (caught) {
    toasts.error(caught?.message || 'Modification impossible.')
  }
}

/* ── Suppression ── */
const confirmTarget = ref(null)
const remove = async () => {
  busy.value = true
  try {
    await api.remove(confirmTarget.value.id)
    confirmTarget.value = null
    await reload()
    toasts.success('Coiffure supprimée.')
  } catch (caught) {
    // 409 : des rendez-vous référencent la prestation. Le message vient de l'API.
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
      title="Prestations"
      subtitle="Les coiffures du salon : elles alimentent la page « Nos coiffures » du site. Le prix se fixe à la confirmation du rendez-vous."
    >
      <template #actions>
        <BaseButton size="sm" @click="openCreate">
          <AdminIcon name="plus" class="h-3.5 w-3.5" />
          Nouvelle coiffure
        </BaseButton>
      </template>
    </PageHeader>

    <div class="card flex flex-col gap-3 p-3.5 sm:flex-row sm:items-end">
      <SearchInput v-model="search" placeholder="Nom, description…" />
      <div class="sm:w-56">
        <BaseField v-model="categoryFilter" label="Type de locks" :options="categoryOptions" />
      </div>
    </div>

    <section class="card overflow-hidden">
      <DataState
        :loading="loading"
        :error="error"
        :empty="!filtered.length"
        loading-label="Chargement des prestations…"
        :empty-label="
          search || categoryFilter
            ? 'Aucune coiffure ne correspond.'
            : 'Aucune coiffure enregistrée.'
        "
        @retry="reload"
      >
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th class="w-14"><span class="sr-only">Image</span></th>
                <th>Coiffure</th>
                <th class="hidden sm:table-cell">Type de locks</th>
                <th>Statut</th>
                <th class="w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in filtered" :key="item.id">
                <td>
                  <div
                    class="grid h-10 w-10 place-items-center overflow-hidden rounded-md bg-ivory"
                  >
                    <img
                      v-if="item.imageUrl"
                      :src="item.imageUrl"
                      alt=""
                      class="h-full w-full object-cover"
                    />
                    <AdminIcon v-else name="image" class="h-4 w-4 text-sand-dark" />
                  </div>
                </td>
                <td class="min-w-[11rem]">
                  <span class="block text-cocoa-dark">{{ item.name }}</span>
                  <span class="block max-w-[22rem] truncate text-xs text-muted">
                    {{ item.description || '—' }}
                  </span>
                </td>
                <td class="hidden sm:table-cell">{{ item.category.name }}</td>
                <td>
                  <div class="flex flex-wrap items-center gap-1">
                    <StatusBadge
                      :label="item.isActive ? 'Active' : 'Inactive'"
                      :tone="item.isActive ? 'ok' : 'neutral'"
                    />
                    <StatusBadge v-if="item.isFeatured" label="En avant" tone="info" />
                  </div>
                </td>
                <td>
                  <div class="flex items-center justify-end gap-0.5">
                    <button
                      type="button"
                      class="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark"
                      :aria-label="item.isActive ? 'Désactiver' : 'Activer'"
                      :title="item.isActive ? 'Désactiver' : 'Activer'"
                      @click="toggleActive(item)"
                    >
                      <AdminIcon :name="item.isActive ? 'eye-off' : 'eye'" class="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      class="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark"
                      aria-label="Modifier"
                      title="Modifier"
                      @click="openEdit(item)"
                    >
                      <AdminIcon name="edit" class="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      class="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                      aria-label="Supprimer"
                      title="Supprimer"
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

    <!-- ── Formulaire ── -->
    <BaseModal
      :open="modalOpen"
      :title="editing ? 'Modifier la coiffure' : 'Nouvelle coiffure'"
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
          <BaseField v-model="form.name" label="Nom de la coiffure" required placeholder="Locks longues soignées" />
          <BaseField
            v-model="form.categoryId"
            label="Type de locks"
            required
            :options="(data?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))"
          />
          <BaseField
            v-model="form.position"
            label="Position"
            type="number"
            :min="0"
            hint="Ordre d’affichage, du plus petit au plus grand."
          />
        </div>

        <BaseField
          v-model="form.description"
          label="Description"
          textarea
          :rows="3"
          placeholder="Visible sur la page Nos coiffures, à côté de la photo."
        />

        <ImageField v-model="form.imageUrl" label="Photo" @error="formError = $event" />

        <div class="grid gap-3 sm:grid-cols-2">
          <BaseToggle
            v-model="form.isActive"
            label="Visible sur le site"
            hint="Apparaît dans « Nos coiffures » (une photo est nécessaire)."
          />
          <BaseToggle
            v-model="form.isFeatured"
            label="Mise en avant"
            hint="Apparaît sur la page d’accueil du site."
          />
        </div>
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="busy" @click="modalOpen = false">
          Annuler
        </BaseButton>
        <BaseButton :loading="busy" @click="save">
          {{ editing ? 'Enregistrer' : 'Enregistrer la coiffure' }}
        </BaseButton>
      </template>
    </BaseModal>

    <ConfirmDialog
      :open="Boolean(confirmTarget)"
      :busy="busy"
      title="Supprimer la coiffure"
      :message="`« ${confirmTarget?.name} » sera supprimée. Si des rendez-vous l’utilisent, la suppression sera refusée : désactivez-la plutôt.`"
      @confirm="remove"
      @close="confirmTarget = null"
    />
  </div>
</template>
