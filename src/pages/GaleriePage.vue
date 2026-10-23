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
import { COIFFURES_SALON, SITE_URL } from '@/data/coiffuresSalon'
import { tarifs as api } from '@/services'
import { useToastStore } from '@/stores/toasts'

/**
 * « Coiffures du site » : ce que montre la page « Nos coiffures » du site public
 * (photo, nom, texte, type de locks, mise en avant, ordre). Stockées dans le
 * catalogue du site (`galerie`). Liste vide = le site garde ses photos
 * intégrées ; dès qu'une coiffure est enregistrée ici, seule cette liste
 * est affichée.
 */
const toasts = useToastStore()

const catalogue = ref(null)
const loading = ref(false)
const error = ref(null)
const saving = ref(false)
const dirty = ref(false)

const load = async () => {
  loading.value = true
  error.value = null
  try {
    catalogue.value = await api.get()
    catalogue.value.galerie ??= []
    dirty.value = false
  } catch (caught) {
    error.value = caught?.message || 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}
load()

const touch = () => {
  dirty.value = true
}

const items = computed(() => catalogue.value?.galerie ?? [])
const typeOptions = computed(() => [
  { value: '', label: 'Non classée' },
  ...(catalogue.value?.lockTypes ?? []).map((t) => ({ value: t.id, label: t.name })),
])
const typeName = (id) => catalogue.value?.lockTypes?.find((t) => t.id === id)?.name ?? ''

/** Aperçu : chemin « /uploads/… » → origine de l'API ; adresse complète telle quelle. */
const preview = (value) => {
  if (!value) return ''
  if (/^(https?:|data:)/i.test(value)) return value
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`
}

/* ── Ajout / modification ── */
const open = ref(false)
const editingIndex = ref(-1)
const form = ref({})
const formError = ref('')

const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const openNew = () => {
  editingIndex.value = -1
  formError.value = ''
  form.value = { id: newId(), title: '', description: '', image: '', typeId: '', featured: false }
  open.value = true
}
const openEdit = (index) => {
  editingIndex.value = index
  formError.value = ''
  form.value = { ...items.value[index], typeId: items.value[index].typeId ?? '' }
  open.value = true
}
const apply = () => {
  formError.value = ''
  if (form.value.title.trim().length < 2) {
    formError.value = 'Le nom doit faire au moins 2 caractères.'
    return
  }
  if (!form.value.image) {
    formError.value = 'Ajoutez une photo.'
    return
  }
  const row = { ...form.value, title: form.value.title.trim(), description: form.value.description.trim(), typeId: form.value.typeId || null }
  if (editingIndex.value >= 0) catalogue.value.galerie[editingIndex.value] = row
  else catalogue.value.galerie.push(row)
  open.value = false
  touch()
}

const move = (index, delta) => {
  const list = catalogue.value.galerie
  const target = index + delta
  if (target < 0 || target >= list.length) return
  ;[list[index], list[target]] = [list[target], list[index]]
  touch()
}

const removeIndex = ref(-1)
const confirmRemove = () => {
  catalogue.value.galerie.splice(removeIndex.value, 1)
  removeIndex.value = -1
  touch()
}

/** Pré-remplit la liste avec les photos du salon intégrées au site. */
const importSalon = () => {
  catalogue.value.galerie = COIFFURES_SALON.map((c, i) => ({
    id: `s${i + 1}`,
    title: c.title,
    description: c.description,
    image: `${SITE_URL}/images/coiffures/${c.slug}.webp`,
    typeId: c.typeId,
    featured: c.featured,
  }))
  touch()
}

const save = async () => {
  saving.value = true
  try {
    catalogue.value = await api.save(catalogue.value)
    catalogue.value.galerie ??= []
    dirty.value = false
    toasts.success('Coiffures enregistrées. Le site les affiche immédiatement.')
  } catch (caught) {
    const detail = caught?.details?.[0]?.message
    toasts.error(detail ? `${caught.message} (${detail})` : caught?.message || 'Enregistrement impossible.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Coiffures du site"
      subtitle="Les photos et textes de la page « Nos coiffures » du site public."
    >
      <template #actions>
        <BaseButton variant="secondary" :disabled="!catalogue" @click="openNew">Ajouter une coiffure</BaseButton>
        <BaseButton :loading="saving" :disabled="!dirty" @click="save">Enregistrer</BaseButton>
      </template>
    </PageHeader>

    <DataState :loading="loading" :error="error" :empty="!catalogue" loading-label="Chargement des coiffures…" @retry="load">
      <div v-if="catalogue" class="flex flex-col gap-4">
        <p v-if="dirty" class="rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-xs text-warn" role="status">
          Modifications non enregistrées.
        </p>

        <div v-if="!items.length" class="card flex flex-col items-start gap-3 p-4">
          <p class="text-sm text-cocoa">
            Aucune coiffure enregistrée ici : le site affiche actuellement ses photos du salon intégrées. Dès que vous
            enregistrez une coiffure, seule votre liste est affichée.
          </p>
          <BaseButton variant="secondary" @click="importSalon">
            Reprendre les {{ COIFFURES_SALON.length }} photos du salon pour les modifier
          </BaseButton>
        </div>

        <ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <li v-for="(item, i) in items" :key="item.id" class="card flex flex-col overflow-hidden">
            <div class="aspect-[4/3] w-full overflow-hidden bg-ivory">
              <img v-if="item.image" :src="preview(item.image)" alt="" class="h-full w-full object-cover" loading="lazy" />
              <div v-else class="grid h-full w-full place-items-center text-sand-dark">
                <AdminIcon name="image" class="h-8 w-8" />
              </div>
            </div>
            <div class="flex flex-1 flex-col gap-1 p-3">
              <p class="text-sm font-medium text-cocoa-dark">{{ item.title }}</p>
              <p class="text-xs text-muted">
                {{ typeName(item.typeId) || 'Non classée' }}<span v-if="item.featured"> · Mise en avant</span>
              </p>
              <p v-if="item.description" class="line-clamp-2 text-xs text-cocoa">{{ item.description }}</p>
            </div>
            <div class="flex flex-wrap gap-2 border-t border-line p-3">
              <BaseButton size="sm" variant="secondary" @click="openEdit(i)">Modifier</BaseButton>
              <BaseButton size="sm" variant="subtle" :disabled="i === 0" @click="move(i, -1)">Monter</BaseButton>
              <BaseButton size="sm" variant="subtle" :disabled="i === items.length - 1" @click="move(i, 1)">Descendre</BaseButton>
              <BaseButton size="sm" variant="danger" @click="removeIndex = i">Retirer</BaseButton>
            </div>
          </li>
        </ul>

        <div v-if="items.length" class="flex justify-end">
          <BaseButton :loading="saving" :disabled="!dirty" @click="save">Enregistrer</BaseButton>
        </div>
      </div>
    </DataState>

    <BaseModal :open="open" :title="editingIndex >= 0 ? 'Modifier la coiffure' : 'Ajouter une coiffure'" @close="open = false">
      <div class="flex flex-col gap-4">
        <p v-if="formError" class="rounded-lg border border-danger/25 bg-danger-bg px-3.5 py-2.5 text-sm text-danger" role="alert">
          {{ formError }}
        </p>
        <ImageField v-model="form.image" label="Photo" @error="formError = $event" />
        <BaseField v-model="form.title" label="Nom de la coiffure" required />
        <BaseField v-model="form.description" label="Explication" textarea :rows="3" hint="Affichée avec la photo, quand on l’ouvre en grand." />
        <BaseField v-model="form.typeId" label="Type de locks" :options="typeOptions" />
        <BaseToggle v-model="form.featured" label="Mettre en avant" hint="Affichée aussi sur l’accueil." />
      </div>
      <template #footer>
        <BaseButton variant="ghost" @click="open = false">Annuler</BaseButton>
        <BaseButton @click="apply">{{ editingIndex >= 0 ? 'Valider' : 'Ajouter' }}</BaseButton>
      </template>
    </BaseModal>

    <ConfirmDialog
      :open="removeIndex >= 0"
      title="Retirer cette coiffure"
      confirm-label="Retirer"
      message="La coiffure n’apparaîtra plus sur le site après l’enregistrement. Vous pouvez annuler en rechargeant la page avant d’enregistrer."
      @confirm="confirmRemove"
      @close="removeIndex = -1"
    />
  </div>
</template>
