<script setup>
import { computed, ref, watch } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import { quotas as quotasApi, services as servicesApi } from '@/services'
import { formatDateShort } from '@/utils/format'

/**
 * « Clientes par jour » : combien de clientes le salon prend au plus chaque jour, par type de locks et/ou par coiffure.
 * 0 ou vide = sans limite. Une fois la limite atteinte, le jour est grisé sur le site pour ce type / cette coiffure.
 * La limite se règle ici ; elle s'enregistre avec le bouton « Enregistrer » de la page (même catalogue).
 */
const props = defineProps({
  catalogue: { type: Object, required: true },
  /** Change quand le catalogue est enregistré : on recharge les places prises. */
  savedAt: { type: [String, Number, Date], default: null },
})
const emit = defineEmits(['touch'])

/** Les limites vivent dans le catalogue de la page parente (modifié sur place, enregistré avec elle). */
const q = computed(() => props.catalogue.quotas)
const types = computed(() => props.catalogue.lockTypes ?? [])
const toInt = (v) => Math.max(0, Math.min(100, Math.round(Number(v)) || 0))

const setType = (id, v) => {
  const n = toInt(v)
  if (n) q.value.types[id] = n
  else delete q.value.types[id]
  emit('touch')
}

/* ── Coiffures ── */
const prestations = ref([])
servicesApi.list().then((r) => (prestations.value = r)).catch(() => {})
const nomDe = (id) => prestations.value.find((p) => String(p.id) === String(id))?.name ?? `Coiffure n° ${id}`
const lignes = computed(() => Object.entries(q.value.coiffures).map(([id, limit]) => ({ id, limit })))
const disponibles = computed(() => [
  { value: '', label: 'Choisir une coiffure…' },
  ...prestations.value.filter((p) => !(String(p.id) in q.value.coiffures)).map((p) => ({ value: String(p.id), label: p.name })),
])
const nouvelle = ref({ id: '', limit: 1 })
const ajouter = () => {
  if (!nouvelle.value.id) return
  q.value.coiffures[nouvelle.value.id] = toInt(nouvelle.value.limit) || 1
  nouvelle.value = { id: '', limit: 1 }
  emit('touch')
}
const setCoiffure = (id, v) => {
  const n = toInt(v)
  if (n) q.value.coiffures[id] = n
  else delete q.value.coiffures[id]
  emit('touch')
}
const retirer = (id) => {
  delete q.value.coiffures[id]
  emit('touch')
}

/* ── Besoins et combinaisons (ex. 2 Installations de micro-locks, ou 5 clientes au total) ── */
const BESOINS = [
  { value: 'creation', label: 'Installation' },
  { value: 'resserrage', label: 'Resserrage' },
  { value: 'reparation', label: 'Réparation' },
]
const besoinLabel = { creation: 'Installation', resserrage: 'Resserrage', reparation: 'Réparation' }
const regles = computed(() => q.value.rules ?? [])
const besoinOptions = [{ value: '', label: 'Tous les besoins' }, ...BESOINS]
const typeOptions = computed(() => [{ value: '', label: 'Tous les types' }, ...types.value.map((t) => ({ value: t.id, label: t.name }))])
const parBesoin = (besoin) => regles.value.findIndex((r) => r.besoin === besoin && !r.type)
const limiteBesoin = (besoin) => regles.value[parBesoin(besoin)]?.limit ?? ''
const setBesoin = (besoin, v) => {
  const n = toInt(v)
  const i = parBesoin(besoin)
  if (n && i >= 0) regles.value[i].limit = n
  else if (n) regles.value.push({ besoin, type: '', limit: n })
  else if (i >= 0) regles.value.splice(i, 1)
  emit('touch')
}
const indexTotal = computed(() => regles.value.findIndex((r) => !r.besoin && !r.type))
const setTotal = (v) => {
  const n = toInt(v)
  const i = indexTotal.value
  if (n && i >= 0) regles.value[i].limit = n
  else if (n) regles.value.push({ besoin: '', type: '', limit: n })
  else if (i >= 0) regles.value.splice(i, 1)
  emit('touch')
}
/** Combinaisons = règles qui ne sont ni « un besoin seul » ni « le total ». */
const combinaisons = computed(() =>
  regles.value.map((r, index) => ({ ...r, index })).filter((r) => r.type),
)
const nouvelleRegle = ref({ besoin: '', type: '', limit: 1 })
const ajouterRegle = () => {
  if (!nouvelleRegle.value.type) return
  regles.value.push({ besoin: nouvelleRegle.value.besoin, type: nouvelleRegle.value.type, limit: toInt(nouvelleRegle.value.limit) || 1 })
  nouvelleRegle.value = { besoin: '', type: '', limit: 1 }
  emit('touch')
}
const setRegle = (index, v) => {
  const n = toInt(v)
  if (n) regles.value[index].limit = n
  else regles.value.splice(index, 1)
  emit('touch')
}
const retirerRegle = (index) => {
  regles.value.splice(index, 1)
  emit('touch')
}
const libelleRegle = (r) => `${r.besoin ? besoinLabel[r.besoin] : 'Tous les besoins'} · ${types.value.find((t) => t.id === r.type)?.name ?? r.type}`

/* ── Places déjà prises sur les 7 prochains jours (limites ENREGISTRÉES) ── */
const jours = ref([])
const chargement = ref(false)
const recharger = async () => {
  chargement.value = true
  try {
    jours.value = await quotasApi.overview()
  } catch {
    jours.value = []
  } finally {
    chargement.value = false
  }
}
recharger()
watch(() => props.savedAt, recharger)
const colonnes = computed(() => {
  const vus = new Set()
  for (const j of jours.value) {
    for (const [id, v] of Object.entries(j.types)) if (v.limit) vus.add(`t:${id}`)
    for (const [id, v] of Object.entries(j.coiffures)) if (v.limit) vus.add(`c:${id}`)
    for (const r of j.rules ?? []) vus.add(`r:${r.index}`)
  }
  return [...vus].map((cle) => {
    const [genre, id] = [cle[0], cle.slice(2)]
    if (genre === 'r') return { cle, genre, id, label: jours.value[0]?.rules?.find((r) => String(r.index) === id)?.label ?? 'Règle' }
    return { cle, genre, id, label: genre === 't' ? types.value.find((t) => t.id === id)?.name ?? id : nomDe(id) }
  })
})
const cellule = (jour, col) =>
  col.genre === 't' ? jour.types[col.id] : col.genre === 'c' ? jour.coiffures[col.id] : (jour.rules ?? []).find((r) => String(r.index) === col.id)
</script>

<template>
  <section class="card flex flex-col gap-4 p-4">
    <header>
      <h2 class="section-title">Clientes par jour</h2>
      <p class="text-xs text-muted">
        Le nombre maximal de clientes que le salon prend chaque jour, selon le type de locks, le besoin (installation, resserrage, réparation) et/ou la coiffure choisis. Quand la limite est atteinte,
        le jour est grisé sur le site pour ce choix ; sinon la cliente voit combien de places restent. 0 ou vide = sans limite.
      </p>
    </header>

    <div class="field-zone flex flex-col gap-3">
      <h3 class="group-title">Par type de locks</h3>
      <div class="grid gap-3 sm:grid-cols-3">
        <BaseField
          v-for="t in types"
          :key="t.id"
          :model-value="q.types[t.id] ?? ''"
          :label="t.name"
          type="number"
          :min="0"
          :max="100"
          placeholder="Sans limite"
          @update:model-value="setType(t.id, $event)"
        />
      </div>
    </div>

    <div class="field-zone flex flex-col gap-3">
      <h3 class="group-title">Par besoin</h3>
      <p class="text-xs text-muted">Combien de clientes par jour pour chaque besoin, quelle que soit la coiffure. Le « total » plafonne la journée entière, tous besoins confondus.</p>
      <div class="grid gap-3 sm:grid-cols-4">
        <BaseField
          v-for="b in BESOINS"
          :key="b.value"
          :model-value="limiteBesoin(b.value)"
          :label="b.label"
          type="number"
          :min="0"
          :max="100"
          placeholder="Sans limite"
          @update:model-value="setBesoin(b.value, $event)"
        />
        <BaseField :model-value="regles[indexTotal]?.limit ?? ''" label="Total par jour" type="number" :min="0" :max="100" placeholder="Sans limite" @update:model-value="setTotal" />
      </div>
    </div>

    <div class="field-zone flex flex-col gap-3">
      <h3 class="group-title">Combinaisons besoin + type</h3>
      <p class="text-xs text-muted">
        Pour mélanger : par exemple « Installation · Micro-locks : 2 par jour » en plus de « Réparation : 1 par jour ». Un jour peut ainsi accueillir 5 clientes
        avec des prestations différentes. Quand plusieurs limites concernent un choix, la plus serrée s’applique.
      </p>
      <ul v-if="combinaisons.length" class="flex flex-col gap-2">
        <li v-for="r in combinaisons" :key="r.index" class="flex flex-wrap items-end gap-3">
          <span class="min-w-[10rem] flex-1 text-sm text-cocoa-dark">{{ libelleRegle(r) }}</span>
          <div class="w-28">
            <BaseField :model-value="r.limit" label="Par jour" type="number" :min="0" :max="100" @update:model-value="setRegle(r.index, $event)" />
          </div>
          <BaseButton variant="subtle" @click="retirerRegle(r.index)">Retirer</BaseButton>
        </li>
      </ul>
      <p v-else class="text-xs text-muted">Aucune combinaison.</p>
      <div class="flex flex-wrap items-end gap-3">
        <div class="min-w-[10rem] flex-1"><BaseField v-model="nouvelleRegle.besoin" label="Besoin" :options="besoinOptions" /></div>
        <div class="min-w-[10rem] flex-1"><BaseField v-model="nouvelleRegle.type" label="Type de locks" :options="typeOptions" /></div>
        <div class="w-28"><BaseField v-model="nouvelleRegle.limit" label="Par jour" type="number" :min="1" :max="100" /></div>
        <BaseButton variant="secondary" :disabled="!nouvelleRegle.type" @click="ajouterRegle">Ajouter</BaseButton>
      </div>
    </div>

    <div class="field-zone flex flex-col gap-3">
      <h3 class="group-title">Par coiffure</h3>
      <p class="text-xs text-muted">
        Pour une coiffure précise (par exemple longue à réaliser). Si un type ET une coiffure ont une limite, la plus serrée s’applique.
      </p>
      <ul v-if="lignes.length" class="flex flex-col gap-2">
        <li v-for="l in lignes" :key="l.id" class="flex flex-wrap items-end gap-3">
          <span class="min-w-[10rem] flex-1 text-sm text-cocoa-dark">{{ nomDe(l.id) }}</span>
          <div class="w-28">
            <BaseField :model-value="l.limit" label="Par jour" type="number" :min="0" :max="100" @update:model-value="setCoiffure(l.id, $event)" />
          </div>
          <BaseButton variant="subtle" @click="retirer(l.id)">Retirer</BaseButton>
        </li>
      </ul>
      <p v-else class="text-xs text-muted">Aucune limite par coiffure.</p>
      <div class="flex flex-wrap items-end gap-3">
        <div class="min-w-[12rem] flex-1">
          <BaseField v-model="nouvelle.id" label="Ajouter une coiffure" :options="disponibles" />
        </div>
        <div class="w-28">
          <BaseField v-model="nouvelle.limit" label="Par jour" type="number" :min="1" :max="100" />
        </div>
        <BaseButton variant="secondary" :disabled="!nouvelle.id" @click="ajouter">Ajouter</BaseButton>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <h3 class="group-title">Places prises, 7 prochains jours <span class="font-normal text-muted">(limites enregistrées)</span></h3>
      <p v-if="chargement" class="text-xs text-muted">Chargement…</p>
      <p v-else-if="!colonnes.length" class="text-xs text-muted">Aucune limite enregistrée pour le moment.</p>
      <div v-else class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Jour</th>
              <th v-for="c in colonnes" :key="c.cle">{{ c.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in jours" :key="j.date">
              <td class="whitespace-nowrap">{{ formatDateShort(j.date) }}</td>
              <td v-for="c in colonnes" :key="c.cle" :class="cellule(j, c)?.used >= cellule(j, c)?.limit ? 'font-semibold text-danger' : ''">
                {{ cellule(j, c)?.used ?? 0 }} / {{ cellule(j, c)?.limit }}
                <span v-if="cellule(j, c)?.used >= cellule(j, c)?.limit" class="text-[0.7rem]">· complet</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
