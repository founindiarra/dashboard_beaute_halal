<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { messages as api } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { MESSAGE_STATUSES, formatDateTime } from '@/utils/format'

const route = useRoute()
const toasts = useToastStore()

const rows = ref([])
const meta = ref(null)
const loading = ref(false)
const error = ref(null)
const page = ref(1)
const status = ref(typeof route.query.status === 'string' ? route.query.status : '')

const STATUS_OPTIONS = [
  { value: '', label: 'Tous les messages' },
  ...Object.entries(MESSAGE_STATUSES).map(([value, { label }]) => ({ value, label })),
]

const statusOf = (value) => MESSAGE_STATUSES[value] ?? { label: value, tone: 'neutral' }

const load = async () => {
  loading.value = true
  error.value = null
  try {
    const result = await api.list({
      status: status.value || undefined,
      page: page.value,
      limit: 25,
    })
    rows.value = result.rows
    meta.value = result.meta
  } catch (caught) {
    error.value = caught?.message || 'Chargement impossible.'
    rows.value = []
  } finally {
    loading.value = false
  }
}
load()

watch(status, () => {
  page.value = 1
  load()
})
watch(page, load)

/* ── Détail ── */
const selected = ref(null)

const open = async (item) => {
  try {
    selected.value = await api.find(item.id)
    // Un message ouvert est considéré comme lu.
    if (item.status === 'new') {
      await api.setStatus(item.id, 'read')
      await load()
    }
  } catch (caught) {
    toasts.error(caught?.message || 'Ouverture impossible.')
  }
}

const setStatus = async (value) => {
  if (!selected.value) return
  try {
    selected.value = await api.setStatus(selected.value.id, value)
    await load()
    toasts.success('Statut mis à jour.')
  } catch (caught) {
    toasts.error(caught?.message || 'Modification impossible.')
  }
}

const mailtoHref = computed(() => {
  const item = selected.value
  if (!item?.email) return null
  const subject = encodeURIComponent('Votre message à Beauté Halal')
  return `mailto:${item.email}?subject=${subject}`
})

/* ── Suppression ── */
const confirmTarget = ref(null)
const busy = ref(false)
const remove = async () => {
  busy.value = true
  try {
    await api.remove(confirmTarget.value.id)
    confirmTarget.value = null
    selected.value = null
    await load()
    toasts.success('Message supprimé.')
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
      title="Messages"
      subtitle="Les demandes envoyées depuis le formulaire de contact du site."
    />

    <div class="card p-3.5 sm:max-w-xs">
      <BaseField v-model="status" label="Filtrer par statut" :options="STATUS_OPTIONS" />
    </div>

    <section class="card overflow-hidden">
      <DataState
        :loading="loading"
        :error="error"
        :empty="!rows.length"
        loading-label="Chargement des messages…"
        :empty-label="status ? 'Aucun message avec ce statut.' : 'Aucun message reçu.'"
        @retry="load"
      >
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Reçu le</th>
                <th>Expéditrice</th>
                <th class="hidden md:table-cell">Message</th>
                <th>Statut</th>
                <th class="w-10"><span class="sr-only">Détail</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in rows"
                :key="item.id"
                class="cursor-pointer"
                :class="item.status === 'new' ? 'font-medium' : ''"
                @click="open(item)"
              >
                <td class="whitespace-nowrap text-xs">{{ formatDateTime(item.createdAt) }}</td>
                <td class="min-w-[10rem]">
                  <span class="block text-cocoa-dark">{{ item.name }}</span>
                  <span class="block max-w-[14rem] truncate text-xs text-muted">
                    {{ item.email }}
                  </span>
                </td>
                <td class="hidden max-w-[26rem] truncate md:table-cell font-normal">
                  {{ item.message }}
                </td>
                <td>
                  <StatusBadge :label="statusOf(item.status).label" :tone="statusOf(item.status).tone" />
                </td>
                <td class="text-right">
                  <AdminIcon name="chevron-right" class="h-4 w-4 text-sand-dark" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="meta && meta.pages > 1"
          class="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted"
        >
          <span>{{ meta.total }} messages · page {{ meta.page }} sur {{ meta.pages }}</span>
          <div class="flex gap-1.5">
            <BaseButton size="sm" variant="secondary" :disabled="page <= 1" @click="page -= 1">
              Précédent
            </BaseButton>
            <BaseButton
              size="sm"
              variant="secondary"
              :disabled="page >= meta.pages"
              @click="page += 1"
            >
              Suivant
            </BaseButton>
          </div>
        </div>
      </DataState>
    </section>

    <BaseModal
      :open="Boolean(selected)"
      :title="selected ? `Message de ${selected.name}` : ''"
      :subtitle="selected ? formatDateTime(selected.createdAt) : ''"
      @close="selected = null"
    >
      <div v-if="selected" class="flex flex-col gap-5">
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="flex items-start gap-2.5 text-sm">
            <AdminIcon name="mail" class="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <a
              :href="`mailto:${selected.email}`"
              class="break-all text-cocoa-dark transition-colors hover:text-gold"
            >
              {{ selected.email }}
            </a>
          </div>
          <div v-if="selected.phone" class="flex items-start gap-2.5 text-sm">
            <AdminIcon name="phone" class="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <a
              :href="`tel:${selected.phone}`"
              class="text-cocoa-dark transition-colors hover:text-gold"
            >
              {{ selected.phone }}
            </a>
          </div>
        </div>

        <div class="rounded-xl bg-ivory/70 p-4">
          <p class="whitespace-pre-line text-sm leading-relaxed text-cocoa">
            {{ selected.message }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <BaseButton
            v-for="(option, key) in MESSAGE_STATUSES"
            :key="key"
            size="sm"
            :variant="selected.status === key ? 'primary' : 'secondary'"
            :disabled="selected.status === key"
            @click="setStatus(key)"
          >
            {{ option.label }}
          </BaseButton>
        </div>
      </div>

      <template #footer>
        <BaseButton variant="ghost" @click="confirmTarget = selected">
          <AdminIcon name="trash" class="h-3.5 w-3.5" />
          Supprimer
        </BaseButton>
        <BaseButton v-if="mailtoHref" variant="secondary" :href="mailtoHref">
          <AdminIcon name="mail" class="h-3.5 w-3.5" />
          Répondre par e-mail
        </BaseButton>
        <BaseButton @click="selected = null">Fermer</BaseButton>
      </template>
    </BaseModal>

    <ConfirmDialog
      :open="Boolean(confirmTarget)"
      :busy="busy"
      title="Supprimer le message"
      :message="`Le message de ${confirmTarget?.name} sera supprimé définitivement.`"
      @confirm="remove"
      @close="confirmTarget = null"
    />
  </div>
</template>
