<script setup>
import { computed, ref } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { tarifs as api } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { formatDateTime } from '@/utils/format'

/**
 * Textes et règles du site public : accueil, « savoir-faire », étapes, bandeaux, titres des pages, conditions de
 * rendez-vous, aide sur les tailles, prix des réparations, heures proposées selon le profil de la cliente.
 * Stockés dans le catalogue du site (comme « Tarifs du site ») : le site les utilise dès l’enregistrement.
 * Un champ laissé vide retrouve le texte d’origine.
 */
const toasts = useToastStore()

const catalogue = ref(null)
const loading = ref(false)
const error = ref(null)
const saving = ref(false)
const dirty = ref(false)
/** Heures par profil, saisies sous forme de texte « 09:00, 10:00 ». */
const heures = ref({ consultation: '', nouvelle: '', ancienneResserrage: '', autres: '' })

const touch = () => {
  dirty.value = true
}

const PAGES = [
  { key: 'services', label: 'Page « Services »', intro: true },
  { key: 'galerie', label: 'Page « Coiffures »', intro: true },
  { key: 'apropos', label: 'Page « À propos »', intro: false },
  { key: 'contact', label: 'Page « Contact »', intro: true },
  { key: 'rendezvous', label: 'Page « Rendez-vous »', intro: true },
]
const SECTIONS = [
  { key: 'types', label: 'Accueil : types de locks', lien: true },
  { key: 'galerie', label: 'Accueil : coiffures', lien: true },
  { key: 'avis', label: 'Accueil : avis de clientes' },
  { key: 'bonASavoir', label: 'Page Services : « Bon à savoir »' },
  { key: 'grille', label: 'Page Services : grille tarifaire', intro: true },
]
const SEO_PAGES = [
  { key: 'home', label: 'Accueil' },
  { key: 'services', label: 'Services' },
  { key: 'gallery', label: 'Coiffures' },
  { key: 'about', label: 'À propos' },
  { key: 'booking', label: 'Rendez-vous' },
  { key: 'contact', label: 'Contact' },
]
const PROFILS = [
  { key: 'consultation', label: 'Consultation en salon', hint: 'Heure de la consultation capillaire.' },
  { key: 'nouvelle', label: 'Nouvelle cliente (installation)', hint: 'Par exemple 10:00.' },
  { key: 'ancienneResserrage', label: 'Ancienne cliente (resserrage)', hint: 'Par exemple 09:00. Les places dépendent du nombre d’agents actifs.' },
  { key: 'autres', label: 'Tous les autres cas', hint: 'Par exemple 14:00, 14:30.' },
]

const ensure = () => {
  const c = catalogue.value
  if (!c) return
  c.site ??= {}
  const s = c.site
  s.accueil ??= { titre: '', bouton: '', lien: '' }
  s.sections ??= {}
  for (const x of SECTIONS) s.sections[x.key] ??= { eyebrow: '', titre: '', lien: '', intro: '' }
  s.sections.introuvable ??= { titre: '', texte: '' }
  s.seo ??= {}
  for (const x of SEO_PAGES) s.seo[x.key] ??= { title: '', description: '' }
  s.approche ??= { eyebrow: '', titre: '', lien: '', valeurs: [] }
  s.approche.valeurs ??= []
  s.etapes ??= { eyebrow: '', titre: '', liste: [] }
  s.etapes.liste ??= []
  s.invitation ??= { titre: '', texte: '' }
  s.invitationGalerie ??= { titre: '', texte: '' }
  s.pages ??= {}
  for (const p of PAGES) s.pages[p.key] ??= { eyebrow: '', titre: '', intro: '' }
  s.pied ??= { rendezvous: '' }
  s.conditions ??= { title: '', lines: [], accept: '' }
  s.conditions.lines ??= []
  s.tailles ??= { title: '', lines: [] }
  s.tailles.lines ??= []
  s.creneaux ??= {}
  c.reparations ??= []
  for (const p of PROFILS) heures.value[p.key] = (s.creneaux[p.key] ?? []).join(', ')
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

const site = computed(() => catalogue.value?.site)

/* Listes de textes (conditions, tailles) et de blocs (cartes, étapes). */
const addLine = (list, max = 8) => {
  if (list.length >= max) return toasts.error(`${max} lignes au maximum.`)
  list.push('')
  touch()
}
const addBlock = (list, max) => {
  if (list.length >= max) return toasts.error(`${max} éléments au maximum.`)
  list.push({ title: '', text: '' })
  touch()
}
const remove = (list, i) => {
  list.splice(i, 1)
  touch()
}
const move = (list, i, delta) => {
  const t = i + delta
  if (t < 0 || t >= list.length) return
  ;[list[i], list[t]] = [list[t], list[i]]
  touch()
}

/** « 9:00, 14h30 ; 15:00 » → ['09:00', '14:30', '15:00'] ; null si une heure est invalide. */
const lireHeures = (texte) => {
  const morceaux = String(texte ?? '').split(/[,;\s]+/).filter(Boolean)
  const out = []
  for (const m of morceaux) {
    const r = /^(\d{1,2})[:hH](\d{2})$/.exec(m)
    if (!r || Number(r[1]) > 23 || Number(r[2]) > 59) return null
    out.push(`${r[1].padStart(2, '0')}:${r[2]}`)
  }
  return out
}

const save = async () => {
  const c = catalogue.value
  // Heures : valider avant d'envoyer.
  const creneaux = {}
  for (const p of PROFILS) {
    const liste = lireHeures(heures.value[p.key])
    if (liste === null) return toasts.error(`Heures invalides pour « ${p.label} » : écrivez-les ainsi, 09:00, 14:30.`)
    creneaux[p.key] = liste
  }
  for (const r of c.reparations) {
    const n = Number(r.from)
    if (!Number.isFinite(n) || n < 0) return toasts.error(`Prix invalide pour « ${r.name} ».`)
    r.from = Math.round(n)
  }
  c.site.creneaux = creneaux
  // Lignes vides retirées.
  c.site.conditions.lines = c.site.conditions.lines.map((l) => String(l).trim()).filter(Boolean)
  c.site.tailles.lines = c.site.tailles.lines.map((l) => String(l).trim()).filter(Boolean)
  saving.value = true
  try {
    catalogue.value = await api.save(c)
    ensure()
    dirty.value = false
    toasts.success('Textes et règles enregistrés. Le site les utilise dès son prochain chargement.')
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
    <PageHeader title="Textes et règles du site" subtitle="Les textes de l’accueil et des pages, les conditions de rendez-vous, les prix des réparations et les heures proposées." />

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="max-w-2xl text-sm text-muted">
        Dans un titre, entourez un mot d’astérisques pour le mettre en valeur : <code>Locks et *micro-locks*</code>.
        Un champ laissé vide retrouve le texte d’origine. Volumes, tailles et prix par type se règlent dans « Tarifs du site ».
      </p>
      <BaseButton :loading="saving" :disabled="!dirty" @click="save">Enregistrer</BaseButton>
    </div>

    <DataState :loading="loading" :error="error" :empty="!catalogue" loading-label="Chargement des textes du site…" @retry="load">
      <div v-if="catalogue && site" class="flex flex-col gap-5">
        <p v-if="catalogue.updatedAt" class="text-xs text-muted">Dernière modification : {{ formatDateTime(catalogue.updatedAt) }}</p>
        <p v-if="dirty" class="rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-xs text-warn" role="status">Modifications non enregistrées.</p>

        <section class="card flex flex-col gap-3 p-4">
          <header>
            <h2 class="font-display text-xl text-cocoa-dark">Accueil : titre principal</h2>
            <p class="text-xs text-muted">Le grand titre de la première page. Le texte d’introduction se règle dans « Tarifs du site ».</p>
          </header>
          <BaseField v-model="site.accueil.titre" label="Titre" hint="Exemple : Locks, small locks et *micro-locks* à Abidjan." @update:model-value="touch" />
          <div class="grid gap-3 sm:grid-cols-2">
            <BaseField v-model="site.accueil.bouton" label="Texte du bouton principal" @update:model-value="touch" />
            <BaseField v-model="site.accueil.lien" label="Texte du lien sous le bouton" @update:model-value="touch" />
          </div>
        </section>

        <section class="card flex flex-col gap-3 p-4">
          <header class="flex items-center justify-between gap-3">
            <div>
              <h2 class="font-display text-xl text-cocoa-dark">Accueil : le savoir-faire</h2>
              <p class="text-xs text-muted">Le titre et les cartes numérotées.</p>
            </div>
            <BaseButton variant="secondary" @click="addBlock(site.approche.valeurs, 6)">Ajouter une carte</BaseButton>
          </header>
          <div class="grid gap-3 sm:grid-cols-2">
            <BaseField v-model="site.approche.eyebrow" label="Petit titre" @update:model-value="touch" />
            <BaseField v-model="site.approche.lien" label="Texte du lien" @update:model-value="touch" />
          </div>
          <BaseField v-model="site.approche.titre" label="Titre" @update:model-value="touch" />
          <ul class="flex flex-col gap-3">
            <li v-for="(v, i) in site.approche.valeurs" :key="i" class="flex flex-col gap-3 rounded-xl border border-line p-3">
              <BaseField v-model="v.title" :label="`Carte ${i + 1} : titre`" @update:model-value="touch" />
              <BaseField v-model="v.text" label="Texte" textarea :rows="3" @update:model-value="touch" />
              <div class="flex gap-2">
                <BaseButton variant="subtle" :disabled="i === 0" @click="move(site.approche.valeurs, i, -1)">Monter</BaseButton>
                <BaseButton variant="subtle" :disabled="i === site.approche.valeurs.length - 1" @click="move(site.approche.valeurs, i, 1)">Descendre</BaseButton>
                <BaseButton variant="danger" :disabled="site.approche.valeurs.length <= 1" @click="remove(site.approche.valeurs, i)">Retirer</BaseButton>
              </div>
            </li>
          </ul>
        </section>

        <section class="card flex flex-col gap-3 p-4">
          <header class="flex items-center justify-between gap-3">
            <div>
              <h2 class="font-display text-xl text-cocoa-dark">Comment ça marche</h2>
              <p class="text-xs text-muted">Les étapes affichées sur l’accueil et la page « À propos ».</p>
            </div>
            <BaseButton variant="secondary" @click="addBlock(site.etapes.liste, 8)">Ajouter une étape</BaseButton>
          </header>
          <div class="grid gap-3 sm:grid-cols-2">
            <BaseField v-model="site.etapes.eyebrow" label="Petit titre" @update:model-value="touch" />
            <BaseField v-model="site.etapes.titre" label="Titre" @update:model-value="touch" />
          </div>
          <ul class="flex flex-col gap-3">
            <li v-for="(v, i) in site.etapes.liste" :key="i" class="flex flex-col gap-3 rounded-xl border border-line p-3">
              <BaseField v-model="v.title" :label="`Étape ${i + 1} : titre`" @update:model-value="touch" />
              <BaseField v-model="v.text" label="Texte" textarea :rows="2" @update:model-value="touch" />
              <div class="flex gap-2">
                <BaseButton variant="subtle" :disabled="i === 0" @click="move(site.etapes.liste, i, -1)">Monter</BaseButton>
                <BaseButton variant="subtle" :disabled="i === site.etapes.liste.length - 1" @click="move(site.etapes.liste, i, 1)">Descendre</BaseButton>
                <BaseButton variant="danger" :disabled="site.etapes.liste.length <= 1" @click="remove(site.etapes.liste, i)">Retirer</BaseButton>
              </div>
            </li>
          </ul>
        </section>

        <section class="card flex flex-col gap-3 p-4">
          <header>
            <h2 class="font-display text-xl text-cocoa-dark">Titres des sections</h2>
            <p class="text-xs text-muted">Les titres des blocs de l’accueil et de la page Services.</p>
          </header>
          <div v-for="x in SECTIONS" :key="x.key" class="flex flex-col gap-3 rounded-xl border border-line p-3">
            <h3 class="text-sm font-medium text-cocoa-dark">{{ x.label }}</h3>
            <div class="grid gap-3 sm:grid-cols-2">
              <BaseField v-model="site.sections[x.key].eyebrow" label="Petit titre" @update:model-value="touch" />
              <BaseField v-model="site.sections[x.key].titre" label="Titre" @update:model-value="touch" />
              <BaseField v-if="x.lien" v-model="site.sections[x.key].lien" label="Texte du lien" @update:model-value="touch" />
            </div>
            <BaseField v-if="x.intro" v-model="site.sections[x.key].intro" label="Introduction" textarea :rows="2" @update:model-value="touch" />
          </div>
          <div class="flex flex-col gap-3 rounded-xl border border-line p-3">
            <h3 class="text-sm font-medium text-cocoa-dark">Page introuvable (erreur 404)</h3>
            <BaseField v-model="site.sections.introuvable.titre" label="Titre" @update:model-value="touch" />
            <BaseField v-model="site.sections.introuvable.texte" label="Texte" textarea :rows="2" @update:model-value="touch" />
          </div>
        </section>

        <section class="card flex flex-col gap-3 p-4">
          <header>
            <h2 class="font-display text-xl text-cocoa-dark">Référencement (Google et partages)</h2>
            <p class="text-xs text-muted">Le titre de l’onglet du navigateur et la description montrée dans les résultats Google et les aperçus WhatsApp ou Facebook.</p>
          </header>
          <div v-for="x in SEO_PAGES" :key="x.key" class="flex flex-col gap-3 rounded-xl border border-line p-3">
            <h3 class="text-sm font-medium text-cocoa-dark">{{ x.label }}</h3>
            <BaseField v-model="site.seo[x.key].title" label="Titre" hint="Environ 60 caractères au maximum." @update:model-value="touch" />
            <BaseField v-model="site.seo[x.key].description" label="Description" textarea :rows="2" hint="Environ 160 caractères au maximum." @update:model-value="touch" />
          </div>
        </section>

        <section class="card flex flex-col gap-3 p-4">
          <header>
            <h2 class="font-display text-xl text-cocoa-dark">Bandeaux « Prendre rendez-vous »</h2>
            <p class="text-xs text-muted">Le grand bandeau en bas des pages, et sa variante sur la page « Coiffures ».</p>
          </header>
          <div class="grid gap-3 sm:grid-cols-2">
            <BaseField v-model="site.invitation.titre" label="Bandeau : titre" @update:model-value="touch" />
            <BaseField v-model="site.invitationGalerie.titre" label="Page Coiffures : titre" @update:model-value="touch" />
            <BaseField v-model="site.invitation.texte" label="Bandeau : texte" textarea :rows="2" @update:model-value="touch" />
            <BaseField v-model="site.invitationGalerie.texte" label="Page Coiffures : texte" textarea :rows="2" @update:model-value="touch" />
          </div>
        </section>

        <section class="card flex flex-col gap-3 p-4">
          <header>
            <h2 class="font-display text-xl text-cocoa-dark">Titres des pages</h2>
            <p class="text-xs text-muted">Le bandeau en haut de chaque page.</p>
          </header>
          <div v-for="p in PAGES" :key="p.key" class="flex flex-col gap-3 rounded-xl border border-line p-3">
            <h3 class="text-sm font-medium text-cocoa-dark">{{ p.label }}</h3>
            <div class="grid gap-3 sm:grid-cols-2">
              <BaseField v-model="site.pages[p.key].eyebrow" label="Petit titre" @update:model-value="touch" />
              <BaseField v-model="site.pages[p.key].titre" label="Titre" @update:model-value="touch" />
            </div>
            <BaseField v-if="p.intro" v-model="site.pages[p.key].intro" label="Introduction" textarea :rows="2" @update:model-value="touch" />
          </div>
          <BaseField v-model="site.pied.rendezvous" label="Pied de page : texte « Rendez-vous »" textarea :rows="2" @update:model-value="touch" />
        </section>

        <section class="card flex flex-col gap-3 p-4">
          <header class="flex items-center justify-between gap-3">
            <div>
              <h2 class="font-display text-xl text-cocoa-dark">Conditions de rendez-vous</h2>
              <p class="text-xs text-muted">Affichées avant le paiement : la cliente doit les accepter.</p>
            </div>
            <BaseButton variant="secondary" @click="addLine(site.conditions.lines)">Ajouter une condition</BaseButton>
          </header>
          <BaseField v-model="site.conditions.title" label="Titre" @update:model-value="touch" />
          <ul class="flex flex-col gap-3">
            <li v-for="(l, i) in site.conditions.lines" :key="i" class="flex flex-col gap-2 rounded-xl border border-line p-3">
              <BaseField v-model="site.conditions.lines[i]" :label="`Condition ${i + 1}`" textarea :rows="2" @update:model-value="touch" />
              <div class="flex gap-2">
                <BaseButton variant="subtle" :disabled="i === 0" @click="move(site.conditions.lines, i, -1)">Monter</BaseButton>
                <BaseButton variant="subtle" :disabled="i === site.conditions.lines.length - 1" @click="move(site.conditions.lines, i, 1)">Descendre</BaseButton>
                <BaseButton variant="danger" @click="remove(site.conditions.lines, i)">Retirer</BaseButton>
              </div>
            </li>
          </ul>
          <BaseField v-model="site.conditions.accept" label="Phrase de la case à cocher" @update:model-value="touch" />
        </section>

        <section class="card flex flex-col gap-3 p-4">
          <header class="flex items-center justify-between gap-3">
            <div>
              <h2 class="font-display text-xl text-cocoa-dark">Aide : lire les tailles</h2>
              <p class="text-xs text-muted">Affichée au choix du type de locks (micro, small, traditionnelles).</p>
            </div>
            <BaseButton variant="secondary" @click="addLine(site.tailles.lines)">Ajouter une ligne</BaseButton>
          </header>
          <BaseField v-model="site.tailles.title" label="Titre" @update:model-value="touch" />
          <ul class="flex flex-col gap-3">
            <li v-for="(l, i) in site.tailles.lines" :key="i" class="flex flex-col gap-2 rounded-xl border border-line p-3">
              <BaseField v-model="site.tailles.lines[i]" :label="`Ligne ${i + 1}`" textarea :rows="2" @update:model-value="touch" />
              <div class="flex gap-2">
                <BaseButton variant="subtle" :disabled="i === 0" @click="move(site.tailles.lines, i, -1)">Monter</BaseButton>
                <BaseButton variant="subtle" :disabled="i === site.tailles.lines.length - 1" @click="move(site.tailles.lines, i, 1)">Descendre</BaseButton>
                <BaseButton variant="danger" @click="remove(site.tailles.lines, i)">Retirer</BaseButton>
              </div>
            </li>
          </ul>
        </section>

        <section class="card flex flex-col gap-3 p-4">
          <header>
            <h2 class="font-display text-xl text-cocoa-dark">Réparations</h2>
            <p class="text-xs text-muted">Prix « à partir de » de chaque niveau, quel que soit le type de locks.</p>
          </header>
          <p v-if="!catalogue.reparations.length" class="text-sm text-muted">Aucun niveau défini.</p>
          <div v-for="r in catalogue.reparations" :key="r.id" class="flex flex-col gap-3 rounded-xl border border-line p-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <BaseField v-model="r.name" label="Nom" @update:model-value="touch" />
              <BaseField v-model="r.from" type="number" :min="0" :step="500" label="À partir de (FCFA)" @update:model-value="touch" />
            </div>
            <BaseField v-model="r.text" label="Description montrée à la cliente" textarea :rows="2" @update:model-value="touch" />
          </div>
        </section>

        <section class="card flex flex-col gap-3 p-4">
          <header>
            <h2 class="font-display text-xl text-cocoa-dark">Heures proposées selon la cliente</h2>
            <p class="text-xs text-muted">
              Seules les heures libres du calendrier sont montrées. Le nombre de places d’une heure est le nombre d’agents actifs
              en poste (page « Agents & coiffeuses »). Les heures doivent exister dans les créneaux du salon.
            </p>
          </header>
          <div class="grid gap-3 sm:grid-cols-2">
            <BaseField v-for="p in PROFILS" :key="p.key" v-model="heures[p.key]" :label="p.label" :hint="p.hint" placeholder="09:00, 14:30" @update:model-value="touch" />
          </div>
        </section>

        <div class="flex justify-end">
          <BaseButton :loading="saving" :disabled="!dirty" @click="save">Enregistrer</BaseButton>
        </div>
      </div>
    </DataState>
  </div>
</template>
