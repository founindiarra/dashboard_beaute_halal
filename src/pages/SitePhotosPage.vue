<script setup>
import { computed, ref } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import DataState from '@/components/ui/DataState.vue'
import ImageField from '@/components/ui/ImageField.vue'
import VideoField from '@/components/ui/VideoField.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { SITE_URL } from '@/data/coiffuresSalon'
import { tarifs as api } from '@/services'
import { useToastStore } from '@/stores/toasts'

/**
 * Images des pages du site public : les bannières de chaque page et les photos du salon
 * de la page « À propos ». Stockées dans le catalogue du site (`media`), comme
 * les tarifs : le site les utilise dès l'enregistrement. Champ vide = la photo
 * intégrée au site.
 */
const toasts = useToastStore()

const PAGES = [
  { key: 'home', label: 'Accueil', path: '/' },
  { key: 'services', label: 'Nos services', path: '/services' },
  { key: 'gallery', label: 'Nos coiffures', path: '/galerie' },
  { key: 'about', label: 'À propos', path: '/a-propos' },
  { key: 'booking', label: 'Rendez-vous', path: '/rendez-vous' },
  { key: 'contact', label: 'Contact', path: '/contact' },
]

const catalogue = ref(null)
const loading = ref(false)
const error = ref(null)
const saving = ref(false)
const dirty = ref(false)
const customCount = computed(() => PAGES.filter((p) => catalogue.value?.media?.heroes?.[p.key]?.desktop).length)

const ensure = () => {
  const c = catalogue.value
  c.media ??= {}
  c.media.heroes ??= {}
  for (const { key } of PAGES) {
    c.media.heroes[key] = { desktop: '', mobile: '', ...(c.media.heroes[key] ?? {}) }
    c.media.heroes[key].desktop ??= ''
    c.media.heroes[key].mobile ??= ''
  }
  c.media.heroes.booking.video ??= ''
  c.media.heroes.booking.poster ??= ''
  c.media.aboutPhotos ??= []
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

const touch = () => {
  dirty.value = true
}

const addAbout = () => {
  if (catalogue.value.media.aboutPhotos.length >= 8) return
  catalogue.value.media.aboutPhotos.push('')
  touch()
}
const removeAbout = (i) => {
  catalogue.value.media.aboutPhotos.splice(i, 1)
  touch()
}
const moveAbout = (i, delta) => {
  const list = catalogue.value.media.aboutPhotos
  const target = i + delta
  if (target < 0 || target >= list.length) return
  ;[list[i], list[target]] = [list[target], list[i]]
  touch()
}

const save = async () => {
  saving.value = true
  try {
    // Les cases vides d'une liste de photos n'ont pas de sens : on les retire avant l'envoi.
    catalogue.value.media.aboutPhotos = catalogue.value.media.aboutPhotos.filter(Boolean)
    catalogue.value = await api.save(catalogue.value)
    ensure()
    dirty.value = false
    toasts.success('Images enregistrées. Le site les utilise immédiatement.')
  } catch (caught) {
    const detail = caught?.details?.[0]?.message
    toasts.error(detail ? `${caught.message} (${detail})` : caught?.message || 'Enregistrement impossible.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5 pb-20">
    <PageHeader
      title="Images des pages"
      subtitle="Les grandes photos en haut de chaque page du site et les photos du salon de la page « À propos ». Les coiffures de « Nos coiffures » se gèrent dans Prestations."
    >
      <template #actions>
        <RouterLink :to="{ name: 'services' }" class="panel-link">
          Gérer les coiffures
          <AdminIcon name="arrow-right" class="h-3.5 w-3.5" />
        </RouterLink>
      </template>
    </PageHeader>

    <DataState :loading="loading" :error="error" :empty="!catalogue" loading-label="Chargement des images…" @retry="load">
      <div v-if="catalogue" class="flex flex-col gap-6">
        <!-- Conseil photo -->
        <aside class="flex gap-3 rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm text-cocoa">
          <AdminIcon name="image" class="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <p>
            Pour un beau rendu, utilisez une photo <strong>détourée</strong> (personne seule, fond transparent, PNG ou WebP) :
            le site dessine lui-même le fond marron et les cercles. Une photo avec fond s’affiche comme un rectangle.
            <span class="text-muted">Case vide = la photo intégrée au site.</span>
          </p>
        </aside>

        <!-- Bannières -->
        <section class="flex flex-col gap-3">
          <header class="flex items-end justify-between gap-3">
            <div>
              <h2 class="font-display text-xl text-cocoa-dark">Bannières des pages</h2>
              <p class="text-xs text-muted">Une photo pour ordinateur, une pour mobile (facultative).</p>
            </div>
            <span class="rounded-full bg-ivory px-3 py-1 text-xs text-muted">{{ customCount }} / {{ PAGES.length }} personnalisées</span>
          </header>

          <ul class="grid gap-4 lg:grid-cols-2">
            <li v-for="page in PAGES" :key="page.key" class="card flex flex-col overflow-hidden">
              <header class="flex items-center justify-between gap-3 border-b border-line bg-ivory/60 px-4 py-3">
                <div class="flex items-center gap-2.5">
                  <span class="grid h-8 w-8 place-items-center rounded-lg bg-cocoa-dark text-white">
                    <AdminIcon name="image" class="h-4 w-4" />
                  </span>
                  <div>
                    <p class="font-display text-[1.05rem] leading-tight text-cocoa-dark">{{ page.label }}</p>
                    <a :href="SITE_URL + page.path" target="_blank" rel="noopener noreferrer" class="text-[0.7rem] text-muted underline-offset-2 hover:text-gold hover:underline">
                      Voir la page <span class="sr-only">(nouvel onglet)</span>
                    </a>
                  </div>
                </div>
                <span
                  class="rounded-full px-2.5 py-0.5 text-[0.68rem]"
                  :class="catalogue.media.heroes[page.key].desktop ? 'bg-ok-bg text-ok' : 'bg-ivory text-muted'"
                >
                  {{ catalogue.media.heroes[page.key].desktop ? 'Photo personnalisée' : 'Photo du site' }}
                </span>
              </header>
              <div class="grid gap-4 p-4 sm:grid-cols-2">
                <ImageField
                  v-model="catalogue.media.heroes[page.key].desktop"
                  label="Ordinateur et tablette"
                  hint="Paysage, 2000 × 770 px, sujet à droite."
                  @update:model-value="touch"
                  @error="toasts.error($event)"
                />
                <ImageField
                  v-model="catalogue.media.heroes[page.key].mobile"
                  label="Mobile (facultatif)"
                  hint="Portrait, 900 × 1500 px. Vide = photo ordinateur."
                  @update:model-value="touch"
                  @error="toasts.error($event)"
                />
              </div>
            </li>
          </ul>
        </section>

        <!-- Vidéo de la page Rendez-vous -->
        <section class="flex flex-col gap-3">
          <header>
            <h2 class="font-display text-xl text-cocoa-dark">Vidéo · page Rendez-vous</h2>
            <p class="text-xs text-muted">
              Vidéo ronde en haut de la page de réservation (muette, en boucle). Case vide = la vidéo intégrée au site (TikTok actuelle).
            </p>
          </header>
          <div class="card grid gap-4 p-4 sm:grid-cols-2">
            <VideoField
              v-model="catalogue.media.heroes.booking.video"
              label="Vidéo"
              hint="MP4 ou WebM, carrée de préférence, 40 Mo maximum. Légère = chargement plus rapide."
              @update:model-value="touch"
              @error="toasts.error($event)"
            />
            <ImageField
              v-model="catalogue.media.heroes.booking.poster"
              label="Image d’attente (facultative)"
              hint="Affichée pendant le chargement de la vidéo."
              @update:model-value="touch"
              @error="toasts.error($event)"
            />
          </div>
        </section>

        <!-- Photos À propos -->
        <section class="flex flex-col gap-3">
          <header class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 class="font-display text-xl text-cocoa-dark">Photos du salon · page À propos</h2>
              <p class="text-xs text-muted">
                Elles défilent dans le cercle de la bannière. 8 photos au plus, de préférence en portrait. Aucune = les deux photos du site.
              </p>
            </div>
            <BaseButton variant="secondary" :disabled="catalogue.media.aboutPhotos.length >= 8" @click="addAbout">
              <AdminIcon name="plus" class="h-3.5 w-3.5" />
              Ajouter une photo
            </BaseButton>
          </header>

          <p v-if="!catalogue.media.aboutPhotos.length" class="card px-4 py-6 text-center text-sm text-muted">
            Aucune photo réglée : le site utilise ses deux photos du salon intégrées.
          </p>
          <ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <li v-for="(photo, i) in catalogue.media.aboutPhotos" :key="i" class="card flex flex-col gap-3 p-3">
              <div class="flex items-center justify-between">
                <span class="grid h-6 w-6 place-items-center rounded-full bg-cocoa-dark text-xs text-white">{{ i + 1 }}</span>
                <div class="flex gap-0.5">
                  <button type="button" class="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-ivory hover:text-cocoa-dark disabled:opacity-30" :disabled="i === 0" aria-label="Monter" title="Monter" @click="moveAbout(i, -1)">
                    <AdminIcon name="arrow-left" class="h-4 w-4" />
                  </button>
                  <button type="button" class="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-ivory hover:text-cocoa-dark disabled:opacity-30" :disabled="i === catalogue.media.aboutPhotos.length - 1" aria-label="Descendre" title="Descendre" @click="moveAbout(i, 1)">
                    <AdminIcon name="arrow-right" class="h-4 w-4" />
                  </button>
                  <button type="button" class="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-danger-bg hover:text-danger" aria-label="Retirer" title="Retirer" @click="removeAbout(i)">
                    <AdminIcon name="trash" class="h-4 w-4" />
                  </button>
                </div>
              </div>
              <ImageField
                v-model="catalogue.media.aboutPhotos[i]"
                label="Photo"
                @update:model-value="touch"
                @error="toasts.error($event)"
              />
            </li>
          </ul>
        </section>
      </div>
    </DataState>

    <!-- Barre d'enregistrement toujours visible -->
    <div
      v-if="catalogue"
      class="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:left-[16.5rem]"
    >
      <p class="text-sm" :class="dirty ? 'text-warn' : 'text-muted'" role="status">
        {{ dirty ? 'Modifications non enregistrées.' : 'Tout est enregistré.' }}
      </p>
      <BaseButton :loading="saving" :disabled="!dirty" @click="save">Enregistrer</BaseButton>
    </div>
  </div>
</template>
