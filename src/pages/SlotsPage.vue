<script setup>
import { computed, ref } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useResource } from '@/composables/useResource'
import { schedule } from '@/services'
import { useToastStore } from '@/stores/toasts'

const toasts = useToastStore()
const { data: slots, loading, error, reload } = useResource(schedule.slots, [])

const sorted = computed(() =>
  [...(slots.value ?? [])].sort(
    (a, b) => a.position - b.position || a.startTime.localeCompare(b.startTime),
  ),
)

const activeCount = computed(() => (slots.value ?? []).filter((s) => s.isActive).length)

const modalOpen = ref(false)
const editing = ref(null)
const busy = ref(false)
const formError = ref('')
const form = ref({ startTime: '09:00', position: 0, isActive: true })

const openCreate = () => {
  editing.value = null
  formError.value = ''
  form.value = { startTime: '09:00', position: sorted.value.length, isActive: true }
  modalOpen.value = true
}

const openEdit = (item) => {
  editing.value = item
  formError.value = ''
  form.value = { startTime: item.startTime, position: item.position, isActive: item.isActive }
  modalOpen.value = true
}

const save = async () => {
  formError.value = ''
  if (!/^\d{2}:\d{2}$/.test(form.value.startTime)) {
    formError.value = 'Heure invalide. Format attendu : HH:MM.'
    return
  }

  const duplicate = (slots.value ?? []).find(
    (s) => s.startTime === form.value.startTime && s.id !== editing.value?.id,
  )
  if (duplicate) {
    formError.value = 'Ce créneau existe déjà.'
    return
  }

  busy.value = true
  try {
    const payload = {
      startTime: form.value.startTime,
      position: Number(form.value.position) || 0,
      isActive: Boolean(form.value.isActive),
    }
    if (editing.value) await schedule.updateSlot(editing.value.id, payload)
    else await schedule.createSlot(payload)

    modalOpen.value = false
    await reload()
    toasts.success(editing.value ? 'Créneau mis à jour.' : 'Créneau ajouté.')
  } catch (caught) {
    formError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}

const toggleActive = async (item) => {
  try {
    await schedule.updateSlot(item.id, { isActive: !item.isActive })
    await reload()
  } catch (caught) {
    toasts.error(caught?.message || 'Modification impossible.')
  }
}

const confirmTarget = ref(null)
const remove = async () => {
  busy.value = true
  try {
    await schedule.removeSlot(confirmTarget.value.id)
    confirmTarget.value = null
    await reload()
    toasts.success('Créneau supprimé.')
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
      title="Créneaux de réservation"
      :subtitle="`${activeCount} créneau${activeCount > 1 ? 'x' : ''} actif${activeCount > 1 ? 's' : ''}. Ce sont les heures proposées à l’étape « Heure » de la réservation.`"
    >
      <template #actions>
        <BaseButton size="sm" @click="openCreate">
          <AdminIcon name="plus" class="h-3.5 w-3.5" />
          Ajouter un créneau
        </BaseButton>
      </template>
    </PageHeader>

    <DataState
      :loading="loading"
      :error="error"
      :empty="!sorted.length"
      loading-label="Chargement des créneaux…"
      empty-label="Aucun créneau défini."
      empty-hint="Sans créneau actif, aucune réservation n’est possible sur le site."
      @retry="reload"
    >
      <ul class="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <li
          v-for="item in sorted"
          :key="item.id"
          class="card flex items-center justify-between gap-2 p-3"
          :class="item.isActive ? '' : 'opacity-60'"
        >
          <div class="min-w-0">
            <p class="font-display text-xl text-cocoa-dark">{{ item.startTime }}</p>
            <StatusBadge
              :label="item.isActive ? 'Actif' : 'Inactif'"
              :tone="item.isActive ? 'ok' : 'neutral'"
            />
          </div>

          <div class="flex shrink-0 flex-col gap-0.5">
            <button
              type="button"
              class="grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark"
              :aria-label="item.isActive ? 'Désactiver' : 'Activer'"
              @click="toggleActive(item)"
            >
              <AdminIcon :name="item.isActive ? 'eye-off' : 'eye'" class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-ivory hover:text-cocoa-dark"
              aria-label="Modifier"
              @click="openEdit(item)"
            >
              <AdminIcon name="edit" class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-danger-bg hover:text-danger"
              aria-label="Supprimer"
              @click="confirmTarget = item"
            >
              <AdminIcon name="trash" class="h-3.5 w-3.5" />
            </button>
          </div>
        </li>
      </ul>
    </DataState>

    <BaseModal
      :open="modalOpen"
      :title="editing ? 'Modifier le créneau' : 'Ajouter un créneau'"
      size="sm"
      @close="modalOpen = false"
    >
      <div class="flex flex-col gap-4">
        <p
          v-if="formError"
          class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ formError }}
        </p>

        <BaseField v-model="form.startTime" label="Heure de début" type="time" required />
        <BaseField
          v-model="form.position"
          label="Position"
          type="number"
          :min="0"
          hint="Ordre d’affichage dans la grille des créneaux."
        />
        <BaseToggle
          v-model="form.isActive"
          label="Créneau actif"
          hint="Un créneau inactif n’est plus proposé aux clientes."
        />
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="busy" @click="modalOpen = false">
          Annuler
        </BaseButton>
        <BaseButton :loading="busy" @click="save">
          {{ editing ? 'Enregistrer' : 'Ajouter' }}
        </BaseButton>
      </template>
    </BaseModal>

    <ConfirmDialog
      :open="Boolean(confirmTarget)"
      :busy="busy"
      title="Supprimer le créneau"
      :message="`Le créneau de ${confirmTarget?.startTime} ne sera plus proposé. Les rendez-vous déjà pris à cette heure ne sont pas affectés.`"
      @confirm="remove"
      @close="confirmTarget = null"
    />
  </div>
</template>
