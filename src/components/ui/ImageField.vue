<script setup>
import { computed, ref } from 'vue'

import AdminIcon from './AdminIcon.vue'
import BaseButton from './BaseButton.vue'
import { uploads } from '@/services'

/**
 * Champ image : dépôt d'un fichier via POST /admin/uploads, ou saisie
 * directe d'une adresse (les photos peuvent aussi être hébergées ailleurs).
 *
 * La valeur conservée est le CHEMIN renvoyé par l'API (« /uploads/xxx.jpg »),
 * jamais l'URL absolue : c'est ce que les tables attendent dans `image_url`,
 * et cela reste valable si le domaine de l'API change.
 */
const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: 'Image' },
  hint: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'error'])

const fileInput = ref(null)
const sending = ref(false)

/** Aperçu : on préfixe les chemins relatifs par l'origine de l'API. */
const preview = computed(() => {
  const value = props.modelValue
  if (!value) return null
  if (/^(https?:|data:)/i.test(value)) return value
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`
})

const pick = () => fileInput.value?.click()

const onFile = async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  sending.value = true
  try {
    const result = await uploads.send(file)
    emit('update:modelValue', result.path)
  } catch (error) {
    emit('error', error?.message || 'Le dépôt de l’image a échoué.')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="flex flex-col">
    <span class="label">{{ label }}</span>

    <div class="flex items-start gap-3">
      <div
        class="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-ivory"
      >
        <img v-if="preview" :src="preview" alt="" class="h-full w-full object-cover" />
        <AdminIcon v-else name="image" class="h-6 w-6 text-sand-dark" />
      </div>

      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <div class="flex flex-wrap gap-2">
          <BaseButton size="sm" variant="secondary" :loading="sending" @click="pick">
            <AdminIcon v-if="!sending" name="upload" class="h-3.5 w-3.5" />
            {{ sending ? 'Envoi…' : 'Choisir une image' }}
          </BaseButton>
          <BaseButton
            v-if="modelValue"
            size="sm"
            variant="ghost"
            @click="$emit('update:modelValue', '')"
          >
            Retirer
          </BaseButton>
        </div>

        <input
          class="input text-xs"
          type="text"
          :value="modelValue"
          placeholder="/uploads/… ou https://…"
          aria-label="Adresse de l’image"
          @input="$emit('update:modelValue', $event.target.value)"
        />
      </div>
    </div>

    <p class="mt-1.5 text-xs text-muted">
      {{ hint || 'JPEG, PNG, WebP ou AVIF — 5 Mo maximum.' }}
    </p>

    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFile" />
  </div>
</template>
