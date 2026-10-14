<script setup>
import { ref, watch } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useResource } from '@/composables/useResource'
import { schedule } from '@/services'
import { useToastStore } from '@/stores/toasts'

/**
 * Horaires d'ouverture. L'API renvoie les 7 jours déjà triés lundi → dimanche
 * et attend le tableau complet en écriture (PUT /admin/opening-hours).
 * On travaille donc sur une copie locale, enregistrée en une seule fois.
 */
const toasts = useToastStore()
const { data: hours, loading, error, reload } = useResource(schedule.hours, [])

const draft = ref([])
const busy = ref(false)
const formError = ref('')

watch(hours, (value) => {
  draft.value = (value ?? []).map((day) => ({
    weekday: day.weekday,
    day: day.day,
    isClosed: day.isClosed,
    opensAt: day.opensAt || '09:00',
    closesAt: day.closesAt || '18:00',
  }))
})

const save = async () => {
  formError.value = ''

  const invalid = draft.value.find(
    (day) => !day.isClosed && (!day.opensAt || !day.closesAt || day.closesAt <= day.opensAt),
  )
  if (invalid) {
    formError.value = `${invalid.day} : l’heure de fermeture doit être postérieure à l’ouverture.`
    return
  }

  busy.value = true
  try {
    await schedule.saveHours(
      draft.value.map((day) => ({
        weekday: day.weekday,
        isClosed: day.isClosed,
        opensAt: day.isClosed ? null : day.opensAt,
        closesAt: day.isClosed ? null : day.closesAt,
      })),
    )
    await reload()
    toasts.success('Horaires enregistrés.')
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
      title="Horaires d’ouverture"
      subtitle="Ils s’affichent sur le site et déterminent les jours réservables."
    />

    <DataState
      :loading="loading"
      :error="error"
      loading-label="Chargement des horaires…"
      @retry="reload"
    >
      <div class="card overflow-hidden">
        <p
          v-if="formError"
          class="border-b border-danger/25 bg-danger-bg px-4 py-2.5 text-sm text-danger"
          role="alert"
        >
          {{ formError }}
        </p>

        <ul class="divide-y divide-line-soft">
          <li
            v-for="day in draft"
            :key="day.weekday"
            class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6"
          >
            <span class="w-28 shrink-0 font-medium text-cocoa-dark">{{ day.day }}</span>

            <div class="sm:w-48">
              <BaseToggle
                :model-value="!day.isClosed"
                :label="day.isClosed ? 'Fermé' : 'Ouvert'"
                @update:model-value="day.isClosed = !$event"
              />
            </div>

            <div v-if="!day.isClosed" class="flex items-center gap-2">
              <label class="sr-only" :for="`open-${day.weekday}`">
                Ouverture — {{ day.day }}
              </label>
              <input
                :id="`open-${day.weekday}`"
                v-model="day.opensAt"
                type="time"
                class="input w-32"
              />
              <span class="text-muted">→</span>
              <label class="sr-only" :for="`close-${day.weekday}`">
                Fermeture — {{ day.day }}
              </label>
              <input
                :id="`close-${day.weekday}`"
                v-model="day.closesAt"
                type="time"
                class="input w-32"
              />
            </div>

            <span v-else class="text-sm text-muted">Le salon n’ouvre pas ce jour-là.</span>
          </li>
        </ul>

        <div class="flex justify-end border-t border-line bg-canvas px-4 py-3">
          <BaseButton :loading="busy" @click="save">Enregistrer les horaires</BaseButton>
        </div>
      </div>

      <p class="mt-3 text-xs text-muted">
        Un jour marqué fermé disparaît du calendrier de réservation du site public.
      </p>
    </DataState>
  </div>
</template>
