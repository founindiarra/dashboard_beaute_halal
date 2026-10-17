<script setup>
import { ref } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import DataState from '@/components/ui/DataState.vue'
import ImageField from '@/components/ui/ImageField.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useResource } from '@/composables/useResource'
import { lockTypes as api } from '@/services'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toasts'
import { formatFcfa } from '@/utils/format'

/**
 * Les catégories de Beauté Halal sont les trois TYPES de locks : Locks
 * traditionnels, Small locks et Micro-locks. La liste est fixe — on n'en crée
 * ni n'en supprime — mais tout ce que le site affiche d'un type se règle ici :
 * nom, accroche, description, taille, rythme de resserrage et photo.
 *
 * Les prix se règlent dans « Tarifs du site ».
 */
const auth = useAuthStore()
const toasts = useToastStore()
const { data: types, loading, error, reload } = useResource(api.list, [])

const open = ref(false)
const editing = ref(null)
const busy = ref(false)
const formError = ref('')
const form = ref({})

const openEdit = (type) => {
  editing.value = type
  formError.value = ''
  form.value = {
    name: type.name,
    tagline: type.tagline,
    description: type.description,
    size: type.size,
    rhythm: type.rhythm,
    // Chemin d'origine (« /uploads/… »), pas l'adresse complète : la valeur reste
    // valable si le domaine de l'API change.
    image: type.image ?? '',
  }
  open.value = true
}

const save = async () => {
  formError.value = ''
  if (!form.value.name || form.value.name.trim().length < 2) {
    formError.value = 'Le nom doit faire au moins 2 caractères.'
    return
  }
  busy.value = true
  try {
    await api.update(editing.value.id, {
      name: form.value.name.trim(),
      tagline: form.value.tagline?.trim() ?? '',
      description: form.value.description?.trim() ?? '',
      size: form.value.size?.trim() ?? '',
      rhythm: form.value.rhythm?.trim() ?? '',
      image: form.value.image || null,
    })
    open.value = false
    await reload()
    toasts.success('Catégorie enregistrée. Le site la reprend dans les minutes qui suivent.')
  } catch (caught) {
    formError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Catégories"
      subtitle="Trois catégories, qui sont les types de locks de Beauté Halal. Modifiez leurs informations et leur photo."
    >
      <template #actions>
        <BaseButton v-if="auth.can('tarifs')" size="sm" variant="secondary" :to="{ name: 'tarifs' }">
          <AdminIcon name="cash" class="h-3.5 w-3.5" />
          Modifier les prix
        </BaseButton>
      </template>
    </PageHeader>

    <DataState
      :loading="loading"
      :error="error"
      :empty="!types.length"
      loading-label="Chargement des catégories…"
      empty-label="Catalogue indisponible."
      @retry="reload"
    >
      <div class="grid gap-4 md:grid-cols-3">
        <article v-for="type in types" :key="type.id" class="card flex flex-col overflow-hidden">
          <div class="grid aspect-[4/3] place-items-center bg-ivory">
            <img v-if="type.imageUrl" :src="type.imageUrl" :alt="type.name" class="h-full w-full object-cover" />
            <span v-else class="flex flex-col items-center gap-1 text-xs text-muted">
              <AdminIcon name="image" class="h-6 w-6 text-sand-dark" />
              Photo d’ambiance du site
            </span>
          </div>
          <div class="flex flex-1 flex-col gap-3 p-5">
            <header>
              <h2 class="text-[1.05rem]">{{ type.name }}</h2>
              <p v-if="type.tagline" class="text-xs uppercase tracking-[0.14em] text-gold">
                {{ type.tagline }}
              </p>
            </header>
            <p v-if="type.description" class="text-sm text-muted">{{ type.description }}</p>
            <dl class="mt-auto grid gap-1.5 border-t border-line-soft pt-3 text-[0.82rem]">
              <div v-if="type.size" class="flex justify-between gap-3">
                <dt class="text-muted">Taille</dt>
                <dd class="text-cocoa-dark">{{ type.size }}</dd>
              </div>
              <div v-if="type.rhythm" class="flex justify-between gap-3">
                <dt class="text-muted">Rythme</dt>
                <dd class="text-right text-cocoa-dark">{{ type.rhythm }}</dd>
              </div>
              <div v-if="type.fromPrice" class="flex justify-between gap-3">
                <dt class="text-muted">Dès</dt>
                <dd class="font-medium text-cocoa-dark">{{ formatFcfa(type.fromPrice) }}</dd>
              </div>
            </dl>
            <BaseButton size="sm" variant="secondary" @click="openEdit(type)">
              <AdminIcon name="edit" class="h-3.5 w-3.5" />
              Modifier
            </BaseButton>
          </div>
        </article>
      </div>
    </DataState>

    <BaseModal
      :open="open"
      :title="`Modifier ${editing?.name ?? ''}`"
      subtitle="Ces informations sont affichées sur le site."
      @close="open = false"
    >
      <div class="flex flex-col gap-4">
        <p
          v-if="formError"
          class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ formError }}
        </p>

        <ImageField
          v-model="form.image"
          label="Photo du type"
          hint="Elle illustre ce type sur la page « Nos services »."
          @error="formError = $event"
        />

        <div class="grid gap-4 sm:grid-cols-2">
          <BaseField v-model="form.name" label="Nom" required />
          <BaseField v-model="form.tagline" label="Accroche" placeholder="Le format premium" />
          <BaseField v-model="form.size" label="Taille des locks" placeholder="0,4 cm à 0,8 cm" />
          <BaseField
            v-model="form.rhythm"
            label="Rythme de resserrage"
            placeholder="Resserrage tous les 2 mois"
          />
        </div>

        <BaseField v-model="form.description" label="Description" textarea :rows="3" />
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="busy" @click="open = false">Annuler</BaseButton>
        <BaseButton :loading="busy" @click="save">Enregistrer</BaseButton>
      </template>
    </BaseModal>
  </div>
</template>
