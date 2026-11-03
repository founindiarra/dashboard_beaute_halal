<script setup>
import { computed, ref } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataState from '@/components/ui/DataState.vue'
import ImageField from '@/components/ui/ImageField.vue'
import QuotasCard from '@/components/tarifs/QuotasCard.vue'
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

/** Fourchettes d'installation : un champ vide = pas de montant (la note — « Sur demande », « Non proposé » — s'affiche à la place). */
const setRange = (method, key, value) => {
  const text = String(value ?? '').trim()
  method[key] = text === '' ? null : Math.max(0, toInt(text))
  touch()
}
const addMethod = (group) => {
  if (group.methods.length >= 12) return toasts.error('12 méthodes au maximum par type.')
  group.methods.push({ name: 'Nouvelle méthode', min: null, max: null, note: 'Sur demande' })
  touch()
}
const removeMethod = (group, index) => {
  group.methods.splice(index, 1)
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
const nextId = (list, prefix) => {
  let n = list.length + 1
  while (list.some((x) => x.id === `${prefix}${n}`)) n += 1
  return `${prefix}${n}`
}
const addVolume = () => {
  const c = catalogue.value
  if (c.volumes.length >= 12) return toasts.error('12 volumes au maximum.')
  const id = nextId(c.volumes, 'V')
  c.volumes.push({ id, label: 'Nouveau volume', hint: '', image: '' })
  for (const type of c.lockTypes) type.prices[id] = [0, 0]
  touch()
}
const removeVolume = (index) => {
  const c = catalogue.value
  if (c.volumes.length <= 1) return toasts.error('Gardez au moins un volume.')
  const [gone] = c.volumes.splice(index, 1)
  for (const type of c.lockTypes) delete type.prices[gone.id]
  touch()
}
const addLongueur = () => {
  catalogue.value.longueurs.push({ label: 'Nouvelle longueur', hint: '', image: '' })
  touch()
}
const removeLongueur = (index) => {
  catalogue.value.longueurs.splice(index, 1)
  touch()
}
const addPrestation = () => {
  const list = catalogue.value.prestations
  list.push({ id: nextId(list, 'prestation-'), name: 'Nouvelle prestation', description: '' })
  touch()
}
const removePrestation = (index) => {
  catalogue.value.prestations.splice(index, 1)
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
  c.quotas ??= { types: {}, coiffures: {}, rules: [] }
  c.quotas.types ??= {}
  c.quotas.coiffures ??= {}
  c.quotas.rules ??= []
  c.volumes ??= []
  c.lockTypes ??= []
  for (const key of ['formules', 'besoins', 'prestations', 'longueurs', 'installations']) c[key] ??= []
  for (const item of [...(c.volumes ?? []), ...c.longueurs]) item.image ??= ''
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
            <span class="section-eyebrow">Type de lock · modifiable</span>
            <h2 class="section-title">{{ type.name }}</h2>
            <p class="mt-1 text-xs text-muted">{{ type.size }} · {{ type.rhythm }}</p>
          </header>

          <details class="rounded-xl border border-line bg-ivory/40 px-3 py-2 open:bg-surface">
            <summary class="cursor-pointer text-sm text-cocoa-dark">Présentation sur le site</summary>
            <div class="field-zone mt-3 grid gap-3 sm:grid-cols-2">
              <BaseField v-model="type.name" label="Nom du type" @update:model-value="touch" />
              <BaseField v-model="type.tagline" label="Accroche" hint="Une phrase courte, sous le nom." @update:model-value="touch" />
              <BaseField v-model="type.size" label="Taille des locks" @update:model-value="touch" />
              <BaseField v-model="type.rhythm" label="Rythme de resserrage" @update:model-value="touch" />
              <div class="sm:col-span-2">
                <BaseField v-model="type.description" label="Description" textarea :rows="3" @update:model-value="touch" />
              </div>
              <div class="sm:col-span-2">
                <ImageField v-model="type.image" label="Photo du type" @update:model-value="touch" @error="toasts.error($event)" />
              </div>
            </div>
          </details>

          <div>
            <h3 class="group-title mb-2">Prix par volume (FCFA)</h3>
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
              <h3 class="group-title mb-2">
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
              <h3 class="group-title mb-2">
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

          <p class="rounded-lg border border-line bg-white px-3 py-2 text-xs text-muted">
            Réparation : le site affiche désormais le prix de chaque niveau (partielle, globale), quel que soit le type. Ils se règlent dans
            « Textes et règles du site ». Les deux champs ci-dessous ne servent plus qu’aux anciennes versions du site.
          </p>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="flex flex-col">
              <label class="label" :for="`repair-${type.id}`">Réparation (ancien site) : à partir de (FCFA)</label>
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

        <section v-if="catalogue.installations?.length" class="card flex flex-col gap-4 p-4">
          <header>
            <h2 class="section-title">Installation : fourchettes de prix</h2>
            <p class="text-xs text-muted">
              Affichées à la réservation quand la cliente choisit « Installation de locks ». Laissez un montant vide pour afficher la note à la place
              (« Sur demande », « Non proposé »).
            </p>
          </header>
          <div v-for="group in catalogue.installations" :key="group.id" class="flex flex-col gap-2 rounded-xl bg-ivory/50 p-3">
            <h3 class="group-title">{{ group.title }}<span v-if="group.size" class="text-muted"> · {{ group.size }}</span></h3>
            <div v-for="(method, index) in group.methods" :key="index" class="grid items-end gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
              <BaseField v-model="method.name" label="Méthode" @update:model-value="touch" />
              <BaseField :model-value="method.min ?? ''" label="De (FCFA)" type="number" :min="0" @update:model-value="setRange(method, 'min', $event)" />
              <BaseField :model-value="method.max ?? ''" label="À (FCFA)" type="number" :min="0" @update:model-value="setRange(method, 'max', $event)" />
              <BaseField v-model="method.note" label="Note (sans montant)" placeholder="Sur demande" @update:model-value="touch" />
              <BaseButton size="sm" variant="ghost" @click="removeMethod(group, index)">Retirer</BaseButton>
            </div>
            <div><BaseButton size="sm" variant="secondary" @click="addMethod(group)">Ajouter une méthode</BaseButton></div>
          </div>
        </section>

        <QuotasCard :catalogue="catalogue" :saved-at="catalogue.updatedAt" @touch="touch" />

        <section class="card flex flex-col gap-3 p-4">
          <h2 class="section-title">Consultation</h2>
          <BaseField v-model="catalogue.consultation.nouvelle" label="Nouvelle cliente" @update:model-value="touch" />
          <BaseField v-model="catalogue.consultation.ancienne" label="Ancienne cliente" @update:model-value="touch" />
          <BaseField v-model="catalogue.consultation.final" label="Tarif final" @update:model-value="touch" />
        </section>


        <section class="card flex flex-col gap-3 p-4">
          <h2 class="section-title">Textes d’accueil et contact</h2>
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
          <header class="flex items-start justify-between gap-3">
            <div>
            <h2 class="section-title">Volumes de cheveux</h2>
            <p class="text-xs text-muted">
              Étape « Volume » du rendez-vous : une photo, un nom et une aide par volume. Sans photo, le site utilise
              la photo du salon intégrée. Un nouveau volume démarre à 0 FCFA : réglez ses prix dans les tableaux des types.
            </p>
            </div>
            <BaseButton variant="secondary" @click="addVolume">Ajouter un volume</BaseButton>
          </header>
          <ul class="grid gap-4 lg:grid-cols-2">
            <li v-for="(volume, vi) in catalogue.volumes" :key="volume.id" class="field-zone flex flex-col gap-3">
              <p class="group-title">Volume {{ volume.id }}</p>
              <ImageField
                v-model="volume.image"
                label="Photo"
                hint="Une photo de chevelure qui correspond à ce volume (carrée ou portrait de préférence)."
                @update:model-value="touch"
                @error="toasts.error($event)"
              />
              <BaseField v-model="volume.label" label="Nom affiché" @update:model-value="touch" />
              <BaseField v-model="volume.hint" label="Aide (texte sous le nom)" @update:model-value="touch" />
              <div><BaseButton variant="danger" @click="removeVolume(vi)">Retirer ce volume</BaseButton></div>
            </li>
          </ul>
        </section>

        <section class="card flex flex-col gap-4 p-4">
          <header class="flex items-start justify-between gap-3">
            <div>
            <h2 class="section-title">Longueurs de cheveux</h2>
            <p class="text-xs text-muted">
              Étape « Longueur » du rendez-vous. Le nom sert d’identifiant : il est enregistré tel quel dans la demande.
            </p>
            </div>
            <BaseButton variant="secondary" @click="addLongueur">Ajouter une longueur</BaseButton>
          </header>
          <ul class="grid gap-4 lg:grid-cols-2">
            <li v-for="(longueur, i) in catalogue.longueurs" :key="i" class="field-zone flex flex-col gap-3">
              <ImageField
                v-model="longueur.image"
                label="Photo"
                hint="Une photo qui montre cette longueur (carrée ou portrait de préférence)."
                @update:model-value="touch"
                @error="toasts.error($event)"
              />
              <BaseField v-model="longueur.label" label="Nom" @update:model-value="touch" />
              <BaseField v-model="longueur.hint" label="Aide (texte sous le nom)" @update:model-value="touch" />
              <div><BaseButton variant="danger" @click="removeLongueur(i)">Retirer cette longueur</BaseButton></div>
            </li>
          </ul>
        </section>

        <section class="card flex flex-col gap-4 p-4">
          <h2 class="section-title">Formules de resserrage</h2>
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
          <h2 class="section-title">Besoins proposés à la réservation</h2>
          <ul class="flex flex-col gap-4">
            <li v-for="besoin in catalogue.besoins" :key="besoin.id" class="flex flex-col gap-3">
              <BaseField v-model="besoin.name" label="Nom" @update:model-value="touch" />
              <BaseField v-model="besoin.text" label="Texte" textarea :rows="2" @update:model-value="touch" />
              <BaseField v-model="besoin.note" label="Note sous le texte" textarea :rows="2" @update:model-value="touch" />
            </li>
          </ul>
        </section>

        <section class="card flex flex-col gap-4 p-4">
          <header class="flex items-center justify-between gap-3">
            <h2 class="section-title">Prestations de la page Tarifs</h2>
            <BaseButton variant="secondary" @click="addPrestation">Ajouter une prestation</BaseButton>
          </header>
          <ul class="flex flex-col gap-4">
            <li v-for="(prestation, pi) in catalogue.prestations" :key="prestation.id" class="field-zone flex flex-col gap-3">
              <BaseField v-model="prestation.name" label="Nom" @update:model-value="touch" />
              <BaseField v-model="prestation.description" label="Description" textarea :rows="2" @update:model-value="touch" />
              <div><BaseButton variant="danger" @click="removePrestation(pi)">Retirer</BaseButton></div>
            </li>
          </ul>
        </section>

        <section class="card flex flex-col gap-4 p-4">
          <header class="flex items-center justify-between gap-3">
            <h2 class="section-title">À savoir avant de venir</h2>
            <BaseButton variant="secondary" @click="addGoodToKnow">Ajouter un point</BaseButton>
          </header>
          <p v-if="!catalogue.goodToKnow.length" class="text-sm text-muted">Aucun point : la rubrique reste vide sur le site.</p>
          <ul class="flex flex-col gap-4">
            <li v-for="(item, i) in catalogue.goodToKnow" :key="i" class="field-zone flex flex-col gap-3">
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
