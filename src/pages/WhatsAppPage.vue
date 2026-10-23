<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import ChatPanel from '@/components/whatsapp/ChatPanel.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { whatsapp as api } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { formatDateTime } from '@/utils/format'

/**
 * Centre WhatsApp du salon : connexion du compte par QR code, état, déconnexion, journal des envois.
 *
 * Tout passe par le backend (jamais d'appel direct au service). Le QR vit uniquement dans la mémoire de ce
 * composant : ni stockage du navigateur, ni cache, ni journal. Il n'est demandé que lorsque le service dit
 * qu'il en a un (`hasQr`) : ouvrir la page ne fabrique aucun nouveau QR.
 */
const toasts = useToastStore()

const status = ref(null)
const loadError = ref('')
const qr = ref(null) // { dataUrl, expiresAt } — mémoire du composant seulement
const busy = ref(false)
const now = ref(Date.now())

const ETATS = {
  connected: { label: 'Connecté', tone: 'ok' },
  connecting: { label: 'Connexion en cours', tone: 'info' },
  waiting_qr: { label: 'En attente du scan', tone: 'warn' },
  disconnecting: { label: 'Déconnexion en cours', tone: 'info' },
  disconnected: { label: 'Déconnecté', tone: 'neutral' },
  error: { label: 'Erreur', tone: 'danger' },
}
const ERREURS = {
  qr_expired: 'Le QR code a expiré sans être scanné. Générez-en un nouveau.',
  logged_out: 'Le compte a été déconnecté depuis le téléphone. Un nouveau scan est nécessaire.',
  connection_replaced: 'Le compte a été ouvert ailleurs : la connexion de ce serveur a été remplacée.',
  reconnecting: 'La connexion est tombée, nouvelle tentative en cours.',
  reconnect_failed: 'La reconnexion automatique a échoué. Relancez la connexion.',
  open_failed: 'Impossible d’ouvrir la connexion WhatsApp. Réessayez dans un instant.',
  unknown: 'Une erreur est survenue côté WhatsApp.',
}
const SERVICE_ERREURS = {
  UNREACHABLE: 'Le service WhatsApp est injoignable pour le moment.',
  TIMEOUT: 'Le service WhatsApp ne répond pas à temps.',
  AUTH_FAILED: 'Le serveur et le service WhatsApp ne partagent pas le même secret. Contactez la personne qui administre le serveur.',
  NOT_CONFIGURED: 'Le service WhatsApp n’est pas encore configuré sur le serveur.',
  WRONG_PROVIDER: 'Le serveur n’est pas réglé sur la connexion par QR code (WHATSAPP_PROVIDER).',
  SERVICE_ERROR: 'Le service WhatsApp a rencontré une erreur.',
}

const connection = computed(() => status.value?.connection ?? null)
const serviceDown = computed(() => status.value && !status.value.service?.reachable)
const etat = computed(() => ETATS[connection.value?.state] ?? ETATS.error)
const serviceMessage = computed(() => SERVICE_ERREURS[status.value?.service?.error] ?? 'Le service WhatsApp est indisponible.')
const erreurMessage = computed(() => {
  const code = connection.value?.lastError
  if (!code) return ''
  return ERREURS[code] ?? (/^closed_/.test(code) ? ERREURS.unknown : ERREURS.unknown)
})
const isConnected = computed(() => connection.value?.state === 'connected')
const chatConnected = computed(() => !status.value || isConnected.value)
const chatDown = computed(() => Boolean(serviceDown.value))
const tab = ref('discussions') // discussions | connexion
const chatUnread = ref(0)
const isWorking = computed(() => ['connecting', 'waiting_qr'].includes(connection.value?.state))
const secondsLeft = computed(() => (qr.value?.expiresAt ? Math.max(0, Math.round((Date.parse(qr.value.expiresAt) - now.value) / 1000)) : 0))

/* ── Interrogation : 4 s pendant la connexion, 15 s sinon ; arrêt hors page ou onglet masqué. ── */
let timer = null
let tick = null
let fetching = false

const refreshQr = async () => {
  try {
    qr.value = await api.qr()
  } catch (caught) {
    // Pas de QR (expiré, déjà connecté…) : ce n'est pas une panne.
    if (caught?.code !== 'WHATSAPP_NO_QR') loadError.value = caught?.message || ''
    qr.value = null
  }
}

const load = async () => {
  if (fetching) return
  fetching = true
  try {
    status.value = await api.status()
    loadError.value = ''
    const c = status.value.connection
    if (c?.hasQr) {
      // Le service renouvelle le QR toutes les ~20 s : on ne relit que s'il a changé.
      if (!qr.value || qr.value.expiresAt !== c.qrExpiresAt) await refreshQr()
    } else if (qr.value) {
      qr.value = null
    }
  } catch (caught) {
    loadError.value = caught?.message || 'Impossible de contacter le serveur.'
  } finally {
    fetching = false
    schedule()
  }
}

const schedule = () => {
  clearTimeout(timer)
  const delai = isWorking.value ? 4000 : 15000
  timer = setTimeout(() => {
    if (document.hidden) schedule()
    else load()
  }, delai)
}

onMounted(() => {
  load()
  tick = window.setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  window.clearInterval(tick)
  qr.value = null
})

/* ── Actions ── */
const connect = async () => {
  busy.value = true
  try {
    await api.connect()
    await load()
  } catch (caught) {
    toasts.error(caught?.message || 'Connexion impossible.')
  } finally {
    busy.value = false
  }
}

const confirmOpen = ref(false)
const disconnect = async () => {
  busy.value = true
  try {
    await api.disconnect()
    confirmOpen.value = false
    qr.value = null
    toasts.success('WhatsApp est déconnecté. Un nouveau scan sera nécessaire pour le reconnecter.')
    await load()
  } catch (caught) {
    toasts.error(caught?.message || 'Déconnexion impossible.')
    confirmOpen.value = false
  } finally {
    busy.value = false
  }
}

/* ── Message d'essai ── */
const test = ref({ text: '' })
const testing = ref(false)
const sendTest = async () => {
  if (!status.value?.testPhone) return toasts.error('Aucun numéro d’essai n’est configuré sur le serveur.')
  testing.value = true
  try {
    // Le destinataire n'est JAMAIS choisi ici : le serveur envoie au numéro de l'administratrice qu'il connaît.
    const result = await api.testMessage(test.value.text.trim() ? { text: test.value.text.trim() } : {})
    if (result.status === 'sent') toasts.success('Message accepté par WhatsApp (la livraison n’est pas confirmée par le service).')
    else toasts.error(result.error || 'Le message n’est pas parti.')
    loadLogs()
  } catch (caught) {
    toasts.error(caught?.message || 'Essai impossible.')
  } finally {
    testing.value = false
  }
}

/* ── Journal des envois ── */
const logs = ref([])
const logsMeta = ref(null)
const logsError = ref('')
const logsStatus = ref('')
const logsPage = ref(1)
const STATUTS = { queued: { label: 'En attente', tone: 'warn' }, sent: { label: 'Envoyé', tone: 'ok' }, failed: { label: 'Échec', tone: 'danger' }, skipped: { label: 'Ignoré', tone: 'neutral' } }
const KINDS = { appointment: 'Rendez-vous', reminder: 'Rappel', thanks: 'Remerciement', birthday: 'Anniversaire', manual: 'Message manuel', campaign: 'Envoi groupé', test: 'Essai' }

const loadLogs = async () => {
  logsError.value = ''
  try {
    const result = await api.logs({ status: logsStatus.value || undefined, page: logsPage.value, limit: 15 })
    logs.value = result.rows
    logsMeta.value = result.meta
  } catch (caught) {
    logsError.value = caught?.message || 'Journal indisponible.'
  }
}
loadLogs()
const setFilter = (value) => {
  logsStatus.value = value
  logsPage.value = 1
  loadLogs()
}
const goPage = (n) => {
  logsPage.value = n
  loadLogs()
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="WhatsApp" subtitle="Discussions avec les clientes, connexion par QR code, état et journal des envois." />

    <div class="flex gap-2 border-b border-line" role="tablist" aria-label="Sections WhatsApp">
      <button
        v-for="t in [{ v: 'discussions', l: 'Discussions' }, { v: 'connexion', l: 'Connexion et journal' }]"
        :key="t.v"
        type="button"
        role="tab"
        :aria-selected="tab === t.v"
        class="-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition"
        :class="tab === t.v ? 'border-cocoa-dark font-medium text-cocoa-dark' : 'border-transparent text-muted hover:text-cocoa-dark'"
        @click="tab = t.v"
      >
        {{ t.l }}
        <span v-if="t.v === 'discussions' && chatUnread" class="rounded-full bg-ok px-1.5 text-xs font-semibold text-white">{{ chatUnread > 99 ? '99+' : chatUnread }}</span>
      </button>
    </div>

    <ChatPanel v-show="tab === 'discussions'" :connected="chatConnected" :service-down="chatDown" @unread="chatUnread = $event" />

    <p v-if="tab === 'connexion' && loadError && !status" class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
      {{ loadError }}
    </p>

    <template v-if="tab === 'connexion'">
    <section v-if="status" class="card flex flex-col gap-4 p-4">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h2 class="font-display text-xl text-cocoa-dark">Connexion</h2>
          <StatusBadge :label="serviceDown ? 'Service indisponible' : etat.label" :tone="serviceDown ? 'danger' : etat.tone" />
        </div>
        <div class="flex flex-wrap gap-2">
          <BaseButton v-if="!isConnected && !isWorking && !serviceDown && status.configured" :loading="busy" @click="connect">
            {{ connection?.lastError === 'qr_expired' ? 'Générer un nouveau QR' : 'Connecter WhatsApp' }}
          </BaseButton>
          <BaseButton v-if="isConnected || connection?.hasSavedSession" variant="danger" :disabled="busy" @click="confirmOpen = true">
            Déconnecter WhatsApp
          </BaseButton>
        </div>
      </header>

      <p v-if="serviceDown" class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
        {{ serviceMessage }}
        <template v-if="status.missing?.length"> Variables à renseigner côté serveur : {{ status.missing.join(', ') }}.</template>
        Les rendez-vous et les demandes continuent de fonctionner ; les messages WhatsApp échouent et sont notés dans le journal.
      </p>
      <p v-else-if="erreurMessage" class="rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-sm text-warn" role="status">
        {{ erreurMessage }}
      </p>
      <p v-if="!status.enabled" class="rounded-lg border border-line bg-line-soft px-3 py-2 text-sm text-muted">
        L’envoi automatique est désactivé sur le serveur (WHATSAPP_ENABLED) : la connexion peut être préparée, mais aucun message client ne part.
      </p>

      <dl v-if="connection" class="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt class="inline text-muted">Numéro connecté : </dt><dd class="inline">{{ connection.phone || '—' }}</dd></div>
        <div><dt class="inline text-muted">Dernière connexion : </dt><dd class="inline">{{ connection.connectedAt ? formatDateTime(connection.connectedAt) : '—' }}</dd></div>
        <div><dt class="inline text-muted">Session conservée : </dt><dd class="inline">{{ connection.hasSavedSession ? 'Oui (reconnexion sans scan)' : 'Non (un scan sera demandé)' }}</dd></div>
        <div><dt class="inline text-muted">Service : </dt><dd class="inline">Joignable</dd></div>
      </dl>

      <!-- QR : seulement quand le service en a un, jamais conservé -->
      <div v-if="qr && connection?.hasQr" class="flex flex-col items-center gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-start">
        <img :src="qr.dataUrl" alt="QR code à scanner avec WhatsApp" class="h-56 w-56 shrink-0 rounded-lg bg-white p-2" />
        <div class="flex flex-col gap-2 text-sm">
          <p class="font-display text-lg text-cocoa-dark">Scannez ce QR code</p>
          <ol class="list-decimal pl-5 text-cocoa">
            <li>Ouvrez WhatsApp sur le téléphone du salon.</li>
            <li>Allez dans <strong>Appareils connectés</strong> (ou Paramètres → Appareils connectés).</li>
            <li>Touchez <strong>Connecter un appareil</strong> et scannez ce code.</li>
          </ol>
          <p class="text-xs text-muted">
            Ce code se renouvelle automatiquement{{ secondsLeft ? ` (encore ${secondsLeft} s)` : '' }}. Il n’est jamais enregistré dans le navigateur.
          </p>
        </div>
      </div>
      <p v-else-if="isWorking" class="text-sm text-muted">Préparation de la connexion… le QR code s’affiche dans un instant.</p>

      <p class="text-xs text-muted">
        Fermer cette page ne déconnecte rien. « Déconnecter WhatsApp » délie réellement l’appareil du compte et supprime la session
        sur le serveur : un nouveau scan sera alors nécessaire.
      </p>
    </section>

    <section v-if="status && isConnected" class="card flex flex-col gap-3 p-4">
      <h2 class="font-display text-xl text-cocoa-dark">Message d’essai</h2>
      <p v-if="status.testPhone" class="text-xs text-muted">
        Envoie un vrai message depuis le compte connecté, uniquement vers le numéro de l’administratrice enregistré sur le serveur
        (<strong>{{ status.testPhone }}</strong>). Ce numéro ne se choisit pas depuis cette page.
      </p>
      <p v-else class="text-xs text-danger">
        Aucun numéro d’essai n’est configuré sur le serveur (variable <code>ADMIN_TEST_PHONE</code>) : l’essai est désactivé.
      </p>
      <BaseField v-model="test.text" label="Texte (facultatif)" />
      <div><BaseButton :loading="testing" :disabled="!status.testPhone" @click="sendTest">Envoyer l’essai</BaseButton></div>
    </section>

    <section class="card flex flex-col gap-3 p-4">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-display text-xl text-cocoa-dark">Journal des envois</h2>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="f in [{ v: '', l: 'Tous' }, { v: 'sent', l: 'Envoyés' }, { v: 'failed', l: 'Échecs' }, { v: 'skipped', l: 'Ignorés' }]"
            :key="f.v"
            type="button"
            class="rounded-full border px-3 py-1 text-sm transition"
            :class="logsStatus === f.v ? 'border-transparent bg-cocoa-dark text-white' : 'border-line bg-white text-cocoa-dark hover:border-cocoa-dark'"
            @click="setFilter(f.v)"
          >
            {{ f.l }}
          </button>
        </div>
      </header>
      <p class="text-xs text-muted">
        « Envoyé » veut dire accepté par WhatsApp : le service ne confirme pas que le message a été lu ni même reçu. Les numéros sont masqués et le texte des messages n’est pas affiché.
      </p>
      <p v-if="logsError" class="text-sm text-danger" role="alert">{{ logsError }}</p>
      <p v-else-if="!logs.length" class="text-sm text-muted">Aucun envoi WhatsApp pour le moment.</p>
      <ul v-else class="divide-y divide-line">
        <li v-for="l in logs" :key="l.id" class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <div class="min-w-0">
            <p>{{ KINDS[l.kind] ?? l.kind }} · <span class="text-muted">{{ l.recipient }}</span></p>
            <p class="text-xs text-muted">{{ formatDateTime(l.createdAt) }}<template v-if="l.error"> · {{ l.error }}</template></p>
          </div>
          <StatusBadge :label="(STATUTS[l.status] ?? { label: l.status }).label" :tone="(STATUTS[l.status] ?? {}).tone" />
        </li>
      </ul>
      <div v-if="logsMeta && logsMeta.pages > 1" class="flex items-center justify-center gap-3 pt-1 text-sm">
        <BaseButton variant="subtle" :disabled="logsPage <= 1" @click="goPage(logsPage - 1)">Précédent</BaseButton>
        <span class="text-muted">Page {{ logsPage }} / {{ logsMeta.pages }}</span>
        <BaseButton variant="subtle" :disabled="logsPage >= logsMeta.pages" @click="goPage(logsPage + 1)">Suivant</BaseButton>
      </div>
    </section>

    </template>

    <BaseModal :open="confirmOpen" title="Déconnecter WhatsApp ?" size="sm" @close="confirmOpen = false">
      <div class="flex flex-col gap-3 text-sm leading-relaxed text-cocoa">
        <p>
          Le compte du salon sera <strong>délié</strong> de ce serveur et sa session sera <strong>supprimée</strong>. Plus aucun message
          automatique ne partira tant que le QR code n’aura pas été scanné à nouveau.
        </p>
        <p class="text-muted">Ce n’est pas la même chose que fermer cette page ou arrêter le service un instant : ceux-là conservent la session.</p>
      </div>
      <template #footer>
        <BaseButton variant="secondary" :disabled="busy" @click="confirmOpen = false">Annuler</BaseButton>
        <BaseButton variant="danger" :loading="busy" @click="disconnect">Déconnecter le compte</BaseButton>
      </template>
    </BaseModal>
  </div>
</template>
