<script setup>
import { computed, ref } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useResource } from '@/composables/useResource'
import { schedule } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { addDays, capitalize, formatDateLong, toDateKey } from '@/utils/format'

/**
 * Fermetures exceptionnelles. L'API gère une date par enregistrement
 * (POST /admin/closures) : une période est donc créée jour par jour,
 * en une série d'appels, sans inventer d'endpoint de plage.
 */
const toasts = useToastStore()
const { data: closures, loading, error, reload } = useResource(schedule.closures, [])

const today = toDateKey()

const sorted = computed(() =>
  [...(closures.value ?? [])].sort((a, b) => String(b.date).localeCompare(String(a.date))),
)

const upcoming = computed(() => sorted.value.filter((c) => String(c.date).slice(0, 10) >= today))
const past = computed(() => sorted.value.filter((c) => String(c.date).slice(0, 10) < today))

const modalOpen = ref(false)
const busy = ref(false)
const formError = ref('')
const progress = ref('')
const form = ref({ from: today, to: today, reason: '' })

const openCreate = () => {
  formError.value = ''
  progress.value = ''
  form.value = { from: today, to: today, reason: '' }
  modalOpen.value = true
}

const dayCount = computed(() => {
  const { from, to } = form.value
  if (!from || !to || to < from) return 0
  let count = 0
  let cursor = from
  while (cursor <= to && count < 366) {
    count += 1
    cursor = addDays(cursor, 1)
  }
  return count
})

const save = async () => {
  formError.value = ''
  if (!form.value.from || !form.value.to) {
    formError.value = 'Indiquez la période.'
    return
  }
  if (form.value.to < form.value.from) {
    formError.value = 'La date de fin précède la date de début.'
    return
  }
  if (dayCount.value > 92) {
    formError.value = 'Période trop longue : 92 jours au maximum en une fois.'
    return
  }

  busy.value = true
  let created = 0
  try {
    let cursor = form.value.from
    while (cursor <= form.value.to) {
      progress.value = `Enregistrement du ${cursor}…`
      // Le backend fait un ON DUPLICATE KEY UPDATE : réenregistrer une date
      // déjà fermée met simplement le motif à jour.
      await schedule.createClosure({ date: cursor, reason: form.value.reason?.trim() || null })
      created += 1
      cursor = addDays(cursor, 1)
    }
    modalOpen.value = false
    await reload()
    toasts.success(`${created} jour${created > 1 ? 's' : ''} de fermeture enregistré${created > 1 ? 's' : ''}.`)
  } catch (caught) {
    formError.value = `${caught?.message || 'Enregistrement impossible.'} ${created} jour(s) ont été enregistrés avant l’erreur.`
    await reload()
  } finally {
    busy.value = false
    progress.value = ''
  }
}

const confirmTarget = ref(null)
const remove = async () => {
  busy.value = true
  try {
    await schedule.removeClosure(confirmTarget.value.id)
    confirmTarget.value = null
    await reload()
    toasts.success('Fermeture supprimée.')
  } catch (caught) {
    toasts.error(caught?.message || 'Suppression impossible.')
    confirmTarget.value = null
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Fermetures exceptionnelles"
      subtitle="Congés, jours fériés, imprévus : ces dates disparaissent du calendrier de réservation."
    >
      <template #actions>
        <BaseButton size="sm" @click="openCreate">
          <AdminIcon name="plus" class="h-3.5 w-3.5" />
          Fermer une période
        </BaseButton>
      </template>
    </PageHeader>

    <DataState
      :loading="loading"
      :error="error"
      :empty="!sorted.length"
      loading-label="Chargement des fermetures…"
      empty-label="Aucune fermeture exceptionnelle."
      empty-hint="Le salon suit uniquement ses horaires hebdomadaires."
      @retry="reload"
    >
      <div class="flex flex-col gap-5">
        <section v-if="upcoming.length" class="card overflow-hidden">
          <header class="border-b border-line px-4 py-2.5">
            <h2 class="text-sm font-medium text-cocoa-dark">À venir</h2>
          </header>
          <ul class="divide-y divide-line-soft">
            <li
              v-for="item in upcoming"
              :key="item.id"
              class="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="text-sm text-cocoa-dark">
                  {{ capitalize(formatDateLong(item.date)) }}
                </p>
                <p class="truncate text-xs text-muted">{{ item.reason || 'Sans motif précisé' }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <StatusBadge label="Fermé" tone="danger" />
                <button
                  type="button"
                  class="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                  aria-label="Supprimer la fermeture"
                  @click="confirmTarget = item"
                >
                  <AdminIcon name="trash" class="h-4 w-4" />
                </button>
              </div>
            </li>
          </ul>
        </section>

        <section v-if="past.length" class="card overflow-hidden">
          <header class="border-b border-line px-4 py-2.5">
            <h2 class="text-sm font-medium text-muted">Passées</h2>
          </header>
          <ul class="divide-y divide-line-soft">
            <li
              v-for="item in past.slice(0, 20)"
              :key="item.id"
              class="flex items-center justify-between gap-3 px-4 py-2.5 opacity-70"
            >
              <div class="min-w-0">
                <p class="text-sm text-cocoa">{{ capitalize(formatDateLong(item.date)) }}</p>
                <p class="truncate text-xs text-muted">{{ item.reason || '—' }}</p>
              </div>
              <button
                type="button"
                class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                aria-label="Supprimer la fermeture"
                @click="confirmTarget = item"
              >
                <AdminIcon name="trash" class="h-4 w-4" />
              </button>
            </li>
          </ul>
        </section>
      </div>
    </DataState>

    <BaseModal :open="modalOpen" title="Fermer une période" size="sm" @close="modalOpen = false">
      <div class="flex flex-col gap-4">
        <p
          v-if="formError"
          class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ formError }}
        </p>

        <div class="grid gap-4 sm:grid-cols-2">
          <BaseField v-model="form.from" label="Du" type="date" required />
          <BaseField v-model="form.to" label="Au" type="date" required />
        </div>

        <BaseField
          v-model="form.reason"
          label="Motif"
          placeholder="Congés annuels, jour férié…"
          hint="Interne : il n’est pas affiché sur le site public."
        />

        <p v-if="dayCount" class="rounded-lg bg-ivory px-3 py-2 text-xs text-cocoa">
          {{ dayCount }} jour{{ dayCount > 1 ? 's' : '' }} seront marqués fermés. Les rendez-vous
          déjà pris sur ces dates ne sont pas annulés automatiquement : vérifiez-les dans
          « Rendez-vous ».
        </p>
        <p v-if="progress" class="text-xs text-muted">{{ progress }}</p>
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="busy" @click="modalOpen = false">
          Annuler
        </BaseButton>
        <BaseButton :loading="busy" @click="save">Enregistrer</BaseButton>
      </template>
    </BaseModal>

    <ConfirmDialog
      :open="Boolean(confirmTarget)"
      :busy="busy"
      title="Supprimer la fermeture"
      :message="`Le ${formatDateLong(confirmTarget?.date)} redeviendra réservable selon les horaires habituels.`"
      confirm-label="Supprimer"
      @confirm="remove"
      @close="confirmTarget = null"
    />
  </div>
</template>
