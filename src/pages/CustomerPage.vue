<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'
import DataState from '@/components/ui/DataState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useResource } from '@/composables/useResource'
import { customers as api, messaging as messagingApi } from '@/services'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toasts'
import {
  formatDateLong,
  formatDateShort,
  formatDateTime,
  formatPrice,
  initialsOf,
  statusOf,
} from '@/utils/format'

/**
 * Fiche d'une cliente : qui elle est, ce qu'elle a fait faire, ce qu'elle a
 * payé, et ce qu'on lui a écrit.
 *
 * Les compteurs — visites, total réglé, dernière venue — ne sont pas des
 * champs de la fiche : ils se déduisent des rendez-vous à chaque lecture. Un
 * compteur tenu à la main finit toujours par mentir, le jour où un
 * rendez-vous est supprimé.
 */
const route = useRoute()
const toasts = useToastStore()
const auth = useAuthStore()

const id = computed(() => Number(route.params.id))
const { data: cliente, loading, error, reload } = useResource(() => api.find(id.value), null)
watch(id, () => reload())

/* ── Modification ── */
const editing = ref(false)
const busy = ref(false)
const formError = ref('')
const form = ref({})

const openEdit = () => {
  formError.value = ''
  form.value = {
    phone: cliente.value.phone,
    firstName: cliente.value.firstName,
    lastName: cliente.value.lastName,
    email: cliente.value.email ?? '',
    birthDate: cliente.value.birthDate ? String(cliente.value.birthDate).slice(0, 10) : '',
    note: cliente.value.note ?? '',
    smsOptIn: cliente.value.smsOptIn,
    emailOptIn: cliente.value.emailOptIn,
    whatsappOptIn: cliente.value.whatsappOptIn !== false,
  }
  editing.value = true
}

const save = async () => {
  formError.value = ''
  busy.value = true
  try {
    await api.update(id.value, {
      phone: form.value.phone.trim(),
      firstName: form.value.firstName.trim(),
      lastName: form.value.lastName.trim(),
      email: form.value.email?.trim() || null,
      birthDate: form.value.birthDate || null,
      note: form.value.note?.trim() || null,
      smsOptIn: Boolean(form.value.smsOptIn),
      emailOptIn: Boolean(form.value.emailOptIn),
      whatsappOptIn: Boolean(form.value.whatsappOptIn),
    })
    editing.value = false
    await reload()
    toasts.success('Fiche mise à jour.')
  } catch (caught) {
    formError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    busy.value = false
  }
}

/* ── Message direct ── */
const messageOpen = ref(false)
const messageForm = ref({ channel: 'sms', subject: '', message: '' })
const apercu = ref(null)
const envoiEnCours = ref(false)

const openMessage = () => {
  messageForm.value = { channel: 'sms', subject: '', message: '' }
  apercu.value = null
  messageOpen.value = true
}

/* Le salon paie au segment : la longueur se voit pendant la frappe. */
let minuteur = null
watch(
  () => messageForm.value.message,
  (texte) => {
    clearTimeout(minuteur)
    if (!texte) {
      apercu.value = null
      return
    }
    minuteur = setTimeout(async () => {
      try {
        apercu.value = await messagingApi.preview(texte)
      } catch {
        apercu.value = null
      }
    }, 250)
  },
)

const envoyer = async () => {
  if (!messageForm.value.message.trim()) return
  envoiEnCours.value = true
  try {
    const issue = await messagingApi.send({
      customerId: id.value,
      channel: messageForm.value.channel,
      subject: messageForm.value.subject?.trim() || null,
      message: messageForm.value.message.trim(),
    })
    messageOpen.value = false
    await reload()
    if (issue.status === 'sent') toasts.success('Message envoyé.')
    else if (issue.status === 'skipped') toasts.info(issue.error || 'Message non envoyé.')
    else toasts.error(issue.error || 'Envoi impossible.')
  } catch (caught) {
    toasts.error(caught?.message || 'Envoi impossible.')
  } finally {
    envoiEnCours.value = false
  }
}

const TONS_MESSAGE = {
  sent: { label: 'Envoyé', tone: 'ok' },
  failed: { label: 'Échec', tone: 'danger' },
  skipped: { label: 'Ignoré', tone: 'neutral' },
  queued: { label: 'En attente', tone: 'warn' },
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <DataState
      :loading="loading"
      :error="error"
      :empty="!loading && !error && !cliente"
      loading-label="Chargement de la fiche…"
      empty-label="Cette cliente est introuvable."
      @retry="reload"
    >
      <div v-if="cliente" class="flex flex-col gap-5">
        <!-- ══ En-tête ══ -->
        <header class="flex flex-col gap-3">
          <RouterLink
            :to="{ name: 'customers' }"
            class="inline-flex w-fit items-center gap-1.5 text-xs text-muted transition-colors hover:text-cocoa-dark"
          >
            <AdminIcon name="arrow-left" class="h-3.5 w-3.5" />
            Clientes
          </RouterLink>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div class="flex min-w-0 items-center gap-3">
              <span class="avatar h-12 w-12 text-sm">{{ initialsOf(cliente) }}</span>
              <div class="min-w-0">
                <h1 class="truncate font-display text-[1.5rem] sm:text-[1.8rem]">
                  {{ cliente.fullName }}
                </h1>
                <p class="truncate text-[0.85rem] text-muted">
                  {{ cliente.phone }}
                  <span v-if="cliente.email"> · {{ cliente.email }}</span>
                </p>
              </div>
            </div>
            <div class="flex shrink-0 flex-wrap items-center gap-2">
              <BaseButton
                v-if="auth.can('messaging')"
                size="sm"
                variant="secondary"
                @click="openMessage"
              >
                <AdminIcon name="send" class="h-3.5 w-3.5" />
                Écrire
              </BaseButton>
              <BaseButton size="sm" @click="openEdit">
                <AdminIcon name="edit" class="h-3.5 w-3.5" />
                Modifier
              </BaseButton>
            </div>
          </div>
        </header>

        <!-- ══ Compteurs ══ -->
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="tuile in [
              { icon: 'check', value: cliente.visits, label: 'Prestations terminées' },
              { icon: 'calendar', value: cliente.upcoming, label: 'Rendez-vous à venir' },
              {
                icon: 'cash',
                value: formatPrice(cliente.totalPaid),
                label: 'Total réglé au salon',
              },
              {
                icon: 'clock',
                value: cliente.lastVisit ? formatDateShort(cliente.lastVisit) : '—',
                label: 'Dernière visite',
              },
            ]"
            :key="tuile.label"
            class="card stat-card"
          >
            <span class="stat-icon"><AdminIcon :name="tuile.icon" class="h-5 w-5" /></span>
            <span class="stat-value text-[1.55rem]">{{ tuile.value }}</span>
            <span class="text-[0.78rem] text-muted">{{ tuile.label }}</span>
          </div>
        </div>

        <div class="grid gap-4 xl:grid-cols-3">
          <!-- ══ Colonne gauche ══ -->
          <div class="flex min-w-0 flex-col gap-4 xl:col-span-2">
            <section class="card overflow-hidden">
              <h2
                class="border-b border-line px-4 py-3 text-xs uppercase tracking-[0.1em] text-muted"
              >
                Historique des visites
              </h2>

              <p
                v-if="!cliente.visitHistory.length"
                class="px-4 py-8 text-center text-sm text-muted"
              >
                Aucun rendez-vous à son nom pour l’instant.
              </p>

              <div v-else class="table-scroll">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Prestation</th>
                      <th class="hidden md:table-cell">Agent · Bureau</th>
                      <th class="hidden sm:table-cell">Réglé</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="visite in cliente.visitHistory" :key="visite.id">
                      <td class="whitespace-nowrap">
                        <RouterLink
                          :to="{ name: 'operation', params: { id: visite.id } }"
                          class="block text-cocoa-dark transition-colors hover:text-gold"
                        >
                          {{ formatDateShort(visite.date) }}
                        </RouterLink>
                        <span class="block text-xs text-muted">{{ visite.time }}</span>
                      </td>
                      <td class="max-w-[13rem]">
                        <span class="block truncate text-cocoa-dark">{{ visite.serviceName }}</span>
                        <span class="block text-xs text-muted">{{ visite.reference }}</span>
                      </td>
                      <td class="hidden md:table-cell">
                        <span class="block text-xs text-cocoa-dark">
                          {{ visite.agentName || '—' }}
                        </span>
                        <span class="block text-xs text-muted">{{ visite.office || '—' }}</span>
                      </td>
                      <td class="hidden whitespace-nowrap sm:table-cell">
                        {{ formatPrice(visite.paid, visite.currency) }}
                        <span v-if="visite.discount > 0" class="block text-[0.7rem] text-muted">
                          − {{ formatPrice(visite.discount, visite.currency) }}
                        </span>
                      </td>
                      <td>
                        <StatusBadge
                          :label="statusOf(visite.status).label"
                          :tone="statusOf(visite.status).tone"
                        />
                        <span
                          v-if="visite.review"
                          class="mt-0.5 flex items-center gap-0.5 text-gold"
                          :title="visite.review.comment"
                        >
                          <AdminIcon
                            v-for="n in 5"
                            :key="n"
                            name="star"
                            class="h-3 w-3"
                            :class="n <= visite.review.rating ? 'fill-current' : 'opacity-30'"
                          />
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <!-- ══ Messages ══ -->
            <section class="card p-4">
              <h2 class="mb-3 text-xs uppercase tracking-[0.1em] text-muted">Messages envoyés</h2>
              <p v-if="!cliente.messages.length" class="text-sm text-muted">
                Aucun message envoyé à cette cliente.
              </p>
              <ul v-else class="flex flex-col divide-y divide-line-soft">
                <li v-for="m in cliente.messages" :key="m.id" class="flex gap-3 py-2.5">
                  <span
                    class="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ivory text-gold"
                  >
                    <AdminIcon :name="m.channel === 'email' ? 'mail' : 'send'" class="h-3.5 w-3.5" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm text-cocoa">{{ m.body }}</span>
                    <span class="mt-0.5 flex flex-wrap items-center gap-2 text-[0.7rem] text-muted">
                      <StatusBadge
                        :label="(TONS_MESSAGE[m.status] || {}).label || m.status"
                        :tone="(TONS_MESSAGE[m.status] || {}).tone || 'neutral'"
                      />
                      {{ formatDateTime(m.createdAt) }} — {{ m.sentByName }}
                      <span v-if="m.error" class="text-danger">{{ m.error }}</span>
                    </span>
                  </span>
                </li>
              </ul>
            </section>
          </div>

          <!-- ══ Colonne droite ══ -->
          <div class="flex min-w-0 flex-col gap-4">
            <section class="card p-4">
              <h2 class="mb-3 text-xs uppercase tracking-[0.1em] text-muted">Coordonnées</h2>
              <dl class="flex flex-col gap-3">
                <div>
                  <dt class="text-xs text-muted">Téléphone — sert de matricule</dt>
                  <dd class="text-sm">
                    <a
                      :href="`tel:${cliente.phone}`"
                      class="text-cocoa-dark transition-colors hover:text-gold"
                    >
                      {{ cliente.phone }}
                    </a>
                  </dd>
                </div>
                <div class="min-w-0">
                  <dt class="text-xs text-muted">E-mail</dt>
                  <dd class="text-sm">
                    <a
                      v-if="cliente.email"
                      :href="`mailto:${cliente.email}`"
                      class="break-all text-cocoa-dark transition-colors hover:text-gold"
                    >
                      {{ cliente.email }}
                    </a>
                    <span v-else class="text-muted">—</span>
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">Date de naissance</dt>
                  <dd class="text-sm" :class="cliente.birthDate ? 'text-cocoa-dark' : 'text-muted'">
                    {{ cliente.birthDate ? formatDateLong(cliente.birthDate) : 'Non renseignée' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-muted">Première venue</dt>
                  <dd class="text-sm text-cocoa-dark">{{ formatDateTime(cliente.firstSeenAt) }}</dd>
                </div>
              </dl>

              <div class="mt-3 flex flex-wrap gap-2 border-t border-line-soft pt-3">
                <StatusBadge
                  :label="cliente.smsOptIn ? 'Accepte les SMS' : 'Refuse les SMS'"
                  :tone="cliente.smsOptIn ? 'ok' : 'neutral'"
                />
                <StatusBadge
                  :label="cliente.emailOptIn ? 'Accepte les e-mails' : 'Refuse les e-mails'"
                  :tone="cliente.emailOptIn ? 'ok' : 'neutral'"
                />
                <StatusBadge
                  :label="cliente.whatsappOptIn !== false ? 'Accepte WhatsApp' : 'Refuse WhatsApp'"
                  :tone="cliente.whatsappOptIn !== false ? 'ok' : 'neutral'"
                />
              </div>
            </section>

            <section v-if="cliente.note" class="card p-4">
              <h2 class="mb-2 text-xs uppercase tracking-[0.1em] text-muted">Note</h2>
              <p class="whitespace-pre-line text-sm text-cocoa">{{ cliente.note }}</p>
            </section>
          </div>
        </div>
      </div>
    </DataState>

    <!-- ══ Modification ══ -->
    <BaseModal :open="editing" title="Modifier la fiche" @close="editing = false">
      <div class="flex flex-col gap-4">
        <p
          v-if="formError"
          class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ formError }}
        </p>

        <BaseField
          v-model="form.phone"
          label="Téléphone"
          type="tel"
          required
          hint="Changer ce numéro change le matricule de la cliente."
        />
        <div class="grid gap-4 sm:grid-cols-2">
          <BaseField v-model="form.firstName" label="Prénom" required />
          <BaseField v-model="form.lastName" label="Nom" required />
          <BaseField v-model="form.email" label="E-mail" type="email" />
          <BaseField v-model="form.birthDate" label="Date de naissance" type="date" />
        </div>
        <BaseField v-model="form.note" label="Note" textarea :rows="3" />
        <BaseToggle v-model="form.smsOptIn" label="Accepte de recevoir des SMS" />
        <BaseToggle v-model="form.emailOptIn" label="Accepte de recevoir des e-mails" />
        <BaseToggle v-model="form.whatsappOptIn" label="Accepte de recevoir des messages WhatsApp" />
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="busy" @click="editing = false">
          Annuler
        </BaseButton>
        <BaseButton :loading="busy" @click="save">Enregistrer</BaseButton>
      </template>
    </BaseModal>

    <!-- ══ Message direct ══ -->
    <BaseModal
      :open="messageOpen"
      title="Écrire à la cliente"
      :subtitle="cliente ? cliente.fullName : ''"
      @close="messageOpen = false"
    >
      <div v-if="cliente" class="flex flex-col gap-4">
        <BaseField
          v-model="messageForm.channel"
          label="Canal"
          :options="[
            { value: 'sms', label: `SMS — ${cliente.phone}` },
            { value: 'email', label: `E-mail — ${cliente.email || 'aucune adresse'}` },
            { value: 'whatsapp', label: `WhatsApp — ${cliente.phone}` },
          ]"
        />

        <BaseField
          v-if="messageForm.channel === 'email'"
          v-model="messageForm.subject"
          label="Objet"
          placeholder="Votre rendez-vous chez Beauté Halal"
        />

        <BaseField
          v-model="messageForm.message"
          label="Message"
          textarea
          :rows="5"
          placeholder="Bonjour, …"
        />

        <!-- Le salon paie au segment : autant le savoir avant d'envoyer. -->
        <p v-if="apercu && messageForm.channel === 'sms'" class="text-xs text-muted">
          {{ apercu.length }} caractères ·
          <span class="text-cocoa-dark">{{ apercu.segments }} SMS facturé(s)</span>
          <span v-if="apercu.unicode">
            · contient des accents, ce qui réduit la taille d’un SMS</span
          >
        </p>

        <p
          v-if="messageForm.channel === 'whatsapp'"
          class="rounded-lg border border-line bg-ivory/70 px-3 py-2 text-xs text-muted"
        >
          WhatsApp n’accepte un texte libre que dans les 24 h qui suivent un message de la
          cliente. Au-delà, l’envoi est refusé et consigné en échec ; les messages automatiques
          (confirmation, rappel…) utilisent des modèles approuvés.
        </p>

        <p
          v-if="messageForm.channel === 'whatsapp' && cliente.whatsappOptIn === false"
          class="rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-xs text-warn"
        >
          Cette cliente a refusé WhatsApp : le message sera enregistré mais pas envoyé.
        </p>

        <p
          v-if="messageForm.channel === 'sms' && !cliente.smsOptIn"
          class="rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-xs text-warn"
        >
          Cette cliente a refusé les SMS : le message sera enregistré mais pas envoyé.
        </p>
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="envoiEnCours" @click="messageOpen = false">
          Annuler
        </BaseButton>
        <BaseButton
          :loading="envoiEnCours"
          :disabled="!messageForm.message.trim()"
          @click="envoyer"
        >
          <AdminIcon name="send" class="h-3.5 w-3.5" />
          Envoyer
        </BaseButton>
      </template>
    </BaseModal>
  </div>
</template>
