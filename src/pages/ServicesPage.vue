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
import { COIFFURES_SALON, SITE_URL } from '@/data/coiffuresSalon'
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
  const categories = types.filter((t) => t.categoryId).map((t) => ({ id: t.categoryId, slug: t.id, name: t.name }))
  const ids = new Set(categories.map((c) => c.id))
  // La prestation technique des demandes du site n'est pas une coiffure : on ne l'affiche pas.
  return { items: items.filter((i) => ids.has(i.category.id)), categories }
}

const { data, loading, error, reload } = useResource(load, { items: [], categories: [] })

const search = ref('')
const categoryFilter = ref('')

/** Pastilles de filtre : un type = un clic, avec le nombre de coiffures. */
const typeChips = computed(() => [
  { value: '', label: 'Toutes', count: data.value?.items?.length ?? 0 },
  ...(data.value?.categories ?? []).map((c) => ({
    value: String(c.id),
    label: c.name,
    count: (data.value?.items ?? []).filter((i) => i.category.id === c.id).length,
  })),
])

/** Ce que le site affiche : coiffures actives qui ont une photo. */
const visibleOnSite = computed(() => (data.value?.items ?? []).filter((i) => i.isActive && i.imageUrl).length)
const withoutPhoto = computed(() => (data.value?.items ?? []).filter((i) => i.isActive && !i.imageUrl).length)

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
    // Seules les photos téléversées sont ramenées à leur chemin ; une adresse extérieure est gardée telle quelle.
    imageUrl: item.imageUrl ? String(item.imageUrl).replace(/^https?:\/\/[^/]+(\/uploads\/)/, '$1') : '',
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

/* ── Photos et informations réelles du salon ── */
const norm = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const realNames = new Set(COIFFURES_SALON.map((c) => norm(c.title)))
/** Les coiffures réelles du salon (celles du site) pas encore enregistrées ici. */
const missingReal = computed(() => {
  const have = new Set((data.value?.items ?? []).map((i) => norm(i.name)))
  return COIFFURES_SALON.filter((c) => !have.has(norm(c.title)))
})
/** Coiffures actives qui ne sont pas celles du salon (photos d'exemple, anciennes entrées). */
const otherActive = computed(() => (data.value?.items ?? []).filter((i) => i.isActive && !realNames.has(norm(i.name))))

const importOpen = ref(false)
const hideOthers = ref(true)
const importing = ref(false)
const importDone = ref(0)
const importSalon = async () => {
  const bySlug = new Map((data.value?.categories ?? []).map((c) => [c.slug, c.id]))
  const toHide = hideOthers.value ? [...otherActive.value] : []
  importing.value = true
  importDone.value = 0
  let failed = 0
  try {
    for (const c of missingReal.value) {
      const categoryId = bySlug.get(c.typeId)
      if (!categoryId) {
        failed += 1
        continue
      }
      try {
        await api.create({
          categoryId,
          name: c.title,
          description: c.description,
          imageUrl: `${SITE_URL}/images/coiffures/${c.slug}.webp`,
          isFeatured: Boolean(c.featured),
          isActive: true,
          position: COIFFURES_SALON.indexOf(c) + 1,
        })
        importDone.value += 1
      } catch {
        failed += 1
      }
    }
    for (const item of toHide) {
      try {
        await api.update(item.id, { isActive: false })
      } catch {
        failed += 1
      }
    }
    importOpen.value = false
    await reload()
    if (failed) toasts.error(`${importDone.value} coiffures ajoutées, ${failed} opération(s) en échec : relancez pour terminer.`)
    else toasts.success(`${importDone.value} coiffures du salon ajoutées${toHide.length ? `, ${toHide.length} autres masquées` : ''}.`)
  } finally {
    importing.value = false
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
      subtitle="Tout ce que montre la page « Nos coiffures » du site : photo, nom, type de locks, description, mise en avant. Ajoutez ou modifiez ici ; le prix se fixe à la confirmation du rendez-vous."
    >
      <template #actions>
        <BaseButton size="sm" @click="openCreate">
          <AdminIcon name="plus" class="h-3.5 w-3.5" />
          Ajouter une coiffure
        </BaseButton>
      </template>
    </PageHeader>

    <!-- Photos et informations réelles du salon -->
    <section
      v-if="!loading && !error && data && missingReal.length"
      class="card flex flex-col gap-3 border-gold/40 bg-gold/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="max-w-2xl">
        <h2 class="font-display text-lg text-cocoa-dark">
          Les vraies photos du salon ne sont pas toutes ici ({{ COIFFURES_SALON.length - missingReal.length }} / {{ COIFFURES_SALON.length }})
        </h2>
        <p class="mt-1 text-sm text-muted">
          Le site public montre {{ COIFFURES_SALON.length }} réalisations réelles de Beauté Halal, avec leur nom et leur description.
          Mettez-les dans cette page en un clic : vous pourrez ensuite tout modifier, masquer ou compléter.
        </p>
      </div>
      <BaseButton @click="importOpen = true">Mettre les photos réelles du salon</BaseButton>
    </section>

    <!-- Résumé : ce que le site affiche -->
    <section v-if="data?.items?.length" class="grid grid-cols-3 gap-3">
      <div class="card px-4 py-3">
        <p class="text-xs text-muted">Coiffures</p>
        <p class="font-display text-2xl text-cocoa-dark">{{ data.items.length }}</p>
      </div>
      <div class="card px-4 py-3">
        <p class="text-xs text-muted">Visibles sur le site</p>
        <p class="font-display text-2xl text-cocoa-dark">{{ visibleOnSite }}</p>
      </div>
      <div class="card px-4 py-3" :class="withoutPhoto ? 'border-warn/40' : ''">
        <p class="text-xs text-muted">Actives sans photo</p>
        <p class="font-display text-2xl" :class="withoutPhoto ? 'text-warn' : 'text-cocoa-dark'">{{ withoutPhoto }}</p>
      </div>
    </section>

    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div class="flex flex-wrap gap-2" role="group" aria-label="Filtrer par type de locks">
        <button
          v-for="chip in typeChips"
          :key="chip.value"
          type="button"
          class="rounded-full border px-3.5 py-1.5 text-sm transition-colors"
          :class="
            categoryFilter === chip.value
              ? 'border-cocoa-dark bg-cocoa-dark text-white'
              : 'border-line bg-white text-cocoa hover:border-gold hover:text-gold'
          "
          :aria-pressed="categoryFilter === chip.value"
          @click="categoryFilter = chip.value"
        >
          {{ chip.label }}
          <span class="ml-1 text-xs opacity-70">{{ chip.count }}</span>
        </button>
      </div>
      <div class="lg:w-72"><SearchInput v-model="search" placeholder="Nom, description…" /></div>
    </div>

    <DataState
      :loading="loading"
      :error="error"
      :empty="!filtered.length"
      loading-label="Chargement des coiffures…"
      :empty-label="search || categoryFilter ? 'Aucune coiffure ne correspond.' : 'Aucune coiffure enregistrée.'"
      empty-hint="Ajoutez une coiffure avec une photo : elle apparaît sur la page « Nos coiffures » du site."
      @retry="reload"
    >
      <ul class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        <li
          v-for="item in filtered"
          :key="item.id"
          class="card group flex flex-col overflow-hidden"
          :class="item.isActive ? '' : 'opacity-70'"
        >
          <button type="button" class="relative block aspect-[4/5] w-full overflow-hidden bg-ivory text-left" @click="openEdit(item)">
            <img
              v-if="item.imageUrl"
              :src="item.imageUrl"
              :alt="item.name"
              loading="lazy"
              class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
            <span v-else class="grid h-full w-full place-items-center text-sand-dark">
              <span class="flex flex-col items-center gap-1 text-xs">
                <AdminIcon name="image" class="h-6 w-6" />
                Pas de photo
              </span>
            </span>
            <span class="absolute left-2 top-2 flex flex-wrap gap-1">
              <StatusBadge v-if="!item.isActive" label="Masquée" tone="neutral" />
              <StatusBadge v-if="item.isFeatured" label="En avant" tone="info" />
            </span>
          </button>
          <div class="flex flex-1 flex-col gap-1 p-3">
            <p class="text-[0.7rem] uppercase tracking-[0.14em] text-gold">{{ item.category.name }}</p>
            <h3 class="font-display text-[1.02rem] leading-snug text-cocoa-dark">{{ item.name }}</h3>
            <p class="line-clamp-2 text-xs text-muted">{{ item.description || 'Pas de description.' }}</p>
          </div>
          <div class="flex items-center justify-between border-t border-line px-2 py-1.5">
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark"
              :title="item.isActive ? 'Masquer du site' : 'Afficher sur le site'"
              @click="toggleActive(item)"
            >
              <AdminIcon :name="item.isActive ? 'eye' : 'eye-off'" class="h-4 w-4" />
              {{ item.isActive ? 'Visible' : 'Masquée' }}
            </button>
            <div class="flex items-center gap-0.5">
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
          </div>
        </li>
      </ul>
    </DataState>

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

    <BaseModal :open="importOpen" title="Mettre les photos réelles du salon" @close="importOpen = false">
      <div class="flex flex-col gap-4 text-sm text-cocoa">
        <p>
          <strong>{{ missingReal.length }}</strong> coiffure(s) réelle(s) du salon vont être ajoutées, avec leur photo, leur nom,
          leur type de locks et leur description. Celles déjà présentes ne sont pas dupliquées.
        </p>
        <BaseToggle
          v-if="otherActive.length"
          v-model="hideOthers"
          :label="`Masquer les ${otherActive.length} autres coiffures actuellement visibles sur le site`"
          hint="Ce sont les photos qui ne sont pas celles du salon. Elles ne sont pas supprimées : vous pouvez les réafficher une à une."
        />
      </div>
      <template #footer>
        <BaseButton variant="secondary" :disabled="importing" @click="importOpen = false">Annuler</BaseButton>
        <BaseButton :loading="importing" @click="importSalon">
          {{ importing ? `${importDone} / ${missingReal.length}…` : 'Mettre les photos du salon' }}
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
