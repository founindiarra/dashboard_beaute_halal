/** Devise de repli, remplacée par celle renvoyée par l'API. */
export const CURRENCY = 'FCFA'

/** 60000 → « 60 000 FCFA » */
export function formatPrice(value, currency = CURRENCY) {
  if (value === null || value === undefined || value === '') return '—'
  return `${new Intl.NumberFormat('fr-FR').format(Number(value))} ${currency || CURRENCY}`
}

/** 195 → « 3 h 15 » */
export function formatDuration(minutes) {
  if (!minutes) return '—'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} min`
  if (!rest) return `${hours} h`
  return `${hours} h ${`${rest}`.padStart(2, '0')}`
}

/**
 * Les dates de l'API arrivent en « AAAA-MM-JJ » ou en ISO complet.
 * On les lit en heure locale : `new Date('2026-09-16')` serait interprété en
 * UTC et pourrait afficher la veille selon le fuseau de l'utilisateur.
 */
export function toLocalDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const text = String(value)
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return new Date(text)
}

/** Date → « AAAA-MM-JJ », en heure locale. */
export function toDateKey(date = new Date()) {
  const d = toLocalDate(date) ?? new Date()
  const month = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export function addDays(dateKey, days) {
  const date = toLocalDate(dateKey) ?? new Date()
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

/** « mardi 15 septembre 2026 » */
export function formatDateLong(value) {
  const date = toLocalDate(value)
  if (!date) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/** « 15 sept. 2026 » */
export function formatDateShort(value) {
  const date = toLocalDate(value)
  if (!date) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/** « 15 sept. 2026 à 14:32 » — pour les horodatages de création. */
export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function capitalize(value = '') {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Statuts de rendez-vous : libellé français et ton visuel. */
/**
 * L'ordre compte : c'est celui des boutons de décision dans la fiche d'un
 * rendez-vous. « Confirmé » et « Refusé » viennent en premier, ce sont les
 * deux seules réponses possibles à une demande en attente.
 */
export const APPOINTMENT_STATUSES = {
  pending: { label: 'En attente', tone: 'warn' },
  contacted: { label: 'Contactée', tone: 'info' },
  confirmed: { label: 'Confirmé', tone: 'ok' },
  rejected: { label: 'Refusé', tone: 'danger' },
  arrived: { label: 'Cliente arrivée', tone: 'info' },
  in_progress: { label: 'En cours', tone: 'info' },
  completed: { label: 'Terminé', tone: 'info' },
  cancelled: { label: 'Annulé', tone: 'danger' },
  no_show: { label: 'Absente', tone: 'neutral' },
}

/**
 * Les quatre étapes du traitement, dans l'ordre du parcours. C'est cette
 * liste que filtre la page « Rendez-vous confirmés » — les demandes encore
 * en attente relèvent de la page « Rendez-vous ».
 */
export const OPERATION_STATUSES = ['confirmed', 'arrived', 'in_progress', 'completed']

export const PAYMENT_STATUSES = {
  unpaid: { label: 'Non payé', tone: 'warn' },
  partial: { label: 'Partiel', tone: 'info' },
  paid: { label: 'Payé', tone: 'ok' },
}

/** Motifs de réduction — mêmes valeurs que celles acceptées par l'API. */
export const DISCOUNT_REASONS = {
  loyalty: 'Fidélité',
  relationship: 'Relation client',
  gesture: 'Geste commercial',
  partnership: 'Partenariat',
  other: 'Autre',
}

/** « AK » à partir de « Aminata Koné » — tient lieu de photo dans les listes. */
export function initialsOf(value) {
  const nom =
    typeof value === 'string'
      ? value
      : [value?.firstName, value?.lastName].filter(Boolean).join(' ')
  return (
    nom
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  )
}

/** Libellé lisible d'un statut de rendez-vous, même inconnu. */
export const statusOf = (status) =>
  APPOINTMENT_STATUSES[status] ?? { label: status, tone: 'neutral' }

export const paymentStatusOf = (status) =>
  PAYMENT_STATUSES[status] ?? { label: '—', tone: 'neutral' }

export const MESSAGE_STATUSES = {
  new: { label: 'Nouveau', tone: 'warn' },
  read: { label: 'Lu', tone: 'info' },
  archived: { label: 'Archivé', tone: 'neutral' },
}

/* ───────────── Demandes de rendez-vous du site (v3) ───────────── */

export const REQUEST_STATUSES = {
  pending: { label: 'Nouvelle', tone: 'warn' },
  contacted: { label: 'Contactée', tone: 'info' },
  confirmed: { label: 'Confirmée', tone: 'ok' },
  rejected: { label: 'Déclinée', tone: 'danger' },
  cancelled: { label: 'Annulée', tone: 'neutral' },
  completed: { label: 'Terminée', tone: 'info' },
}

/** Statuts qui préviennent la cliente (même table que le backend). */
export const REQUEST_NOTIFIED = ['contacted', 'confirmed', 'rejected']

export const BESOIN_LABELS = { creation: 'Création complète', resserrage: 'Resserrage' }
export const LOCK_TYPE_LABELS = {
  traditionnels: 'Locks traditionnels',
  small: 'Small locks',
  micro: 'Micro-locks',
}
export const VOLUME_LABELS = {
  XS: 'Très peu de volume',
  S: 'Peu de volume',
  M: 'Volume normal',
  L: 'Beau volume',
  XL: 'Volume très important',
}
export const FORMULE_LABELS = {
  complet: 'Resserrage complet',
  racines: 'Reprise de racines seule',
  reparation: 'Réparation',
}
export const DELAI_LABELS = {
  avance: 'En avance',
  standard: 'Dans les temps',
  retard: 'En retard',
  'tres-retard': 'Très en retard',
}
export const ETAT_LABELS = { bon: 'Bon état', moyen: 'État moyen', important: 'Dégât important' }

/** Numéro au format international sans « + » (225…), pour un lien WhatsApp. */
export function whatsappNumber(phone = '') {
  const digits = String(phone).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('00225')) return digits.slice(2)
  if (digits.startsWith('225') && digits.length >= 11) return digits
  return digits.length >= 11 ? digits : `225${digits}`
}

export const CHANNEL_LABELS = { sms: 'SMS', email: 'E-mail', whatsapp: 'WhatsApp' }

/** Montant en FCFA : « 22 000 FCFA ». */
export const formatFcfa = (value) =>
  `${new Intl.NumberFormat('fr-FR').format(Number(value) || 0).replace(/\u202f|\u00a0/g, ' ')} FCFA`
