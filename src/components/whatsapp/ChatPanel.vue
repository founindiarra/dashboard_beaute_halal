<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { whatsappChat as api } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { initialsOf } from '@/utils/format'

/**
 * Discussions WhatsApp : liste des conversations à gauche, chat à droite (une seule colonne sur mobile).
 *
 * Temps réel par synchronisation périodique : le navigateur interroge le BACKEND (jamais le service WhatsApp)
 * avec un curseur ; chaque réponse ne contient que ce qui a changé. Les fusions se font par identifiant, donc
 * un message relu deux fois n'apparaît jamais deux fois. L'envoi est « optimiste » : le message s'affiche tout
 * de suite avec un identifiant client (`clientRef`) ; un renvoi réutilise le même identifiant → aucun doublon.
 */
const props = defineProps({
  /** Le compte WhatsApp du salon est connecté (sinon : lecture seule). */
  connected: { type: Boolean, default: false },
  /** Le service WhatsApp ne répond pas. */
  serviceDown: { type: Boolean, default: false },
})
const emit = defineEmits(['unread'])

const toasts = useToastStore()

const POLL_MS = 4000
const POLL_MAX_MS = 30000
const PAGE = 30

/* ───────────────────────────── État ───────────────────────────── */
const convMap = ref({}) // id → conversation
const total = ref(0)
const loadingList = ref(true)
const listError = ref('')
const search = ref('')
const onlyUnread = ref(false)
const selectedId = ref(null)
const messages = ref([]) // chronologique ; peut contenir des messages locaux (id « tmp- »)
const hasMore = ref(false)
const loadingMessages = ref(false)
const loadingOlder = ref(false)
const messagesError = ref('')
const draft = ref('')
const sendingCount = ref(0)
const unread = ref({ messages: 0, conversations: 0 })
const sync = ref(null)
const networkError = ref(false)
const mobileChatOpen = ref(false)
const scroller = ref(null)
const composer = ref(null)

let cursor = 0
let timer = null
let delay = POLL_MS
let polling = false
let stopped = false
let searchTimer = null

/* ───────────────────────────── Utilitaires ───────────────────────────── */
const time = (value) => {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}
const dayKey = (value) => {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
const dayLabel = (value) => {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (dayKey(d) === dayKey(today)) return 'Aujourd’hui'
  if (dayKey(d) === dayKey(yesterday)) return 'Hier'
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
const listTime = (value) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  if (dayKey(d) === dayKey(new Date())) return time(d)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (dayKey(d) === dayKey(yesterday)) return 'Hier'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}
const stamp = (m) => Date.parse(m.at) || 0
const sortMessages = (list) => list.sort((a, b) => stamp(a) - stamp(b) || (Number(a.id) || Infinity) - (Number(b.id) || Infinity))
const newRef = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

const ERREURS = {
  WHATSAPP_CHAT_OPTED_OUT: 'Cette cliente a refusé les messages WhatsApp : l’envoi est bloqué.',
  WHATSAPP_CHAT_NO_CONSENT: 'Ce numéro ne vous a jamais écrit et n’est pas une cliente enregistrée : l’envoi est bloqué.',
  WHATSAPP_CHAT_NO_PHONE: 'Cette personne n’a pas de numéro exploitable : impossible de lui répondre d’ici.',
  WHATSAPP_CHAT_INVALID_NUMBER: 'Numéro invalide. Utilisez un numéro ivoirien (ex. 07 00 00 00 00).',
  WHATSAPP_CHAT_DISABLED: 'La messagerie WhatsApp est désactivée sur le serveur.',
  not_connected: 'WhatsApp est déconnecté : le message n’est pas parti.',
  UNREACHABLE: 'Le service WhatsApp est injoignable.',
  TIMEOUT: 'Le service WhatsApp n’a pas répondu à temps.',
  RATE_LIMITED: 'Trop d’envois rapprochés. Patientez un instant.',
  NETWORK_ERROR: 'Connexion perdue : le message n’est pas parti.',
}
const erreurTexte = (code) => ERREURS[code] ?? 'Le message n’est pas parti. Réessayez.'

/* ───────────────────────────── Liste ───────────────────────────── */
const normalise = (s) => (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const digits = (s) => (s ?? '').toString().replace(/\D/g, '')

const conversations = computed(() => {
  const q = normalise(search.value.trim())
  const qd = digits(search.value)
  return Object.values(convMap.value)
    .filter((c) => {
      if (onlyUnread.value && !c.unread) return false
      if (!q) return true
      return (
        normalise(c.name).includes(q) ||
        normalise(c.pushName).includes(q) ||
        normalise(c.lastMessage).includes(q) ||
        (qd.length >= 3 && digits(c.phone).includes(qd))
      )
    })
    .sort((a, b) => (Date.parse(b.lastMessageAt) || 0) - (Date.parse(a.lastMessageAt) || 0) || b.rev - a.rev)
})
const selected = computed(() => (selectedId.value ? convMap.value[selectedId.value] ?? null : null))

const mergeConversation = (c) => {
  const old = convMap.value[c.id]
  if (old && old.rev > c.rev) return // version plus ancienne que celle déjà connue
  convMap.value = { ...convMap.value, [c.id]: c }
}

const loadList = async ({ append = false } = {}) => {
  loadingList.value = !append
  listError.value = ''
  try {
    const r = await api.conversations({
      q: search.value.trim() || undefined,
      unread: onlyUnread.value ? '1' : undefined,
      limit: PAGE,
      offset: append ? Object.keys(convMap.value).length : 0,
    })
    if (!append) {
      convMap.value = {}
    }
    r.rows.forEach(mergeConversation)
    total.value = r.meta?.total ?? r.rows.length
    if (r.unread) setUnread(r.unread)
    if (r.sync) sync.value = r.sync
    if (!append || !cursor) cursor = Math.max(cursor, Number(r.cursor) || 0)
  } catch (caught) {
    listError.value = caught?.message || 'Impossible de charger les conversations.'
  } finally {
    loadingList.value = false
  }
}

const setUnread = (u) => {
  unread.value = u
  emit('unread', Number(u.messages) || 0)
}

watch([search, onlyUnread], () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadList(), 300)
})

/* ───────────────────────────── Conversation ouverte ───────────────────────────── */
const scrollBottom = async (smooth = false) => {
  await nextTick()
  const el = scroller.value
  if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}
const nearBottom = () => {
  const el = scroller.value
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 160
}

const mergeMessages = (incoming) => {
  const byId = new Map(messages.value.map((m) => [String(m.id), m]))
  for (const m of incoming) {
    // Un message local (en cours d'envoi) est remplacé par sa version serveur : même clientRef.
    if (m.clientRef) {
      const local = [...byId.values()].find((x) => x.local && x.clientRef === m.clientRef)
      if (local) byId.delete(String(local.id))
    }
    const old = byId.get(String(m.id))
    if (old && old.rev > m.rev) continue
    byId.set(String(m.id), m)
  }
  messages.value = sortMessages([...byId.values()])
}

const markRead = async (id) => {
  const c = convMap.value[id]
  if (!c?.unread) return
  convMap.value = { ...convMap.value, [id]: { ...c, unread: 0 } }
  try {
    const fresh = await api.markRead(id)
    mergeConversation({ ...fresh, rev: Math.max(fresh.rev, c.rev + 1) })
  } catch {
    /* le prochain passage resynchronisera le compteur */
  }
}

const openConversation = async (id) => {
  selectedId.value = id
  mobileChatOpen.value = true
  messages.value = []
  hasMore.value = false
  messagesError.value = ''
  loadingMessages.value = true
  try {
    const page = await api.messages(id, { limit: 40 })
    if (selectedId.value !== id) return
    mergeConversation(page.conversation)
    messages.value = sortMessages(page.messages)
    hasMore.value = page.hasMore
    await scrollBottom()
    markRead(id)
  } catch (caught) {
    messagesError.value = caught?.message || 'Impossible de charger la discussion.'
  } finally {
    loadingMessages.value = false
  }
  await nextTick()
  composer.value?.focus?.()
}

const closeConversation = () => {
  mobileChatOpen.value = false
}

const loadOlder = async () => {
  if (!hasMore.value || loadingOlder.value || !selectedId.value) return
  const first = messages.value.find((m) => !m.local)
  if (!first) return
  loadingOlder.value = true
  const el = scroller.value
  const previousHeight = el?.scrollHeight ?? 0
  try {
    const page = await api.messages(selectedId.value, { before: first.id, limit: 40 })
    mergeMessages(page.messages)
    hasMore.value = page.hasMore
    await nextTick()
    if (el) el.scrollTop = el.scrollHeight - previousHeight // on reste sur le message qu'on lisait
  } catch (caught) {
    toasts.error(caught?.message || 'Historique indisponible.')
  } finally {
    loadingOlder.value = false
  }
}

/* ───────────────────────────── Envoi ───────────────────────────── */
const blocage = computed(() => {
  const c = selected.value
  if (props.serviceDown) return 'Le service WhatsApp est injoignable : l’envoi est désactivé, l’historique reste consultable.'
  if (!props.connected) return 'WhatsApp est déconnecté : l’envoi est désactivé, l’historique reste consultable. Reconnectez le compte dans l’onglet « Connexion ».'
  if (!c) return ''
  if (c.whatsappOptIn === false) return ERREURS.WHATSAPP_CHAT_OPTED_OUT
  if (!c.phone) return ERREURS.WHATSAPP_CHAT_NO_PHONE
  return ''
})
const canSend = computed(() => !blocage.value && draft.value.trim().length > 0 && draft.value.length <= 4000)

const localMessage = (conversationId, text, clientRef) => ({
  id: `tmp-${clientRef}`,
  local: true,
  conversationId,
  direction: 'out',
  origin: 'dashboard',
  text,
  mediaType: null,
  status: 'sending',
  error: null,
  at: new Date().toISOString(),
  clientRef,
  rev: 0,
})

const patchLocal = (clientRef, patch) => {
  messages.value = messages.value.map((m) => (m.local && m.clientRef === clientRef ? { ...m, ...patch } : m))
}

const deliver = async (conversationId, text, clientRef) => {
  sendingCount.value += 1
  try {
    const { message } = await api.send(conversationId, { text, clientRef })
    if (selectedId.value === conversationId) mergeMessages([message])
  } catch (caught) {
    // Rien n'est parti (refus, réseau…) : le message reste visible, « Échec », avec renvoi possible (même clientRef).
    patchLocal(clientRef, { status: 'failed', error: caught?.code ?? 'NETWORK_ERROR' })
  } finally {
    sendingCount.value -= 1
  }
}

const send = async () => {
  if (!canSend.value || !selectedId.value) return
  const text = draft.value.trim()
  const clientRef = newRef()
  const conversationId = selectedId.value
  draft.value = ''
  messages.value = sortMessages([...messages.value, localMessage(conversationId, text, clientRef)])
  await scrollBottom(true)
  await deliver(conversationId, text, clientRef)
  if (selectedId.value === conversationId) await scrollBottom(true)
}

const retry = async (m) => {
  if (blocage.value) return
  if (m.local) {
    patchLocal(m.clientRef, { status: 'sending', error: null })
    await deliver(m.conversationId, m.text, m.clientRef)
    return
  }
  const id = m.id
  messages.value = messages.value.map((x) => (x.id === id ? { ...x, status: 'sending', error: null } : x))
  try {
    const { message } = await api.retry(id)
    mergeMessages([message])
  } catch (caught) {
    messages.value = messages.value.map((x) => (x.id === id ? { ...x, status: 'failed', error: caught?.code ?? 'NETWORK_ERROR' } : x))
    toasts.error(erreurTexte(caught?.code))
  }
}

const onKey = (event) => {
  // Entrée envoie, Maj+Entrée passe à la ligne ; pas d'envoi pendant une saisie IME.
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    send()
  }
}

/* ───────────────────────────── Nouvelle discussion ───────────────────────────── */
const newOpen = ref(false)
const newForm = ref({ phone: '', text: '' })
const newError = ref('')
const newBusy = ref(false)
let newRefId = newRef()

const openNew = () => {
  newForm.value = { phone: '', text: '' }
  newError.value = ''
  newRefId = newRef()
  newOpen.value = true
}
const startNew = async () => {
  if (newBusy.value) return
  newError.value = ''
  newBusy.value = true
  try {
    // Même clientRef si l'on rejoue : jamais deux premiers messages.
    const r = await api.start({ phone: newForm.value.phone.trim(), text: newForm.value.text.trim(), clientRef: newRefId })
    newOpen.value = false
    mergeConversation(r.conversation)
    await openConversation(r.conversation.id)
  } catch (caught) {
    newError.value = ERREURS[caught?.code] ?? caught?.message ?? erreurTexte(caught?.code)
  } finally {
    newBusy.value = false
  }
}
const newValid = computed(() => digits(newForm.value.phone).length >= 8 && newForm.value.text.trim().length > 0)

/* ───────────────────────────── Synchronisation périodique ───────────────────────────── */
const poll = async () => {
  if (polling || stopped) return
  polling = true
  try {
    const r = await api.updates(cursor)
    networkError.value = false
    delay = POLL_MS
    sync.value = r.sync
    setUnread(r.unread)
    r.conversations.forEach(mergeConversation)
    if (r.messages.length && selectedId.value) {
      const mine = r.messages.filter((m) => m.conversationId === selectedId.value)
      if (mine.length) {
        const stick = nearBottom()
        mergeMessages(mine)
        if (stick) scrollBottom(true)
        if (mine.some((m) => m.direction === 'in' && m.status === 'received')) markRead(selectedId.value)
      }
    }
    cursor = Math.max(cursor, Number(r.cursor) || 0)
    if (r.more) delay = 300 // il en reste : on enchaîne sans attendre
    total.value = Math.max(total.value, Object.keys(convMap.value).length)
  } catch {
    networkError.value = true
    delay = Math.min(delay * 2, POLL_MAX_MS) // erreur réseau : on espace les tentatives
  } finally {
    polling = false
    schedule()
  }
}
const schedule = () => {
  clearTimeout(timer)
  if (stopped) return
  timer = setTimeout(() => (document.hidden ? schedule() : poll()), delay)
}
const onVisible = () => {
  if (!document.hidden) {
    delay = POLL_MS
    clearTimeout(timer)
    poll() // retour sur l'onglet : on rattrape tout de suite
  }
}

onMounted(async () => {
  await loadList()
  schedule()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onVisible)
})
onBeforeUnmount(() => {
  stopped = true
  clearTimeout(timer)
  clearTimeout(searchTimer)
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('online', onVisible)
})

/* ───────────────────────────── Affichage ───────────────────────────── */
const rows = computed(() => {
  const out = []
  let last = ''
  for (const m of messages.value) {
    const k = dayKey(m.at)
    if (k !== last) {
      out.push({ type: 'day', key: `d-${k}-${m.id}`, label: dayLabel(m.at) })
      last = k
    }
    out.push({ type: 'msg', key: String(m.id), m })
  }
  return out
})

const MEDIA = { image: 'Image', video: 'Vidéo', audio: 'Message vocal', document: 'Document', sticker: 'Autocollant', location: 'Position', contact: 'Contact' }
const mediaLabel = (m) => (m.mediaType ? `${MEDIA[m.mediaType] ?? 'Pièce jointe'} — non affiché ici, à ouvrir sur le téléphone du salon` : '')
const ORIGINES = { auto: 'Message automatique', phone: 'Envoyé depuis le téléphone du salon' }
const STATUTS = {
  sending: 'Envoi en cours…',
  sent: 'Envoyé',
  delivered: 'Remis',
  read: 'Lu',
  failed: 'Échec',
}
const ticks = (s) => (s === 'delivered' || s === 'read' ? '✓✓' : s === 'sent' ? '✓' : '')
const syncWarn = computed(() => sync.value && sync.value.ok === false)
const hasSelection = computed(() => Boolean(selected.value))
</script>

<template>
  <section class="card flex h-[calc(100dvh-15rem)] min-h-[30rem] overflow-hidden" aria-label="Discussions WhatsApp">
    <!-- ───────── Colonne gauche : conversations ───────── -->
    <aside
      class="flex w-full flex-col border-line md:w-[22rem] md:shrink-0 md:border-r"
      :class="mobileChatOpen ? 'hidden md:flex' : 'flex'"
    >
      <div class="flex flex-col gap-2 border-b border-line p-3">
        <div class="flex items-center gap-2">
          <div class="relative min-w-0 flex-1">
            <AdminIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input v-model="search" type="search" class="input pl-9" placeholder="Nom ou numéro…" aria-label="Rechercher une conversation" />
          </div>
          <BaseButton size="sm" variant="secondary" aria-label="Nouvelle discussion" @click="openNew">
            <AdminIcon name="plus" class="h-4 w-4" />
          </BaseButton>
        </div>
        <div class="flex gap-2 text-sm">
          <button
            type="button"
            class="rounded-full border px-3 py-1 transition"
            :class="!onlyUnread ? 'border-transparent bg-cocoa-dark text-white' : 'border-line bg-white text-cocoa-dark hover:border-cocoa-dark'"
            @click="onlyUnread = false"
          >
            Toutes
          </button>
          <button
            type="button"
            class="rounded-full border px-3 py-1 transition"
            :class="onlyUnread ? 'border-transparent bg-cocoa-dark text-white' : 'border-line bg-white text-cocoa-dark hover:border-cocoa-dark'"
            @click="onlyUnread = true"
          >
            Non lues<span v-if="unread.conversations"> ({{ unread.conversations }})</span>
          </button>
        </div>
      </div>

      <p v-if="listError" class="m-3 rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
        {{ listError }}
        <button type="button" class="underline" @click="loadList()">Réessayer</button>
      </p>
      <p v-else-if="loadingList" class="p-4 text-sm text-muted">Chargement des conversations…</p>
      <p v-else-if="!conversations.length" class="p-4 text-sm text-muted">
        <template v-if="search || onlyUnread">Aucune conversation ne correspond.</template>
        <template v-else>Aucune conversation pour le moment. Elles apparaissent dès qu’une personne écrit au salon.</template>
      </p>

      <ul v-else class="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        <li v-for="c in conversations" :key="c.id">
          <button
            type="button"
            class="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-ivory"
            :class="c.id === selectedId ? 'bg-ivory' : ''"
            @click="openConversation(c.id)"
          >
            <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sand font-display text-cocoa-dark" aria-hidden="true">
              {{ initialsOf(c.name) }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-baseline justify-between gap-2">
                <span class="truncate" :class="c.unread ? 'font-semibold text-cocoa-dark' : 'text-cocoa-dark'">{{ c.name }}</span>
                <span class="shrink-0 text-xs" :class="c.unread ? 'text-ok' : 'text-muted'">{{ listTime(c.lastMessageAt) }}</span>
              </span>
              <span class="flex items-center justify-between gap-2">
                <span class="truncate text-sm text-muted">
                  <template v-if="c.lastDirection === 'out'">Vous : </template>{{ c.lastMessage || '…' }}
                </span>
                <span
                  v-if="c.unread"
                  class="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-ok px-1.5 text-xs font-semibold text-white"
                  :aria-label="`${c.unread} message(s) non lu(s)`"
                >
                  {{ c.unread > 99 ? '99+' : c.unread }}
                </span>
              </span>
            </span>
          </button>
        </li>
        <li v-if="Object.keys(convMap).length < total" class="p-3 text-center">
          <BaseButton variant="subtle" size="sm" @click="loadList({ append: true })">Afficher plus</BaseButton>
        </li>
      </ul>
    </aside>

    <!-- ───────── Partie droite : chat ───────── -->
    <div class="min-w-0 flex-1 flex-col" :class="mobileChatOpen ? 'flex' : 'hidden md:flex'">
      <div v-if="!hasSelection" class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted">
        <AdminIcon name="send" class="h-8 w-8" />
        <p class="font-display text-lg text-cocoa-dark">Discussions WhatsApp</p>
        <p class="max-w-sm text-sm">Choisissez une conversation à gauche pour lire l’historique et répondre.</p>
        <p v-if="blocage" class="max-w-sm rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-sm text-warn" role="status">{{ blocage }}</p>
      </div>

      <template v-else>
        <header class="flex items-center gap-3 border-b border-line px-3 py-2.5">
          <button type="button" class="rounded-full p-2 hover:bg-ivory md:hidden" aria-label="Retour aux conversations" @click="closeConversation">
            <AdminIcon name="arrow-left" class="h-5 w-5" />
          </button>
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sand font-display text-cocoa-dark" aria-hidden="true">
            {{ initialsOf(selected.name) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium text-cocoa-dark">{{ selected.name }}</p>
            <p class="truncate text-xs text-muted">
              {{ selected.phoneDisplay || 'Numéro non disponible' }}
              <template v-if="!selected.isCustomer"> · Non enregistrée</template>
            </p>
          </div>
          <BaseButton v-if="selected.isCustomer" size="sm" variant="secondary" :to="{ name: 'customer', params: { id: selected.customerId } }">
            Fiche cliente
          </BaseButton>
        </header>

        <p v-if="blocage" class="border-b border-warn/25 bg-warn-bg px-3 py-2 text-sm text-warn" role="status">{{ blocage }}</p>
        <p v-if="networkError" class="border-b border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
          Connexion au serveur perdue : nouvelle tentative automatique. Les messages déjà affichés restent visibles.
        </p>
        <p v-else-if="syncWarn" class="border-b border-warn/25 bg-warn-bg px-3 py-2 text-sm text-warn" role="status">
          La réception des nouveaux messages est momentanément interrompue (service WhatsApp). Ils seront récupérés dès son retour.
        </p>

        <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto bg-ivory px-3 py-3" role="log" aria-live="polite" aria-label="Messages">
          <p v-if="loadingMessages" class="py-6 text-center text-sm text-muted">Chargement de la discussion…</p>
          <p v-else-if="messagesError" class="py-6 text-center text-sm text-danger" role="alert">
            {{ messagesError }} <button type="button" class="underline" @click="openConversation(selectedId)">Réessayer</button>
          </p>
          <template v-else>
            <div v-if="hasMore" class="pb-3 text-center">
              <BaseButton size="sm" variant="subtle" :loading="loadingOlder" @click="loadOlder">Messages plus anciens</BaseButton>
            </div>
            <p v-if="!rows.length" class="py-6 text-center text-sm text-muted">Aucun message dans cette discussion.</p>
            <template v-for="row in rows" :key="row.key">
              <p v-if="row.type === 'day'" class="my-3 text-center">
                <span class="rounded-full bg-white px-3 py-1 text-xs text-muted shadow-sm">{{ row.label }}</span>
              </p>
              <div v-else class="mb-1.5 flex" :class="row.m.direction === 'out' ? 'justify-end' : 'justify-start'">
                <div
                  class="max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[70%]"
                  :class="[
                    row.m.direction === 'out' ? 'rounded-br-sm bg-[#dcf8c6] text-cocoa-dark' : 'rounded-bl-sm bg-white text-cocoa-dark',
                    row.m.status === 'failed' ? 'ring-1 ring-danger' : '',
                  ]"
                >
                  <p v-if="ORIGINES[row.m.origin] && row.m.direction === 'out'" class="mb-0.5 text-[0.7rem] italic text-muted">{{ ORIGINES[row.m.origin] }}</p>
                  <p v-if="row.m.mediaType" class="mb-1 rounded bg-black/5 px-2 py-1 text-xs text-muted">{{ mediaLabel(row.m) }}</p>
                  <p v-if="row.m.text" class="whitespace-pre-wrap break-words">{{ row.m.text }}</p>
                  <p class="mt-0.5 flex items-center justify-end gap-1.5 text-[0.7rem] text-muted">
                    <span>{{ time(row.m.at) }}</span>
                    <template v-if="row.m.direction === 'out'">
                      <span v-if="row.m.status === 'sending'" role="status">{{ STATUTS.sending }}</span>
                      <span v-else-if="row.m.status === 'failed'" class="font-medium text-danger">{{ STATUTS.failed }}</span>
                      <span v-else :class="row.m.status === 'read' ? 'text-info' : ''" :title="STATUTS[row.m.status]">{{ ticks(row.m.status) }}</span>
                    </template>
                  </p>
                  <p v-if="row.m.status === 'failed'" class="mt-1 flex flex-wrap items-center justify-end gap-2 text-xs text-danger">
                    <span>{{ erreurTexte(row.m.error) }}</span>
                    <button type="button" class="rounded border border-danger px-2 py-0.5 font-medium hover:bg-danger-bg disabled:opacity-50" :disabled="Boolean(blocage)" @click="retry(row.m)">
                      Réessayer
                    </button>
                  </p>
                </div>
              </div>
            </template>
          </template>
        </div>

        <form class="flex items-end gap-2 border-t border-line bg-white p-2.5" @submit.prevent="send">
          <textarea
            ref="composer"
            v-model="draft"
            rows="1"
            maxlength="4000"
            class="input max-h-36 min-h-[42px] flex-1 resize-none"
            :placeholder="blocage ? 'Envoi indisponible' : 'Écrire un message…'"
            :disabled="Boolean(blocage)"
            aria-label="Votre message"
            @keydown="onKey"
          />
          <BaseButton type="submit" :disabled="!canSend" aria-label="Envoyer">
            <AdminIcon name="send" class="h-4 w-4" />
            <span class="hidden sm:inline">Envoyer</span>
          </BaseButton>
        </form>
      </template>
    </div>

    <!-- ───────── Nouvelle discussion ───────── -->
    <BaseModal :open="newOpen" title="Nouvelle discussion" size="sm" @close="newOpen = false">
      <form class="flex flex-col gap-3" @submit.prevent="startNew">
        <p class="text-xs text-muted">
          Autorisé uniquement vers une cliente enregistrée qui accepte WhatsApp, ou une personne qui a déjà écrit au salon. Numéros ivoiriens.
        </p>
        <BaseField v-model="newForm.phone" label="Numéro WhatsApp" type="tel" placeholder="07 00 00 00 00" autocomplete="off" required />
        <BaseField v-model="newForm.text" label="Message" textarea :rows="4" required />
        <p v-if="newError" class="text-sm text-danger" role="alert">{{ newError }}</p>
      </form>
      <template #footer>
        <BaseButton variant="secondary" :disabled="newBusy" @click="newOpen = false">Annuler</BaseButton>
        <BaseButton :loading="newBusy" :disabled="!newValid || !connected || serviceDown" @click="startNew">Envoyer</BaseButton>
      </template>
    </BaseModal>
  </section>
</template>
