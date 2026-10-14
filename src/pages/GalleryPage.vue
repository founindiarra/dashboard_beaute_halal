<script setup>
import { computed, ref } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'
import CategoryManager from '@/components/ui/CategoryManager.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataState from '@/components/ui/DataState.vue'
import ImageField from '@/components/ui/ImageField.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useResource } from '@/composables/useResource'
import { gallery as api, galleryCategories, services as servicesApi } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { formatPrice } from '@/utils/format'

const toasts = useToastStore()

const tab = ref('items') // items | categories

const load = async () => {
  const [items, categories, services] = await Promise.all([
    api.list(),
    galleryCategories.list(),
    servicesApi.list(),
  ])
  return { items, categories, services }
}

const { data, loading, error, reload } = useResource(load, {
  items: [],
  categories: [],
  services: [],
})

const search = ref('')
const categoryFilter = ref('')

const categoryOptions = computed(() => [
  { value: '', label: 'Toutes les catégories' },
  ...(data.value?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name })),
])

/** Seules les prestations actives peuvent être proposées à la réservation. */
const serviceOptions = computed(() => [
  { value: '', label: 'Aucune prestation associée' },
  ...(data.value?.services ?? [])
    .filter((s) => s.isActive)
    .map((s) => ({ value: s.id, label: `${s.name} — ${formatPrice(s.price, s.currency)}` })),
])

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return (data.value?.items ?? []).filter((item) => {
    if (categoryFilter.value && String(item.category.id) !== categoryFilter.value) return false
    if (!term) return true
    return `${item.title} ${item.description ?? ''}`.toLowerCase().includes(term)
  })
})

/* ── Formulaire ── */
const modalOpen = ref(false)
const editing = ref(null)
const busy = ref(false)
const formError = ref('')
const form = ref({})

const openCreate = () => {
  editing.value = null
  formError.value = ''
  form.value = {
    categoryId: data.value?.categories?.[0]?.id ?? '',
    serviceId: '',
    title: '',
    description: '',
    imageUrl: '',
    isFeatured: false,
    isActive: true,
    position: data.value?.items?.length ?? 0,
  }
  modalOpen.value = true
}

/**
 * Origine de l'API, seule adresse dont le préfixe puisse être retiré sans
 * casser l'image. Calculée une fois : elle ne change pas pendant la session.
 */
const API_ORIGIN = (() => {
  try {
    return new URL(import.meta.env.VITE_API_URL).origin
  } catch {
    return ''
  }
})()

/**
 * Remet une adresse d'image dans la forme attendue par la table `image_url`.
 *
 * Une photo téléversée est stockée en « /uploads/xxx.jpg » et renvoyée par
 * l'API préfixée de son origine : on retire ce préfixe pour retrouver le
 * chemin stocké.
 *
 * Une photo hébergée ailleurs (Unsplash, CDN du salon…) est une URL complète
 * qui n'appartient pas à l'API : lui retirer son domaine la transformerait en
 * chemin relatif mort — « https://images.unsplash.com/photo-42.jpg » ne doit
 * jamais devenir « /photo-42.jpg ». On la laisse telle quelle.
 */
const toStoredImagePath = (value) => {
  if (!value) return ''
  const url = String(value)
  if (API_ORIGIN && url.startsWith(`${API_ORIGIN}/`)) return url.slice(API_ORIGIN.length)
  return url
}

const openEdit = (item) => {
  editing.value = item
  formError.value = ''
  form.value = {
    categoryId: item.category.id,
    serviceId: item.service?.id ?? '',
    title: item.title,
    description: item.description ?? '',
    imageUrl: toStoredImagePath(item.imageUrl),
    isFeatured: item.isFeatured,
    isActive: item.isActive,
    position: item.position,
  }
  modalOpen.value = true
}

const save = async () => {
  formError.value = ''
  if (!form.value.title || form.value.title.trim().length < 2) {
    formError.value = 'Le titre doit faire au moins 2 caractères.'
    return
  }
  if (!form.value.categoryId) {
    formError.value = 'Choisissez une catégorie.'
    return
  }
  if (!form.value.imageUrl) {
    formError.value = 'Une photo est obligatoire pour une coiffure.'
    return
  }

  busy.value = true
  try {
    const payload = {
      categoryId: Number(form.value.categoryId),
      // `null` détache la coiffure : elle reste visible, sans raccourci de
      // réservation. Le backend refuse un identifiant de prestation inconnu.
      serviceId: form.value.serviceId ? Number(form.value.serviceId) : null,
      title: form.value.title.trim(),
      description: form.value.description?.trim() || null,
      imageUrl: form.value.imageUrl,
      isFeatured: Boolean(form.value.isFeatured),
      isActive: Boolean(form.value.isActive),
      position: Number(form.value.position) || 0,
    }

    if (editing.value) {
      // Ceinture et bretelles : si la photo n'a pas bougé, on ne l'envoie pas
      // du tout. `PATCH /admin/gallery/:id` est partiel — un champ absent est
      // laissé intact en base. Changer la prestation ne peut donc pas toucher
      // à l'image, même si sa forme venait à évoluer côté API.
      if (payload.imageUrl === toStoredImagePath(editing.value.imageUrl)) delete payload.imageUrl
      await api.update(editing.value.id, payload)
    } else {
      await api.create(payload)
    }

    modalOpen.value = false
    await reload()
    toasts.success(editing.value ? 'Coiffure mise à jour.' : 'Coiffure ajoutée.')
  } catch (caught) {
    formError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}

const toggleActive = async (item) => {
  try {
    await api.update(item.id, { isActive: !item.isActive })
    await reload()
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
      title="Nos coiffures"
      subtitle="Les réalisations présentées sur le site, et la prestation à réserver pour chacune."
    >
      <template #actions>
        <BaseButton v-if="tab === 'items'" size="sm" @click="openCreate">
          <AdminIcon name="plus" class="h-3.5 w-3.5" />
          Ajouter une coiffure
        </BaseButton>
      </template>
    </PageHeader>

    <div class="flex w-fit rounded-lg border border-line bg-surface p-0.5">
      <button
        v-for="mode in [
          { key: 'items', label: 'Coiffures' },
          { key: 'categories', label: 'Catégories' },
        ]"
        :key="mode.key"
        type="button"
        class="rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors"
        :class="tab === mode.key ? 'bg-cocoa-dark text-cream' : 'text-muted hover:text-cocoa-dark'"
        :aria-pressed="tab === mode.key"
        @click="tab = mode.key"
      >
        {{ mode.label }}
      </button>
    </div>

    <!-- ── Coiffures ── -->
    <template v-if="tab === 'items'">
      <div class="card flex flex-col gap-3 p-3.5 sm:flex-row sm:items-end">
        <SearchInput v-model="search" placeholder="Titre, description…" />
        <div class="sm:w-56">
          <BaseField v-model="categoryFilter" label="Catégorie" :options="categoryOptions" />
        </div>
      </div>

      <DataState
        :loading="loading"
        :error="error"
        :empty="!filtered.length"
        loading-label="Chargement des coiffures…"
        :empty-label="
          search || categoryFilter ? 'Aucune coiffure ne correspond.' : 'Aucune coiffure publiée.'
        "
        empty-hint="Ajoutez vos réalisations pour qu’elles apparaissent sur le site."
        @retry="reload"
      >
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <li v-for="item in filtered" :key="item.id" class="card flex flex-col overflow-hidden">
            <div class="relative aspect-[4/5] bg-ivory">
              <img
                v-if="item.imageUrl"
                :src="item.imageUrl"
                :alt="item.title"
                class="h-full w-full object-cover"
              />
              <div v-else class="grid h-full place-items-center">
                <AdminIcon name="image" class="h-7 w-7 text-sand-dark" />
              </div>

              <div class="absolute left-2 top-2 flex flex-wrap gap-1">
                <StatusBadge v-if="!item.isActive" label="Masquée" tone="neutral" />
                <StatusBadge v-if="item.isFeatured" label="En avant" tone="info" />
              </div>
            </div>

            <div class="flex flex-1 flex-col gap-2 p-3">
              <div class="min-w-0">
                <p class="truncate font-medium text-cocoa-dark">{{ item.title }}</p>
                <p class="text-xs text-muted">{{ item.category.name }}</p>
              </div>

              <p
                class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
                :class="item.service ? 'bg-ok-bg text-ok' : 'bg-warn-bg text-warn'"
              >
                <AdminIcon :name="item.service ? 'link' : 'alert'" class="h-3.5 w-3.5 shrink-0" />
                <span class="min-w-0 truncate">
                  {{ item.service ? item.service.name : 'Aucune prestation associée' }}
                </span>
              </p>

              <div class="mt-auto flex items-center justify-end gap-0.5 pt-1">
                <button
                  type="button"
                  class="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark"
                  :aria-label="item.isActive ? 'Masquer' : 'Afficher'"
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
    </template>

    <!-- ── Catégories de la galerie ── -->
    <CategoryManager
      v-else
      :api="galleryCategories"
      item-label="catégorie"
      :with-description="false"
      in-use-hint="Si des coiffures y appartiennent encore, la suppression sera refusée."
    />

    <!-- ── Formulaire ── -->
    <BaseModal
      :open="modalOpen"
      :title="editing ? 'Modifier la coiffure' : 'Ajouter une coiffure'"
      :subtitle="editing ? editing.title : ''"
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
          <BaseField v-model="form.title" label="Titre" required placeholder="Locks twist" />
          <BaseField
            v-model="form.categoryId"
            label="Catégorie"
            required
            :options="(data?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))"
          />
        </div>

        <BaseField
          v-model="form.description"
          label="Description"
          textarea
          :rows="2"
          placeholder="Affichée sous la photo dans la vue agrandie."
        />

        <div class="rounded-xl border border-line bg-canvas p-3.5">
          <BaseField
            v-model="form.serviceId"
            label="Prestation à réserver"
            :options="serviceOptions"
            hint="Choisie ici, elle sera présélectionnée quand une cliente clique sur « Réserver cette coiffure »."
          />
        </div>

        <ImageField
          v-model="form.imageUrl"
          label="Photo"
          hint="Obligatoire. Format portrait recommandé (4/5)."
          @error="formError = $event"
        />

        <div class="grid gap-3 sm:grid-cols-2">
          <BaseToggle v-model="form.isActive" label="Visible sur le site" />
          <BaseToggle
            v-model="form.isFeatured"
            label="Mise en avant"
            hint="Apparaît sur la page d’accueil."
          />
        </div>

        <BaseField v-model="form.position" label="Position" type="number" :min="0" />
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
      title="Supprimer la coiffure"
      :message="`« ${confirmTarget?.title} » sera retirée du site et la photo ne sera plus affichée.`"
      @confirm="remove"
      @close="confirmTarget = null"
    />
  </div>
</template>
