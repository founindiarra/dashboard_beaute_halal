<script setup>
import { computed, ref, watch } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useResource } from '@/composables/useResource'
import { salon as api } from '@/services'
import { useToastStore } from '@/stores/toasts'

/**
 * Paramètres du salon — table `salon_settings`, en clé/valeur.
 * Les clés listées ici sont EXACTEMENT celles acceptées en écriture par
 * `PUT /admin/salon` : toute autre clé serait refusée par le schéma strict
 * du backend. Aucune seconde table de paramètres n'est créée.
 */
const toasts = useToastStore()
const { data: settings, loading, error, reload } = useResource(api.get, {})

const GROUPS = [
  {
    title: 'Identité',
    icon: 'settings',
    fields: [
      { key: 'name', label: 'Nom du salon', placeholder: 'Beauté Halal' },
      { key: 'specialty', label: 'Spécialité', placeholder: 'Spécialiste des locks' },
      { key: 'tagline', label: 'Accroche', placeholder: 'Affichée sous le nom, sur l’accueil' },
      {
        key: 'short_description',
        label: 'Description courte',
        textarea: true,
        hint: 'Visible dans le pied de page du site public.',
      },
    ],
  },
  {
    title: 'Contact',
    icon: 'phone',
    fields: [
      { key: 'phone_display', label: 'Téléphone affiché', placeholder: '+225 01 02 03 04 05' },
      {
        key: 'phone_href',
        label: 'Lien téléphone',
        placeholder: 'tel:+2250102030405',
        hint: 'Format « tel: » sans espaces — c’est ce qui compose le numéro.',
      },
      { key: 'email', label: 'Adresse e-mail', placeholder: 'contact@beaute-halal.ci' },
      {
        key: 'whatsapp_number',
        label: 'Numéro WhatsApp',
        placeholder: '2250102030405',
        hint: 'Format international, sans « + » ni espaces. Vide = boutons WhatsApp désactivés.',
      },
      {
        key: 'whatsapp_default_message',
        label: 'Message WhatsApp par défaut',
        textarea: true,
        hint: 'Pré-rempli quand une cliente ouvre la conversation.',
      },
    ],
  },
  {
    title: 'Adresse',
    icon: 'grid',
    fields: [
      { key: 'address_line1', label: 'Adresse, ligne 1' },
      { key: 'address_line2', label: 'Adresse, ligne 2' },
      { key: 'address_city', label: 'Ville', placeholder: 'Abidjan' },
      { key: 'address_country', label: 'Pays', placeholder: 'Côte d’Ivoire' },
      { key: 'address_note', label: 'Précision d’accès', hint: 'Repère, étage, interphone…' },
      {
        key: 'map_embed_url',
        label: 'Carte — adresse d’intégration',
        hint: 'URL « embed » de Google Maps. Vide = la carte n’est pas affichée.',
      },
    ],
  },
  {
    title: 'Réseaux sociaux',
    icon: 'link',
    fields: [
      { key: 'social_instagram', label: 'Instagram', placeholder: 'https://instagram.com/…' },
      { key: 'social_facebook', label: 'Facebook', placeholder: 'https://facebook.com/…' },
      { key: 'social_tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@…' },
    ],
  },
  {
    title: 'Réservation',
    icon: 'calendar',
    fields: [
      { key: 'currency', label: 'Devise', placeholder: 'FCFA' },
      {
        key: 'booking_window_days',
        label: 'Fenêtre de réservation (jours)',
        type: 'number',
        hint: 'Nombre de jours à l’avance proposés dans le calendrier.',
      },
    ],
  },
]

const ALL_KEYS = GROUPS.flatMap((group) => group.fields.map((field) => field.key))

const draft = ref({})
const original = ref({})
const busy = ref(false)
const formError = ref('')

watch(settings, (value) => {
  const source = value ?? {}
  const next = {}
  ALL_KEYS.forEach((key) => {
    next[key] = source[key] ?? ''
  })
  draft.value = { ...next }
  original.value = { ...next }
})

/** On n'envoie que ce qui a changé : le backend refuse un corps vide. */
const changedKeys = computed(() =>
  ALL_KEYS.filter((key) => String(draft.value[key] ?? '') !== String(original.value[key] ?? '')),
)

const save = async () => {
  formError.value = ''
  if (!changedKeys.value.length) return

  busy.value = true
  try {
    const patch = {}
    changedKeys.value.forEach((key) => {
      patch[key] = String(draft.value[key] ?? '')
    })
    await api.save(patch)
    await reload()
    toasts.success('Paramètres enregistrés.')
  } catch (caught) {
    formError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}

const revert = () => {
  draft.value = { ...original.value }
  formError.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Paramètres du salon"
      subtitle="Coordonnées, adresse et réseaux affichés sur le site public."
    >
      <template #actions>
        <BaseButton
          v-if="changedKeys.length"
          variant="ghost"
          size="sm"
          :disabled="busy"
          @click="revert"
        >
          Annuler les modifications
        </BaseButton>
        <BaseButton size="sm" :disabled="!changedKeys.length" :loading="busy" @click="save">
          Enregistrer
          <span v-if="changedKeys.length">({{ changedKeys.length }})</span>
        </BaseButton>
      </template>
    </PageHeader>

    <DataState
      :loading="loading"
      :error="error"
      loading-label="Chargement des paramètres…"
      @retry="reload"
    >
      <div class="flex flex-col gap-4">
        <p
          v-if="formError"
          class="rounded-lg border border-danger/25 bg-danger-bg px-3.5 py-2.5 text-sm text-danger"
          role="alert"
        >
          {{ formError }}
        </p>

        <section v-for="group in GROUPS" :key="group.title" class="card overflow-hidden">
          <header class="flex items-center gap-2.5 border-b border-line px-4 py-3">
            <span class="grid h-8 w-8 place-items-center rounded-lg bg-ivory text-gold">
              <AdminIcon :name="group.icon" class="h-4 w-4" />
            </span>
            <h2 class="text-sm font-medium text-cocoa-dark">{{ group.title }}</h2>
          </header>

          <div class="grid gap-4 p-4 sm:grid-cols-2">
            <div
              v-for="field in group.fields"
              :key="field.key"
              :class="field.textarea ? 'sm:col-span-2' : ''"
            >
              <BaseField
                v-model="draft[field.key]"
                :label="field.label"
                :type="field.type || 'text'"
                :textarea="Boolean(field.textarea)"
                :rows="2"
                :placeholder="field.placeholder || ''"
                :hint="field.hint || ''"
              />
            </div>
          </div>
        </section>

        <div
          v-if="changedKeys.length"
          class="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-surface px-4 py-3 shadow-[var(--shadow-pop)]"
        >
          <p class="text-sm text-cocoa">
            {{ changedKeys.length }} champ{{ changedKeys.length > 1 ? 's' : '' }} modifié{{
              changedKeys.length > 1 ? 's' : ''
            }}.
          </p>
          <div class="flex gap-2">
            <BaseButton variant="ghost" size="sm" :disabled="busy" @click="revert">
              Annuler
            </BaseButton>
            <BaseButton size="sm" :loading="busy" @click="save">Enregistrer</BaseButton>
          </div>
        </div>
      </div>
    </DataState>
  </div>
</template>
