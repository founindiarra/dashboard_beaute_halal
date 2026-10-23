<script setup>
import { ref } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import DataState from '@/components/ui/DataState.vue'
import { tarifs as api } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { formatDateTime } from '@/utils/format'

/**
 * Les étapes de soin de la prise de rendez-vous du site public : la
 * consultation capillaire (faire ou ignorer, avoir des locks ou non, comment
 * consulter) et les explications « Pourquoi une consultation ». Rien d’autre :
 * volumes, longueurs, prix et textes d’accueil se règlent dans « Tarifs du site ».
 */
const toasts = useToastStore()

const catalogue = ref(null)
const loading = ref(false)
const error = ref(null)
const saving = ref(false)
const dirty = ref(false)

const touch = () => {
  dirty.value = true
}

const BLOCS = [
  { key: 'avecLocks', label: 'Explication pour une cliente qui a déjà des locks' },
  { key: 'sansLocks', label: 'Explication pour une cliente qui n’en a pas encore' },
]

/** Un catalogue ancien peut ne pas avoir cette partie : le serveur la complète, on se protège quand même. */
const ensure = () => {
  const c = catalogue.value
  if (!c) return
  c.soins ??= {}
  c.soins.propose ??= {}
  c.soins.locks ??= {}
  c.soins.modes ??= {}
  for (const { key } of BLOCS) c.soins[key] ??= { title: '', lead: '', points: [], outro: '' }
}

const load = async () => {
  loading.value = true
  error.value = null
  try {
    catalogue.value = await api.get()
    ensure()
    dirty.value = false
  } catch (caught) {
    error.value = caught?.message || 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}
load()

const addPoint = (bloc) => {
  if (bloc.points.length >= 10) return toasts.error('10 points au maximum.')
  bloc.points.push({ title: '', text: '' })
  touch()
}
const removePoint = (bloc, i) => {
  bloc.points.splice(i, 1)
  touch()
}
const movePoint = (bloc, i, delta) => {
  const t = i + delta
  if (t < 0 || t >= bloc.points.length) return
  ;[bloc.points[i], bloc.points[t]] = [bloc.points[t], bloc.points[i]]
  touch()
}

const save = async () => {
  saving.value = true
  try {
    catalogue.value = await api.save(catalogue.value)
    ensure()
    dirty.value = false
    toasts.success('Étapes de soin enregistrées. Le site les utilise immédiatement.')
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
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="max-w-2xl text-sm text-muted">
        Les textes de l’étape « Consultation capillaire » de la prise de rendez-vous : les questions posées à la cliente et
        les explications. Volumes, longueurs, types et prix se règlent dans « Tarifs du site ».
      </p>
      <BaseButton :loading="saving" :disabled="!dirty" @click="save">Enregistrer</BaseButton>
    </div>

    <DataState :loading="loading" :error="error" :empty="!catalogue" loading-label="Chargement des étapes de soin…" @retry="load">
      <div v-if="catalogue" class="flex flex-col gap-5">
        <p v-if="catalogue.updatedAt" class="text-xs text-muted">
          Dernière modification : {{ formatDateTime(catalogue.updatedAt) }}
        </p>
        <p v-if="dirty" class="rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-xs text-warn" role="status">
          Modifications non enregistrées.
        </p>

        <section class="card flex flex-col gap-3 p-4">
          <header>
            <h2 class="font-display text-xl text-cocoa-dark">Faire ou ignorer la consultation</h2>
            <p class="text-xs text-muted">Première question posée à la cliente dans « Consultation capillaire ».</p>
          </header>
          <BaseField v-model="catalogue.soins.propose.title" label="Question" @update:model-value="touch" />
          <BaseField v-model="catalogue.soins.propose.text" label="Texte" textarea :rows="3" @update:model-value="touch" />
          <div class="grid gap-3 sm:grid-cols-2">
            <BaseField v-model="catalogue.soins.propose.faireLabel" label="Choix « faire » : titre" @update:model-value="touch" />
            <BaseField v-model="catalogue.soins.propose.faireHint" label="Choix « faire » : aide" @update:model-value="touch" />
            <BaseField v-model="catalogue.soins.propose.ignorerLabel" label="Choix « ignorer » : titre" @update:model-value="touch" />
            <BaseField v-model="catalogue.soins.propose.ignorerHint" label="Choix « ignorer » : aide" @update:model-value="touch" />
          </div>
          <BaseField v-model="catalogue.soins.propose.ignoreeMessage" label="Message quand elle ignore la consultation" textarea :rows="2" @update:model-value="touch" />
        </section>

        <section class="card flex flex-col gap-3 p-4">
          <header>
            <h2 class="font-display text-xl text-cocoa-dark">A-t-elle déjà des locks ?</h2>
          </header>
          <BaseField v-model="catalogue.soins.locks.title" label="Question" @update:model-value="touch" />
          <BaseField v-model="catalogue.soins.locks.text" label="Texte" textarea :rows="2" @update:model-value="touch" />
          <div class="grid gap-3 sm:grid-cols-2">
            <BaseField v-model="catalogue.soins.locks.ouiLabel" label="Choix « oui » : titre" @update:model-value="touch" />
            <BaseField v-model="catalogue.soins.locks.ouiHint" label="Choix « oui » : aide" @update:model-value="touch" />
            <BaseField v-model="catalogue.soins.locks.nonLabel" label="Choix « non » : titre" @update:model-value="touch" />
            <BaseField v-model="catalogue.soins.locks.nonHint" label="Choix « non » : aide" @update:model-value="touch" />
          </div>
        </section>

        <section class="card flex flex-col gap-3 p-4">
          <header>
            <h2 class="font-display text-xl text-cocoa-dark">Comment consulter</h2>
          </header>
          <BaseField v-model="catalogue.soins.modes.title" label="Question" @update:model-value="touch" />
          <div class="grid gap-3 sm:grid-cols-2">
            <BaseField v-model="catalogue.soins.modes.telephoneLabel" label="Téléphone : titre" @update:model-value="touch" />
            <BaseField v-model="catalogue.soins.modes.telephoneHint" label="Téléphone : aide" @update:model-value="touch" />
            <BaseField v-model="catalogue.soins.modes.whatsappLabel" label="WhatsApp : titre" @update:model-value="touch" />
            <BaseField v-model="catalogue.soins.modes.whatsappHint" label="WhatsApp : aide" @update:model-value="touch" />
            <BaseField v-model="catalogue.soins.modes.placeLabel" label="En salon : titre" @update:model-value="touch" />
            <BaseField v-model="catalogue.soins.modes.placeHint" label="En salon : aide" @update:model-value="touch" />
          </div>
          <BaseField v-model="catalogue.soins.modes.confirmation" label="Message de confirmation (téléphone ou WhatsApp)" textarea :rows="2" @update:model-value="touch" />
        </section>

        <section v-for="bloc in BLOCS" :key="bloc.key" class="card flex flex-col gap-3 p-4">
          <header class="flex items-center justify-between gap-3">
            <div>
              <h2 class="font-display text-xl text-cocoa-dark">Pourquoi une consultation</h2>
              <p class="text-xs text-muted">{{ bloc.label }}</p>
            </div>
            <BaseButton variant="secondary" @click="addPoint(catalogue.soins[bloc.key])">Ajouter un point</BaseButton>
          </header>
          <BaseField v-model="catalogue.soins[bloc.key].title" label="Titre" @update:model-value="touch" />
          <BaseField v-model="catalogue.soins[bloc.key].lead" label="Introduction" textarea :rows="2" @update:model-value="touch" />
          <p v-if="!catalogue.soins[bloc.key].points.length" class="text-sm text-muted">Aucun point.</p>
          <ul class="flex flex-col gap-3">
            <li v-for="(point, i) in catalogue.soins[bloc.key].points" :key="i" class="flex flex-col gap-3 rounded-xl border border-line p-3">
              <BaseField v-model="point.title" label="Titre du point" @update:model-value="touch" />
              <BaseField v-model="point.text" label="Texte" textarea :rows="3" @update:model-value="touch" />
              <div class="flex gap-2">
                <BaseButton variant="subtle" :disabled="i === 0" @click="movePoint(catalogue.soins[bloc.key], i, -1)">Monter</BaseButton>
                <BaseButton variant="subtle" :disabled="i === catalogue.soins[bloc.key].points.length - 1" @click="movePoint(catalogue.soins[bloc.key], i, 1)">Descendre</BaseButton>
                <BaseButton variant="danger" @click="removePoint(catalogue.soins[bloc.key], i)">Retirer</BaseButton>
              </div>
            </li>
          </ul>
          <BaseField v-model="catalogue.soins[bloc.key].outro" label="Conclusion (facultative)" textarea :rows="2" @update:model-value="touch" />
        </section>

        <div class="flex justify-end">
          <BaseButton :loading="saving" :disabled="!dirty" @click="save">Enregistrer</BaseButton>
        </div>
      </div>
    </DataState>
  </div>
</template>
