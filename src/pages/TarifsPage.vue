<script setup>
import { computed, ref } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { tarifs as api } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { formatDateTime } from '@/utils/format'

/**
 * Les tarifs que le site affiche ET que le serveur recalcule à chaque
 * demande. Une seule source : modifier un prix ici change le montant indicatif
 * proposé aux clientes, sans toucher au code.
 *
 * Les montants sont en FCFA, entiers. Chaque ligne de prix porte deux
 * colonnes : « complet » (racines + tiges) et « racines seules ».
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

const volumes = computed(() => catalogue.value?.volumes ?? [])

/** Un champ numérique vide vaut 0 : le serveur refuse tout autre type que l'entier. */
const toInt = (value) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? n : 0
}

const setPrice = (type, volume, index, value) => {
  type.prices[volume.id][index] = Math.max(0, toInt(value))
  touch()
}
const setAmount = (item, value) => {
  item.amount = toInt(value)
  touch()
}
const setPct = (item, value) => {
  item.pct = Math.max(0, Number(value) || 0)
  touch()
}
const setRepairFrom = (type, value) => {
  type.repair.from = Math.max(0, toInt(value))
  touch()
}

const save = async () => {
  saving.value = true
  try {
    catalogue.value = await api.save(catalogue.value)
    dirty.value = false
    toasts.success('Tarifs enregistrés. Le site les utilise immédiatement.')
  } catch (caught) {
    const detail = caught?.details?.[0]?.message
    toasts.error(detail ? `${caught.message} (${detail})` : caught?.message || 'Enregistrement impossible.')
  } finally {
    saving.value = false
  }
}

/* ── Remise à zéro ── */
const resetOpen = ref(false)
const resetting = ref(false)
const reset = async () => {
  resetting.value = true
  try {
    catalogue.value = await api.reset()
    dirty.value = false
    resetOpen.value = false
    toasts.success('Grille d’origine rétablie.')
  } catch (caught) {
    toasts.error(caught?.message || 'Rétablissement impossible.')
    resetOpen.value = false
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Tarifs du site"
      subtitle="Les prix indicatifs proposés aux clientes pour un resserrage. Le tarif final reste annoncé par le salon."
    >
      <template #actions>
        <BaseButton variant="secondary" :disabled="!catalogue || saving" @click="resetOpen = true">
          Rétablir la grille d’origine
        </BaseButton>
        <BaseButton :loading="saving" :disabled="!dirty" @click="save">Enregistrer</BaseButton>
      </template>
    </PageHeader>

    <DataState :loading="loading" :error="error" :empty="!catalogue" loading-label="Chargement des tarifs…" @retry="load">
      <div v-if="catalogue" class="flex flex-col gap-5">
        <p v-if="catalogue.updatedAt" class="text-xs text-muted">
          Dernière modification : {{ formatDateTime(catalogue.updatedAt) }}
        </p>
        <p v-if="dirty" class="rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-xs text-warn" role="status">
          Modifications non enregistrées.
        </p>

        <section v-for="type in catalogue.lockTypes" :key="type.id" class="card flex flex-col gap-5 p-4">
          <header>
            <h2 class="font-display text-xl text-cocoa-dark">{{ type.name }}</h2>
            <p class="text-xs text-muted">{{ type.size }} · {{ type.rhythm }}</p>
          </header>

          <div>
            <h3 class="mb-2 text-xs uppercase tracking-[0.1em] text-muted">Prix par volume (FCFA)</h3>
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th>Volume</th>
                    <th>Resserrage complet</th>
                    <th>Racines seules</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="volume in volumes" :key="volume.id">
                    <td class="whitespace-nowrap">
                      <span class="text-cocoa-dark">{{ volume.id }}</span>
                      <span class="ml-1.5 text-xs text-muted">{{ volume.label }}</span>
                    </td>
                    <td v-for="index in [0, 1]" :key="index">
                      <input
                        class="input h-9 w-32"
                        type="number"
                        min="0"
                        step="500"
                        inputmode="numeric"
                        :aria-label="`${type.name}, volume ${volume.id}, ${index === 0 ? 'complet' : 'racines seules'}`"
                        :value="type.prices[volume.id]?.[index] ?? 0"
                        @input="setPrice(type, volume, index, $event.target.value)"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 class="mb-2 text-xs uppercase tracking-[0.1em] text-muted">
                Ajustement selon le délai (FCFA, + ou −)
              </h3>
              <ul class="flex flex-col gap-2">
                <li v-for="delai in type.delais" :key="delai.id" class="flex items-center justify-between gap-3">
                  <span class="min-w-0 text-sm text-cocoa">
                    {{ delai.label }}
                    <span v-if="delai.detail" class="text-xs text-muted">· {{ delai.detail }}</span>
                  </span>
                  <input
                    class="input h-9 w-28 shrink-0"
                    type="number"
                    step="500"
                    inputmode="numeric"
                    :aria-label="`${type.name}, ${delai.label}`"
                    :value="delai.amount"
                    @input="setAmount(delai, $event.target.value)"
                  />
                </li>
              </ul>
            </div>

            <div>
              <h3 class="mb-2 text-xs uppercase tracking-[0.1em] text-muted">
                Majoration selon l’état (% du tarif)
              </h3>
              <ul class="flex flex-col gap-2">
                <li v-for="etat in type.etats" :key="etat.id" class="flex items-center justify-between gap-3">
                  <span class="min-w-0 text-sm text-cocoa">{{ etat.label }}</span>
                  <input
                    class="input h-9 w-28 shrink-0"
                    type="number"
                    min="0"
                    max="300"
                    step="5"
                    inputmode="decimal"
                    :aria-label="`${type.name}, ${etat.label}`"
                    :value="etat.pct"
                    @input="setPct(etat, $event.target.value)"
                  />
                </li>
              </ul>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="flex flex-col">
              <label class="label" :for="`repair-${type.id}`">Réparation : à partir de (FCFA)</label>
              <input
                :id="`repair-${type.id}`"
                class="input"
                type="number"
                min="0"
                step="1000"
                inputmode="numeric"
                :value="type.repair.from"
                @input="setRepairFrom(type, $event.target.value)"
              />
            </div>
            <BaseField
              v-model="type.repair.text"
              label="Réparation : texte affiché"
              @update:model-value="touch"
            />
          </div>
        </section>

        <section class="card flex flex-col gap-3 p-4">
          <h2 class="font-display text-xl text-cocoa-dark">Consultation</h2>
          <BaseField v-model="catalogue.consultation.nouvelle" label="Nouvelle cliente" @update:model-value="touch" />
          <BaseField v-model="catalogue.consultation.ancienne" label="Ancienne cliente" @update:model-value="touch" />
          <BaseField v-model="catalogue.consultation.final" label="Tarif final" @update:model-value="touch" />
        </section>

        <div class="flex justify-end">
          <BaseButton :loading="saving" :disabled="!dirty" @click="save">Enregistrer</BaseButton>
        </div>
      </div>
    </DataState>

    <ConfirmDialog
      :open="resetOpen"
      :busy="resetting"
      title="Rétablir la grille d’origine"
      confirm-label="Rétablir"
      message="Tous les prix, ajustements et textes de cette page reviendront à la grille des documents du salon. Les modifications actuelles seront perdues."
      @confirm="reset"
      @close="resetOpen = false"
    />
  </div>
</template>
