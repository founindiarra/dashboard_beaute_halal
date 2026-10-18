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
    ensure()
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

const addGoodToKnow = () => {
  catalogue.value.goodToKnow ??= []
  catalogue.value.goodToKnow.push({ title: '', text: '' })
  touch()
}
const removeGoodToKnow = (index) => {
  catalogue.value.goodToKnow.splice(index, 1)
  touch()
}
const moveGoodToKnow = (index, delta) => {
  const list = catalogue.value.goodToKnow
  const target = index + delta
  if (target < 0 || target >= list.length) return
  ;[list[index], list[target]] = [list[target], list[index]]
  touch()
}
/** Les champs de texte optionnels peuvent manquer sur un catalogue ancien : on les crée à la saisie. */
const ensure = () => {
  const c = catalogue.value
  if (!c) return
  c.brand ??= { tagline: '', intro: '' }
  c.whatsapp ??= { display: '', number: '' }
  c.engagement ??= ''
  c.videoAdvice ??= ''
  c.goodToKnow ??= []
  for (const key of ['formules', 'besoins', 'prestations', 'longueurs']) c[key] ??= []
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
    ensure()
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

          <details class="rounded-xl border border-line bg-ivory/40 px-3 py-2">
            <summary class="cursor-pointer text-sm text-cocoa-dark">Présentation sur le site</summary>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <BaseField v-model="type.name" label="Nom du type" @update:model-value="touch" />
              <BaseField v-model="type.tagline" label="Accroche" hint="Une phrase courte, sous le nom." @update:model-value="touch" />
              <BaseField v-model="type.size" label="Taille des locks" @update:model-value="touch" />
              <BaseField v-model="type.rhythm" label="Rythme de resserrage" @update:model-value="touch" />
              <div class="sm:col-span-2">
                <BaseField v-model="type.description" label="Description" textarea :rows="3" @update:model-value="touch" />
              </div>
              <div class="sm:col-span-2">
                <BaseField v-model="type.image" label="Photo (adresse ou chemin /uploads/…)" @update:model-value="touch" />
              </div>
            </div>
          </details>

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


        <section class="card flex flex-col gap-3 p-4">
          <h2 class="font-display text-xl text-cocoa-dark">Textes d’accueil et contact</h2>
          <BaseField v-model="catalogue.brand.tagline" label="Accroche du salon" @update:model-value="touch" />
          <BaseField v-model="catalogue.brand.intro" label="Présentation" textarea :rows="3" @update:model-value="touch" />
          <div class="grid gap-3 sm:grid-cols-2">
            <BaseField v-model="catalogue.whatsapp.display" label="WhatsApp : numéro affiché" hint="Ex. +225 05 66 15 74 32" @update:model-value="touch" />
            <BaseField v-model="catalogue.whatsapp.number" label="WhatsApp : numéro du lien" hint="Chiffres seuls, indicatif compris (8 à 15)." @update:model-value="touch" />
          </div>
          <BaseField v-model="catalogue.engagement" label="Engagement du salon" textarea :rows="2" @update:model-value="touch" />
          <BaseField v-model="catalogue.videoAdvice" label="Conseil vidéo (formulaire de rendez-vous)" textarea :rows="2" @update:model-value="touch" />
        </section>

        <section class="card flex flex-col gap-4 p-4">
          <h2 class="font-display text-xl text-cocoa-dark">Volumes et longueurs</h2>
          <p class="text-xs text-muted">Les prix de chaque volume se règlent dans les tableaux des types ci-dessus.</p>
          <ul class="flex flex-col gap-3">
            <li v-for="volume in catalogue.volumes" :key="volume.id" class="grid gap-3 sm:grid-cols-[4rem_1fr_2fr]">
              <span class="pt-2 font-display text-lg text-cocoa-dark">{{ volume.id }}</span>
              <BaseField v-model="volume.label" label="Libellé" @update:model-value="touch" />
              <BaseField v-model="volume.hint" label="Aide" @update:model-value="touch" />
            </li>
          </ul>
          <ul class="flex flex-col gap-3 border-t border-line pt-3">
            <li v-for="(longueur, i) in catalogue.longueurs" :key="i" class="grid gap-3 sm:grid-cols-2">
              <BaseField v-model="longueur.label" label="Longueur" @update:model-value="touch" />
              <BaseField v-model="longueur.hint" label="Aide" @update:model-value="touch" />
            </li>
          </ul>
        </section>

        <section class="card flex flex-col gap-4 p-4">
          <h2 class="font-display text-xl text-cocoa-dark">Formules de resserrage</h2>
          <ul class="flex flex-col gap-4">
            <li v-for="formule in catalogue.formules" :key="formule.id" class="grid gap-3 sm:grid-cols-3">
              <BaseField v-model="formule.label" label="Nom complet" @update:model-value="touch" />
              <BaseField v-model="formule.short" label="Nom court" @update:model-value="touch" />
              <BaseField v-model="formule.detail" label="Détail" @update:model-value="touch" />
              <div class="sm:col-span-3">
                <BaseField v-model="formule.help" label="Explication" textarea :rows="2" @update:model-value="touch" />
              </div>
            </li>
          </ul>
        </section>

        <section class="card flex flex-col gap-4 p-4">
          <h2 class="font-display text-xl text-cocoa-dark">Besoins proposés à la réservation</h2>
          <ul class="flex flex-col gap-4">
            <li v-for="besoin in catalogue.besoins" :key="besoin.id" class="flex flex-col gap-3">
              <BaseField v-model="besoin.name" label="Nom" @update:model-value="touch" />
              <BaseField v-model="besoin.text" label="Texte" textarea :rows="2" @update:model-value="touch" />
              <BaseField v-model="besoin.note" label="Note sous le texte" textarea :rows="2" @update:model-value="touch" />
            </li>
          </ul>
        </section>

        <section class="card flex flex-col gap-4 p-4">
          <h2 class="font-display text-xl text-cocoa-dark">Prestations de la page Tarifs</h2>
          <ul class="flex flex-col gap-4">
            <li v-for="prestation in catalogue.prestations" :key="prestation.id" class="flex flex-col gap-3">
              <BaseField v-model="prestation.name" label="Nom" @update:model-value="touch" />
              <BaseField v-model="prestation.description" label="Description" textarea :rows="2" @update:model-value="touch" />
            </li>
          </ul>
        </section>

        <section class="card flex flex-col gap-4 p-4">
          <header class="flex items-center justify-between gap-3">
            <h2 class="font-display text-xl text-cocoa-dark">À savoir avant de venir</h2>
            <BaseButton variant="secondary" @click="addGoodToKnow">Ajouter un point</BaseButton>
          </header>
          <p v-if="!catalogue.goodToKnow.length" class="text-sm text-muted">Aucun point : la rubrique reste vide sur le site.</p>
          <ul class="flex flex-col gap-4">
            <li v-for="(item, i) in catalogue.goodToKnow" :key="i" class="flex flex-col gap-3 rounded-xl border border-line p-3">
              <BaseField v-model="item.title" label="Titre" @update:model-value="touch" />
              <BaseField v-model="item.text" label="Texte" textarea :rows="3" @update:model-value="touch" />
              <div class="flex gap-2">
                <BaseButton variant="subtle" :disabled="i === 0" @click="moveGoodToKnow(i, -1)">Monter</BaseButton>
                <BaseButton variant="subtle" :disabled="i === catalogue.goodToKnow.length - 1" @click="moveGoodToKnow(i, 1)">Descendre</BaseButton>
                <BaseButton variant="danger" @click="removeGoodToKnow(i)">Retirer</BaseButton>
              </div>
            </li>
          </ul>
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
