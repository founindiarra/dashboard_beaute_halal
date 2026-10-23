<script setup>
import { computed, ref } from 'vue'

import AdminIcon from './AdminIcon.vue'
import BaseButton from './BaseButton.vue'
import { uploads } from '@/services'

/** Champ vidéo : dépôt d'un MP4 / WebM (POST /admin/uploads/video) ou adresse directe. Vide = vidéo intégrée au site. */
const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: 'Vidéo' },
  hint: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'error'])

const fileInput = ref(null)
const sending = ref(false)

const preview = computed(() => {
  const value = props.modelValue
  if (!value) return null
  if (/^(https?:|data:)/i.test(value)) return value
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`
})

const onFile = async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  sending.value = true
  try {
    const result = await uploads.sendVideo(file)
    emit('update:modelValue', result.path)
  } catch (error) {
    emit('error', error?.message || 'Le dépôt de la vidéo a échoué.')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="flex flex-col">
    <span class="label">{{ label }}</span>
    <div class="flex items-start gap-3">
      <div class="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-ivory">
        <video v-if="preview" :src="preview" muted playsinline preload="metadata" class="h-full w-full object-cover" />
        <AdminIcon v-else name="image" class="h-6 w-6 text-sand-dark" />
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <div class="flex flex-wrap gap-2">
          <BaseButton size="sm" variant="secondary" :loading="sending" @click="fileInput?.click()">
            <AdminIcon v-if="!sending" name="upload" class="h-3.5 w-3.5" />
            {{ sending ? 'Envoi…' : 'Choisir une vidéo' }}
          </BaseButton>
          <BaseButton v-if="modelValue" size="sm" variant="ghost" @click="$emit('update:modelValue', '')">Retirer</BaseButton>
        </div>
        <input
          class="input text-xs"
          type="text"
          :value="modelValue"
          placeholder="/uploads/… ou https://…"
          aria-label="Adresse de la vidéo"
          @input="$emit('update:modelValue', $event.target.value)"
        />
      </div>
    </div>
    <p class="mt-1.5 text-xs text-muted">{{ hint || 'MP4 ou WebM — 40 Mo maximum.' }}</p>
    <input ref="fileInput" type="file" accept="video/mp4,video/webm" class="hidden" @change="onFile" />
  </div>
</template>
