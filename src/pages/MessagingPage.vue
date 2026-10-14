<script setup>
import { computed, ref, watch } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useResource } from '@/composables/useResource'
import { messaging as api, salon } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { formatDateTime, toDateKey } from '@/utils/format'

/**
 * Messagerie : SMS et e-mails aux clientes.
 *
 * Trois choses à savoir en lisant cet écran.
 *
 *  1. TOUT ENVOI LAISSE UNE TRACE. Le journal du bas dit qui a écrit à qui,
 *     quand, et ce que le fournisseur a répondu. Un SMS « parti » qui n'arrive
 *     jamais se retrouve là, avec le message d'erreur exact.
 *  2. LE SALON PAIE AU SEGMENT. Un SMS de 161 caractères en coûte deux. Le
 *     compteur sous la zone de saisie l'annonce avant l'envoi, pas après.
 *  3. UNE CLIENTE QUI A REFUSÉ LES SMS N'EN REÇOIT PAS. Le serveur la passe
 *     en « ignorée » plutôt que de lui écrire quand même.
 *
 * La passerelle (KYA SMS) se règle dans le fichier .env du serveur, jamais
 * ici : un jeton d'API n'a rien à faire dans une page web. L'écran dit
 * seulement si elle est prête, et laisse faire un essai pour vérifier.
 */
const toasts = useToastStore()

const { data: statut, reload: reloadStatut } = useResource(api.status, null)
const { data: stats, reload: reloadStats } = useResource(api.stats, null)

const smsPret = computed(() => Boolean(statut.value?.sms?.ready))
const manques = computed(() => statut.value?.sms?.missing ?? [])

const STATUTS = {
  sent: { label: 'Envoyé', tone: 'ok' },
  queued: { label: 'En attente', tone: 'info' },
  failed: { label: 'Échec', tone: 'danger' },
  skipped: { label: 'Ignoré', tone: 'neutral' },
}
const statutDe = (valeur) => STATUTS[valeur] ?? { label: valeur, tone: 'neutral' }

/* ══════════════════════════════ Journal ═══════════════════════════════ */

const rows = ref([])
const meta = ref(null)
const loading = ref(false)
const error = ref(null)

const filters = ref({ search: '', channel: '', status: '', page: 1 })

const CANAUX = [
  { value: '', label: 'Tous les canaux' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'E-mail' },
]

const ETATS = [
  { value: '', label: 'Tous les états' },
  { value: 'sent', label: 'Envoyés' },
  { value: 'failed', label: 'En échec' },
  { value: 'skipped', label: 'Ignorés' },
  { value: 'queued', label: 'En attente' },
]

const loadLogs = async () => {
  loading.value = true
  error.value = null
  try {
    const result = await api.logs({
      search: filters.value.search || undefined,
      channel: filters.value.channel || undefined,
      status: filters.value.status || undefined,
      page: filters.value.page,
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

let debounce = null
watch(
  () => filters.value.search,
  () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      filters.value.page = 1
      loadLogs()
    }, 350)
  },
)
watch(
  () => [filters.value.channel, filters.value.status],
  () => {
    filters.value.page = 1
    loadLogs()
  },
)
watch(() => filters.value.page, loadLogs)

loadLogs()

const rafraichir = () => Promise.all([loadLogs(), reloadStats()])

/* ═════════════════════════════ Anniversaires ══════════════════════════ */

const jour = ref(toDateKey())
const anniversaires = ref(null)
const anniversairesBusy = ref(false)

const loadAnniversaires = async () => {
  anniversaires.value = await api.birthdays(jour.value).catch(() => null)
}
loadAnniversaires()
watch(jour, loadAnniversaires)

const clientesDuJour = computed(() => anniversaires.value?.customers ?? [])

const envoyerVoeux = async () => {
  anniversairesBusy.value = true
  try {
    const bilan = await api.sendBirthdays({ date: jour.value })
    await Promise.all([rafraichir(), loadAnniversaires()])
    if (!bilan.total) {
      toasts.info('Aucune cliente à souhaiter aujourd’hui.')
    } else {
      toasts.success(
        `${bilan.sent} vœu(x) envoyé(s)` +
          (bilan.skipped ? `, ${bilan.skipped} ignoré(s)` : '') +
          (bilan.failed ? `, ${bilan.failed} en échec` : '') +
          '.',
      )
    }
  } catch (caught) {
    toasts.error(caught?.message || 'Envoi impossible.')
  } finally {
    anniversairesBusy.value = false
  }
}

/* ══════════════════════════════ Rappels ═══════════════════════════════ */

/**
 * Le rappel de la veille, qui fait le gros du travail contre les absences.
 *
 * Rien ne part tout seul : c'est le salon qui clique, le soir, quand il sait
 * ce que demain contient. L'envoi est idempotent — un rendez-vous déjà
 * rappelé est ignoré côté serveur — donc le bouton peut être cliqué deux
 * fois, ou par deux personnes, sans jamais doubler les SMS.
 */
const jourRappels = ref(demainISO())
const rappels = ref(null)
const rappelsBusy = ref(false)

function demainISO() {
  const jour = new Date()
  jour.setDate(jour.getDate() + 1)
  return toDateKey(jour)
}

const loadRappels = async () => {
  rappels.value = await api.reminders(jourRappels.value).catch(() => null)
}
loadRappels()
watch(jourRappels, loadRappels)

const aRappeler = computed(() => rappels.value?.appointments ?? [])
const resteARappeler = computed(() => rappels.value?.pending ?? 0)

const envoyerRappels = async () => {
  rappelsBusy.value = true
  try {
    const bilan = await api.sendReminders({ date: jourRappels.value })
    await Promise.all([rafraichir(), loadRappels()])
    if (!bilan.total) {
      toasts.info('Tout le monde a déjà été prévenu pour ce jour.')
    } else {
      toasts.success(
        `${bilan.sent} rappel(s) envoyé(s)` +
          (bilan.skipped ? `, ${bilan.skipped} ignoré(s)` : '') +
          (bilan.failed ? `, ${bilan.failed} en échec` : '') +
          '.',
      )
    }
  } catch (caught) {
    toasts.error(caught?.message || 'Envoi impossible.')
  } finally {
    rappelsBusy.value = false
  }
}

/* ══════════════════════ Modèles des messages ══════════════════════════ */

/**
 * Ce que le salon dit, et quand.
 *
 * Cinq moments du parcours, chacun avec son canal et son texte. Tout
 * fonctionne sans rien régler : les valeurs par défaut sont déjà en place.
 * Vider un modèle le remet au défaut plutôt que d'envoyer un message vide.
 */
const modelesOpen = ref(false)
const modeles = ref([])
const modelesBusy = ref(false)
const modelesErreur = ref('')

const ouvrirModeles = async () => {
  modelesErreur.value = ''
  modeles.value = (await api.templates().catch(() => [])).map((m) => ({ ...m }))
  modelesOpen.value = true
}

const enregistrerModeles = async () => {
  modelesBusy.value = true
  modelesErreur.value = ''
  try {
    const patch = {}
    for (const m of modeles.value) {
      patch[`notify_${m.evenement}_enabled`] = m.enabled ? '1' : '0'
      patch[`notify_${m.evenement}_channel`] = m.channel
      patch[`notify_${m.evenement}_template`] = m.template ?? ''
    }
    await salon.save(patch)
    modelesOpen.value = false
    await Promise.all([loadRappels(), loadAnniversaires()])
    toasts.success('Modèles enregistrés.')
  } catch (caught) {
    modelesErreur.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    modelesBusy.value = false
  }
}

const VARIABLES = [
  '{prenom}',
  '{nom}',
  '{date}',
  '{heure}',
  '{prestation}',
  '{reference}',
  '{salon}',
]

/* ═══════════════════════════ Composer un envoi ════════════════════════ */

const composerOpen = ref(false)
const composerBusy = ref(false)
const composerError = ref('')
const composer = ref({})
const apercu = ref(null)
const bilan = ref(null)

const SEGMENTS = [
  { value: 'all', label: 'Toutes les clientes' },
  { value: 'returning', label: 'Les fidèles — au moins deux visites' },
  { value: 'new', label: 'Les nouvelles — une visite au plus' },
  { value: 'birthday', label: 'Anniversaire ce mois-ci' },
]

const ouvrirComposer = () => {
  composerError.value = ''
  bilan.value = null
  apercu.value = null
  composer.value = { channel: 'sms', segment: 'returning', subject: '', message: '' }
  composerOpen.value = true
}

let apercuDebounce = null
watch(
  () => composer.value.message,
  (texte) => {
    clearTimeout(apercuDebounce)
    if (!texte) {
      apercu.value = null
      return
    }
    apercuDebounce = setTimeout(async () => {
      apercu.value = await api.preview(texte).catch(() => null)
    }, 300)
  },
)

const envoyerCampagne = async () => {
  composerError.value = ''
  if (!composer.value.message?.trim()) {
    composerError.value = 'Écrivez le message.'
    return
  }
  if (composer.value.channel === 'email' && !composer.value.subject?.trim()) {
    composerError.value = 'Un e-mail a besoin d’un objet.'
    return
  }

  composerBusy.value = true
  try {
    bilan.value = await api.campaign({
      channel: composer.value.channel,
      segment: composer.value.segment,
      subject: composer.value.subject?.trim() || null,
      message: composer.value.message.trim(),
    })
    await rafraichir()
  } catch (caught) {
    composerError.value = caught?.message || 'Envoi impossible.'
  } finally {
    composerBusy.value = false
  }
}

/* ══════════════════════════════ Essai ═════════════════════════════════ */

const essaiOpen = ref(false)
const essaiBusy = ref(false)
const essai = ref({ to: '', message: '' })
const essaiResultat = ref(null)

const ouvrirEssai = () => {
  essaiResultat.value = null
  essai.value = { to: '', message: '' }
  essaiOpen.value = true
}

const lancerEssai = async () => {
  if (!essai.value.to?.trim()) return
  essaiBusy.value = true
  essaiResultat.value = null
  try {
    essaiResultat.value = await api.test({
      to: essai.value.to.trim(),
      message: essai.value.message?.trim() || undefined,
    })
    await Promise.all([rafraichir(), reloadStatut()])
  } catch (caught) {
    essaiResultat.value = { erreur: caught?.message || 'Essai impossible.' }
  } finally {
    essaiBusy.value = false
  }
}

/* ══════════════════════════ Détail d'un message ═══════════════════════ */

const detail = ref(null)
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Messagerie"
      subtitle="SMS et e-mails aux clientes. Chaque envoi est consigné, réussi ou non."
    >
      <template #actions>
        <BaseButton size="sm" variant="secondary" @click="ouvrirModeles">
          <AdminIcon name="edit" class="h-3.5 w-3.5" />
          Modèles
        </BaseButton>
        <BaseButton size="sm" variant="secondary" @click="ouvrirEssai">
          <AdminIcon name="play" class="h-3.5 w-3.5" />
          Essai
        </BaseButton>
        <BaseButton size="sm" @click="ouvrirComposer">
          <AdminIcon name="send" class="h-3.5 w-3.5" />
          Écrire aux clientes
        </BaseButton>
      </template>
    </PageHeader>

    <!-- ── État de la passerelle ── -->
    <div
      v-if="statut && !smsPret"
      class="card flex flex-col gap-2 border-warn/30 bg-warn-bg/40 p-4 text-sm"
      role="status"
    >
      <p class="font-medium text-cocoa-dark">La passerelle SMS n’est pas encore configurée.</p>
      <p class="text-cocoa">
        Elle se règle dans le fichier <code class="font-mono text-xs">.env</code> du serveur — un
        jeton d’API ne doit jamais passer par le navigateur. Il manque&nbsp;:
      </p>
      <ul class="flex flex-wrap gap-1.5">
        <li
          v-for="manque in manques"
          :key="manque"
          class="rounded-full bg-white px-2.5 py-0.5 font-mono text-[0.7rem] text-cocoa-dark"
        >
          {{ manque }}
        </li>
        <li v-if="!manques.length" class="text-xs text-muted">
          Les variables sont renseignées mais l’envoi est désactivé (<code class="font-mono"
            >SMS_ENABLED</code
          >).
        </li>
      </ul>
      <p class="text-xs text-muted">
        Une fois renseignées, redémarrez le serveur puis faites un essai : la réponse brute du
        fournisseur s’affichera ici, ce qui permet d’ajuster les noms de champs sans toucher au
        code.
      </p>
    </div>

    <div
      v-else-if="statut"
      class="card flex flex-wrap items-center gap-x-5 gap-y-2 p-3.5 text-xs text-muted"
    >
      <span class="flex items-center gap-1.5 text-ok">
        <AdminIcon name="check" class="h-3.5 w-3.5" />
        Passerelle SMS prête
      </span>
      <span v-if="statut.sms.sender">Expéditeur : {{ statut.sms.sender }}</span>
      <span v-if="statut.sms.url" class="truncate">{{ statut.sms.url }}</span>
      <span>{{ statut.email.enabled ? 'E-mails actifs' : 'E-mails désactivés' }}</span>
    </div>

    <!-- ── Compteurs ── -->
    <div v-if="stats" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="tuile in [
          { icon: 'send', value: stats.sent, label: 'Messages envoyés' },
          { icon: 'clock', value: stats.today, label: 'Envoyés aujourd’hui' },
          { icon: 'alert', value: stats.failed, label: 'En échec' },
          { icon: 'ban', value: stats.skipped, label: 'Ignorés (refus ou sans numéro)' },
        ]"
        :key="tuile.label"
        class="card stat-card"
      >
        <span class="stat-icon"><AdminIcon :name="tuile.icon" class="h-5 w-5" /></span>
        <span class="stat-value">{{ tuile.value }}</span>
        <span class="text-[0.78rem] text-muted">{{ tuile.label }}</span>
      </div>
    </div>

    <!-- ── Rappels de la veille ── -->
    <section class="card p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="flex items-center gap-2 text-sm font-semibold text-cocoa-dark">
            <AdminIcon name="bell" class="h-4 w-4 text-gold" />
            Rappels
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            Prévenir la veille, c’est ce qui évite le plus d’absences. Un rendez-vous déjà rappelé
            est ignoré : le bouton peut être cliqué sans crainte.
          </p>
        </div>
        <div class="flex items-end gap-2">
          <BaseField v-model="jourRappels" label="Pour le" type="date" />
          <BaseButton
            size="sm"
            :disabled="!resteARappeler || !rappels?.enabled"
            :loading="rappelsBusy"
            @click="envoyerRappels"
          >
            <AdminIcon name="send" class="h-3.5 w-3.5" />
            Envoyer {{ resteARappeler || '' }}
          </BaseButton>
        </div>
      </div>

      <p v-if="rappels && !rappels.enabled" class="mt-3 text-xs text-warn">
        Les rappels sont désactivés dans les modèles de messages.
      </p>

      <ul v-if="aRappeler.length" class="mt-3 flex flex-col divide-y divide-line">
        <li
          v-for="rdv in aRappeler"
          :key="rdv.id"
          class="flex items-center justify-between gap-3 py-2"
        >
          <span class="flex min-w-0 items-center gap-2.5">
            <span class="w-12 shrink-0 text-xs text-muted">{{ rdv.time }}</span>
            <span class="min-w-0">
              <RouterLink
                :to="{ name: 'operation', params: { id: rdv.id } }"
                class="block truncate text-sm text-cocoa-dark hover:text-gold"
              >
                {{ rdv.fullName }}
              </RouterLink>
              <span class="block truncate text-xs text-muted">
                {{ rdv.service.name }} · {{ rdv.reference }}
              </span>
            </span>
          </span>
          <StatusBadge
            :label="rdv.alreadyReminded ? 'Rappelée' : 'À rappeler'"
            :tone="rdv.alreadyReminded ? 'ok' : 'warn'"
          />
        </li>
      </ul>
      <p v-else class="mt-3 text-sm text-muted">Aucun rendez-vous confirmé ce jour-là.</p>
    </section>

    <!-- ── Anniversaires du jour ── -->
    <section class="card p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="flex items-center gap-2 text-sm font-semibold text-cocoa-dark">
            <AdminIcon name="gift" class="h-4 w-4 text-gold" />
            Anniversaires
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            Une cliente déjà souhaitée dans la journée ne l’est pas deux fois : le bouton peut être
            cliqué sans crainte.
          </p>
        </div>
        <div class="flex items-end gap-2">
          <BaseField v-model="jour" label="Jour" type="date" />
          <BaseButton
            size="sm"
            :disabled="!clientesDuJour.length || !anniversaires?.enabled"
            :loading="anniversairesBusy"
            @click="envoyerVoeux"
          >
            <AdminIcon name="send" class="h-3.5 w-3.5" />
            Envoyer les vœux
          </BaseButton>
        </div>
      </div>

      <p v-if="anniversaires && !anniversaires.enabled" class="mt-3 text-xs text-warn">
        Les vœux d’anniversaire sont désactivés dans les paramètres du salon.
      </p>
      <p v-if="anniversaires && !anniversaires.template" class="mt-1 text-xs text-warn">
        Aucun modèle de message n’est défini : renseignez-le dans les paramètres du salon.
      </p>

      <ul v-if="clientesDuJour.length" class="mt-3 flex flex-wrap gap-1.5">
        <li
          v-for="cliente in clientesDuJour"
          :key="cliente.id"
          class="rounded-full border border-line px-3 py-1 text-[0.72rem] text-cocoa"
        >
          <RouterLink
            :to="{ name: 'customer', params: { id: cliente.id } }"
            class="hover:text-gold"
          >
            {{ cliente.fullName }}
          </RouterLink>
        </li>
      </ul>
      <p v-else class="mt-3 text-sm text-muted">Aucune cliente ne fête son anniversaire ce jour.</p>
    </section>

    <!-- ── Filtres du journal ── -->
    <div class="card flex flex-col gap-3 p-3.5 lg:flex-row lg:items-end">
      <SearchInput
        v-model="filters.search"
        label="Rechercher un message"
        placeholder="Destinataire, contenu…"
      />
      <div class="grid flex-1 gap-3 sm:grid-cols-2">
        <BaseField v-model="filters.channel" label="Canal" :options="CANAUX" />
        <BaseField v-model="filters.status" label="État" :options="ETATS" />
      </div>
    </div>

    <!-- ── Journal ── -->
    <section class="card overflow-hidden">
      <DataState
        :loading="loading"
        :error="error"
        :empty="!rows.length"
        loading-label="Chargement du journal…"
        empty-label="Aucun message envoyé pour l’instant."
        empty-hint="Les confirmations de rendez-vous et les vœux d’anniversaire apparaîtront ici."
        @retry="loadLogs"
      >
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Destinataire</th>
                <th>Message</th>
                <th class="hidden md:table-cell">Motif</th>
                <th>État</th>
                <th class="hidden lg:table-cell">Quand</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="message in rows"
                :key="message.id"
                class="cursor-pointer"
                @click="detail = message"
              >
                <td class="min-w-[9rem]">
                  <span class="block truncate text-cocoa-dark">
                    {{ message.customer?.name || message.recipient }}
                  </span>
                  <!-- Sans fiche cliente, la première ligne est déjà le numéro. -->
                  <span v-if="message.customer" class="block truncate text-xs text-muted">
                    {{ message.recipient }}
                  </span>
                </td>
                <td class="max-w-[18rem] min-w-[10rem]">
                  <span class="block truncate text-xs text-cocoa">{{ message.body }}</span>
                </td>
                <td class="hidden whitespace-nowrap text-xs md:table-cell">
                  {{ message.kindLabel }}
                </td>
                <td>
                  <StatusBadge
                    :label="statutDe(message.status).label"
                    :tone="statutDe(message.status).tone"
                  />
                </td>
                <td class="hidden whitespace-nowrap text-xs lg:table-cell">
                  {{ formatDateTime(message.sentAt || message.createdAt) }}
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
            <BaseButton
              size="sm"
              variant="secondary"
              :disabled="filters.page <= 1"
              @click="filters.page -= 1"
            >
              <AdminIcon name="chevron-left" class="h-3.5 w-3.5" />
              Précédent
            </BaseButton>
            <BaseButton
              size="sm"
              variant="secondary"
              :disabled="filters.page >= meta.pages"
              @click="filters.page += 1"
            >
              Suivant
              <AdminIcon name="chevron-right" class="h-3.5 w-3.5" />
            </BaseButton>
          </div>
        </div>
      </DataState>
    </section>

    <!-- ══════════════════════════ Composer ══════════════════════════ -->
    <BaseModal :open="composerOpen" title="Écrire aux clientes" @close="composerOpen = false">
      <div v-if="bilan" class="flex flex-col gap-3">
        <p class="text-sm text-cocoa">
          {{ bilan.total }} destinataire(s) — <span class="text-ok">{{ bilan.sent }} envoyé(s)</span
          ><template v-if="bilan.skipped">
            · <span class="text-muted">{{ bilan.skipped }} ignoré(s)</span></template
          ><template v-if="bilan.failed">
            · <span class="text-danger">{{ bilan.failed }} en échec</span></template
          >.
        </p>
        <ul
          v-if="bilan.results?.length"
          class="max-h-64 overflow-y-auto rounded-lg border border-line divide-y divide-line"
        >
          <li
            v-for="resultat in bilan.results"
            :key="resultat.customerId"
            class="flex items-center justify-between gap-3 px-3 py-2 text-xs"
          >
            <span class="min-w-0 truncate text-cocoa">{{ resultat.name }}</span>
            <StatusBadge
              :label="statutDe(resultat.status).label"
              :tone="statutDe(resultat.status).tone"
            />
          </li>
        </ul>
        <p class="text-xs text-muted">
          Le détail de chaque envoi, y compris la réponse du fournisseur, est dans le journal.
        </p>
      </div>

      <div v-else class="flex flex-col gap-4">
        <p
          v-if="composerError"
          class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ composerError }}
        </p>

        <div class="grid gap-4 sm:grid-cols-2">
          <BaseField
            v-model="composer.channel"
            label="Canal"
            :options="[
              { value: 'sms', label: 'SMS' },
              { value: 'email', label: 'E-mail' },
            ]"
          />
          <BaseField v-model="composer.segment" label="Destinataires" :options="SEGMENTS" />
        </div>

        <BaseField
          v-if="composer.channel === 'email'"
          v-model="composer.subject"
          label="Objet"
          required
        />

        <BaseField
          v-model="composer.message"
          label="Message"
          textarea
          :rows="5"
          required
          hint="{prenom} et {nom} sont remplacés par ceux de chaque cliente."
        />

        <div
          v-if="apercu"
          class="flex flex-col gap-1.5 rounded-lg bg-ivory px-3 py-2 text-xs text-cocoa"
        >
          <p>
            {{ apercu.length }} caractère(s) ·
            <strong>{{ apercu.segments }} segment(s) SMS</strong> facturé(s) par cliente
          </p>

          <!--
            Le salon paie au segment : dire QUELS caractères coûtent cher vaut
            mieux que dire que le message coûte cher. Une apostrophe courbe
            collée depuis un traitement de texte double la facture sans que
            rien ne se voie à l'écran.
          -->
          <p v-if="apercu.unicode" class="text-warn">
            Des caractères hors de l’alphabet SMS
            <template v-if="apercu.unicodeCharacters?.length">
              (<span
                v-for="(caractere, index) in apercu.unicodeCharacters"
                :key="index"
                class="font-mono"
                >{{ index ? ' ' : '' }}{{ caractere }}</span
              >)
            </template>
            réduisent la place utile de 160 à 70 caractères. Les remplacer (’ par ', À par A) peut
            diviser le coût par deux.
          </p>
          <p v-else-if="apercu.billedCharacters > apercu.length" class="text-muted">
            Les accolades des variables comptent double : {{ apercu.billedCharacters }} caractères
            facturés.
          </p>
        </div>

        <p
          v-if="composer.channel === 'sms' && !smsPret"
          class="rounded-lg border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-cocoa"
        >
          La passerelle SMS n’étant pas configurée, les envois seront consignés en échec.
        </p>
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="composerBusy" @click="composerOpen = false">
          {{ bilan ? 'Fermer' : 'Annuler' }}
        </BaseButton>
        <BaseButton v-if="!bilan" :loading="composerBusy" @click="envoyerCampagne">
          Envoyer
        </BaseButton>
      </template>
    </BaseModal>

    <!-- ══════════════════════════ Essai ══════════════════════════ -->
    <BaseModal :open="essaiOpen" title="Essai d’envoi" size="sm" @close="essaiOpen = false">
      <div class="flex flex-col gap-4">
        <p class="text-sm text-muted">
          Un SMS vers un numéro de votre choix. La réponse exacte du fournisseur s’affiche
          ci-dessous : c’est ce qui permet de régler les noms de champs attendus par la passerelle.
        </p>

        <BaseField
          v-model="essai.to"
          label="Numéro"
          type="tel"
          required
          placeholder="+225 07 00 00 00 01"
        />
        <BaseField
          v-model="essai.message"
          label="Message"
          textarea
          :rows="3"
          hint="Laissez vide pour le message d’essai par défaut."
        />

        <div v-if="essaiResultat" class="flex flex-col gap-2">
          <p v-if="essaiResultat.erreur" class="text-sm text-danger">{{ essaiResultat.erreur }}</p>
          <template v-else>
            <StatusBadge
              :label="statutDe(essaiResultat.result.status).label"
              :tone="statutDe(essaiResultat.result.status).tone"
            />
            <pre
              class="max-h-48 overflow-auto rounded-lg bg-ivory p-3 font-mono text-[0.7rem] whitespace-pre-wrap text-cocoa"
              >{{
                essaiResultat.log?.error ||
                essaiResultat.log?.providerReference ||
                'Aucune réponse du fournisseur.'
              }}</pre>
            <p v-if="essaiResultat.hint" class="text-xs text-muted">{{ essaiResultat.hint }}</p>
          </template>
        </div>
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="essaiBusy" @click="essaiOpen = false">
          Fermer
        </BaseButton>
        <BaseButton :loading="essaiBusy" @click="lancerEssai">Envoyer l’essai</BaseButton>
      </template>
    </BaseModal>

    <!-- ══════════════════════════ Modèles ══════════════════════════ -->
    <BaseModal :open="modelesOpen" title="Modèles de messages" @close="modelesOpen = false">
      <div class="flex flex-col gap-4">
        <p
          v-if="modelesErreur"
          class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ modelesErreur }}
        </p>

        <p class="text-sm text-muted">
          Ce que le salon écrit à la cliente, et à quel moment. Tout fonctionne déjà sans rien
          régler : ces textes sont ceux qui partent aujourd’hui. Vider un modèle le remet à sa
          valeur d’origine.
        </p>

        <p class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>Remplacés automatiquement :</span>
          <code
            v-for="variable in VARIABLES"
            :key="variable"
            class="rounded bg-ivory px-1.5 py-0.5 font-mono text-[0.7rem] text-cocoa-dark"
          >
            {{ variable }}
          </code>
        </p>

        <div
          v-for="modele in modeles"
          :key="modele.evenement"
          class="flex flex-col gap-3 rounded-lg border border-line p-3.5"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-sm font-medium text-cocoa-dark">{{ modele.label }}</span>
            <div class="flex items-center gap-2">
              <BaseToggle v-model="modele.enabled" label="Actif" />
              <select
                v-model="modele.channel"
                class="input h-8 w-auto py-0 text-xs"
                :aria-label="`Canal pour ${modele.label}`"
              >
                <option value="sms">SMS</option>
                <option value="email">E-mail</option>
              </select>
            </div>
          </div>

          <textarea
            v-model="modele.template"
            class="input resize-y text-sm"
            rows="3"
            :disabled="!modele.enabled"
            :aria-label="`Texte pour ${modele.label}`"
          />
        </div>

        <!--
          Les modèles par défaut évitent volontairement l'apostrophe courbe et
          les majuscules accentuées : un seul de ces caractères ferait passer
          le SMS en Unicode, de 160 à 70 caractères utiles, et doublerait la
          facture d'un envoi groupé.
        -->
        <p class="text-xs text-muted">
          Astuce : gardez l’apostrophe droite (’ devient ') et évitez les majuscules accentuées (À,
          É). Un seul de ces caractères réduit un SMS de 160 à 70 caractères utiles.
        </p>
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="modelesBusy" @click="modelesOpen = false">
          Annuler
        </BaseButton>
        <BaseButton :loading="modelesBusy" @click="enregistrerModeles">Enregistrer</BaseButton>
      </template>
    </BaseModal>

    <!-- ══════════════════════════ Détail ══════════════════════════ -->
    <BaseModal :open="Boolean(detail)" title="Message" size="sm" @close="detail = null">
      <div v-if="detail" class="flex flex-col gap-3 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge
            :label="statutDe(detail.status).label"
            :tone="statutDe(detail.status).tone"
          />
          <span class="text-xs text-muted">
            {{ detail.channel === 'sms' ? 'SMS' : 'E-mail' }} · {{ detail.kindLabel }}
          </span>
        </div>

        <dl class="flex flex-col gap-1.5 text-xs">
          <div class="flex justify-between gap-3">
            <dt class="text-muted">Destinataire</dt>
            <dd class="text-right text-cocoa-dark">
              {{ detail.customer?.name || '—' }} · {{ detail.recipient }}
            </dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-muted">Envoyé</dt>
            <dd class="text-right text-cocoa-dark">
              {{ formatDateTime(detail.sentAt || detail.createdAt) }}
            </dd>
          </div>
          <div v-if="detail.sentByName" class="flex justify-between gap-3">
            <dt class="text-muted">Par</dt>
            <dd class="text-right text-cocoa-dark">{{ detail.sentByName }}</dd>
          </div>
        </dl>

        <p v-if="detail.subject" class="font-medium text-cocoa-dark">{{ detail.subject }}</p>
        <p class="rounded-lg bg-ivory px-3 py-2 whitespace-pre-wrap text-cocoa">
          {{ detail.body }}
        </p>

        <p
          v-if="detail.error"
          class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 font-mono text-[0.7rem] whitespace-pre-wrap text-danger"
        >
          {{ detail.error }}
        </p>
      </div>

      <template #footer>
        <BaseButton variant="secondary" @click="detail = null">Fermer</BaseButton>
      </template>
    </BaseModal>
  </div>
</template>
