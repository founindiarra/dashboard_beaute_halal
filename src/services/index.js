/**
 * Couche API du dashboard — une fonction par endpoint réellement exposé
 * par `backend_beaute_halal`. Aucune route n'est inventée ici : chaque
 * fonction correspond à une route vérifiée dans le code du backend.
 *
 * Convention : toutes les routes d'administration vivent sous `/admin`,
 * protégées par JWT ; seule `/admin/auth/login` est publique.
 */
import { http, saveBlob } from './http.js'

/* ══════════════════════════ Authentification ══════════════════════════ */

export const auth = {
  /** POST /admin/auth/login — public, limité à 10 tentatives / 15 min. */
  login: (email, password) =>
    http.post('/admin/auth/login', { email, password }, { auth: false }).then((r) => r.data),

  /** GET /admin/auth/me */
  me: () => http.get('/admin/auth/me').then((r) => r.data),

  /** POST /admin/auth/change-password */
  changePassword: (currentPassword, newPassword) =>
    http.post('/admin/auth/change-password', { currentPassword, newPassword }).then((r) => r.data),

  /** GET /admin/auth/users — rôle « admin » requis. */
  listUsers: () => http.get('/admin/auth/users').then((r) => r.data ?? []),

  /** POST /admin/auth/users — rôle « admin » requis. */
  createUser: (payload) => http.post('/admin/auth/users', payload).then((r) => r.data),

  /** PATCH /admin/auth/users/:id — rôle « admin » requis. */
  updateUser: (id, payload) => http.patch(`/admin/auth/users/${id}`, payload).then((r) => r.data),

  /** DELETE /admin/auth/users/:id — rôle « admin » requis. */
  deleteUser: (id) => http.delete(`/admin/auth/users/${id}`),
}

/* ════════════════════════════ Tableau de bord ═════════════════════════ */

/** GET /admin/stats */
export const stats = {
  get: () => http.get('/admin/stats').then((r) => r.data),
}

/* ══════════════════════════════ Rendez-vous ═══════════════════════════ */

export const appointments = {
  /**
   * GET /admin/appointments
   * Filtres : status, from, to, search, order ('asc' | 'desc'), page, limit.
   * Renvoie { rows, meta } — meta porte total / page / limit / pages.
   */
  list: (params = {}) =>
    http.get('/admin/appointments', params).then((r) => ({ rows: r.data ?? [], meta: r.meta })),

  /** GET /admin/appointments/:id */
  find: (id) => http.get(`/admin/appointments/${id}`).then((r) => r.data),

  /** PATCH /admin/appointments/:id/status */
  setStatus: (id, status, { cancelReason = null, notify = true } = {}) =>
    http
      .patch(`/admin/appointments/${id}/status`, { status, cancelReason, notify })
      .then((r) => r.data),

  /** PATCH /admin/appointments/:id — date, heure, coordonnées, note, staffId. */
  update: (id, payload) => http.patch(`/admin/appointments/${id}`, payload).then((r) => r.data),

  /**
   * POST /admin/appointments — rendez-vous pris au comptoir.
   *
   * Naît confirmé, avec sa provenance « comptoir ». Le créneau est vérifié
   * comme pour le site ; `force: true` passe outre quand la cliente est
   * devant vous et qu'on assume le dépassement.
   */
  create: (payload) => http.post('/admin/appointments', payload).then((r) => r.data),

  /** DELETE /admin/appointments/:id */
  remove: (id) => http.delete(`/admin/appointments/${id}`),
}

/* ══════════════════════ Prestations et catégories ═════════════════════ */

export const services = {
  /** GET /admin/services — inclut les prestations désactivées. */
  list: () => http.get('/admin/services').then((r) => r.data ?? []),
  find: (id) => http.get(`/admin/services/${id}`).then((r) => r.data),
  create: (payload) => http.post('/admin/services', payload).then((r) => r.data),
  update: (id, payload) => http.patch(`/admin/services/${id}`, payload).then((r) => r.data),
  /** Renvoie 409 si des rendez-vous référencent la prestation. */
  remove: (id) => http.delete(`/admin/services/${id}`),
}

export const serviceCategories = {
  list: () => http.get('/admin/service-categories').then((r) => r.data ?? []),
  create: (payload) => http.post('/admin/service-categories', payload).then((r) => r.data),
  update: (id, payload) =>
    http.patch(`/admin/service-categories/${id}`, payload).then((r) => r.data),
  remove: (id) => http.delete(`/admin/service-categories/${id}`),
}

/* ═══════════════════════ Galerie — « Nos coiffures » ══════════════════ */

export const gallery = {
  list: () => http.get('/admin/gallery').then((r) => r.data ?? []),
  /** `serviceId` relie la coiffure à une prestation réservable (nullable). */
  create: (payload) => http.post('/admin/gallery', payload).then((r) => r.data),
  update: (id, payload) => http.patch(`/admin/gallery/${id}`, payload).then((r) => r.data),
  remove: (id) => http.delete(`/admin/gallery/${id}`),
}

export const galleryCategories = {
  list: () => http.get('/admin/gallery-categories').then((r) => r.data ?? []),
  create: (payload) => http.post('/admin/gallery-categories', payload).then((r) => r.data),
  update: (id, payload) =>
    http.patch(`/admin/gallery-categories/${id}`, payload).then((r) => r.data),
  remove: (id) => http.delete(`/admin/gallery-categories/${id}`),
}

/* ═════════════════════════════════ Avis ═══════════════════════════════ */

export const testimonials = {
  /** GET /admin/testimonials — inclut les avis non publiés. */
  list: () => http.get('/admin/testimonials').then((r) => r.data ?? []),
  create: (payload) => http.post('/admin/testimonials', payload).then((r) => r.data),
  update: (id, payload) => http.patch(`/admin/testimonials/${id}`, payload).then((r) => r.data),
  remove: (id) => http.delete(`/admin/testimonials/${id}`),
}

/* ══════════════ Horaires, créneaux et fermetures exceptionnelles ══════ */

export const schedule = {
  /** GET /admin/opening-hours — les 7 jours, lundi en premier. */
  hours: () => http.get('/admin/opening-hours').then((r) => r.data ?? []),
  /** PUT /admin/opening-hours — envoie le tableau complet des jours. */
  saveHours: (hours) => http.put('/admin/opening-hours', { hours }).then((r) => r.data ?? []),

  slots: () => http.get('/admin/time-slots').then((r) => r.data ?? []),
  createSlot: (payload) => http.post('/admin/time-slots', payload).then((r) => r.data ?? []),
  updateSlot: (id, payload) => http.patch(`/admin/time-slots/${id}`, payload).then((r) => r.data),
  removeSlot: (id) => http.delete(`/admin/time-slots/${id}`),

  closures: () => http.get('/admin/closures').then((r) => r.data ?? []),
  createClosure: (payload) => http.post('/admin/closures', payload).then((r) => r.data),
  removeClosure: (id) => http.delete(`/admin/closures/${id}`),
}

/* ════════════════════════ Paramètres du salon ═════════════════════════ */

export const salon = {
  /** GET /admin/salon — objet brut clé/valeur de la table salon_settings. */
  get: () => http.get('/admin/salon').then((r) => r.data ?? {}),
  /** PUT /admin/salon — n'envoie que les clés modifiées. */
  save: (patch) => http.put('/admin/salon', patch).then((r) => r.data ?? {}),
}

/* ═══════════════════════ Messages du formulaire ═══════════════════════ */

export const messages = {
  list: (params = {}) =>
    http.get('/admin/messages', params).then((r) => ({ rows: r.data ?? [], meta: r.meta })),
  find: (id) => http.get(`/admin/messages/${id}`).then((r) => r.data),
  setStatus: (id, status) => http.patch(`/admin/messages/${id}`, { status }).then((r) => r.data),
  remove: (id) => http.delete(`/admin/messages/${id}`),
}

/* ═══════════════════════ Agents / coiffeuses ══════════════════════════ */

/**
 * Table historique `team_members`, remontée côté admin uniquement.
 * Le site public n'expose plus cette liste : aucune coordonnée d'agent
 * n'est publiée.
 */
export const agents = {
  /** GET /admin/team — agents désactivés compris. */
  list: () => http.get('/admin/team').then((r) => r.data ?? []),
  create: (payload) => http.post('/admin/team', payload).then((r) => r.data),
  update: (id, payload) => http.patch(`/admin/team/${id}`, payload).then((r) => r.data),
  /** Renvoie 409 si l'agent apparaît sur un rendez-vous ou tient un bureau. */
  remove: (id) => http.delete(`/admin/team/${id}`),
}

/* ═════════════════════ Créneaux libres (lecture seule) ════════════════ */

/**
 * Les mêmes créneaux que voit une cliente sur le site.
 *
 * Ces routes sont publiques — c'est volontaire : un créneau libre n'est pas
 * un secret, et le salon a besoin d'exactement la même réponse que le site
 * pour prendre un rendez-vous au comptoir. Deux calculs de disponibilité
 * différents finiraient par se contredire un jour de forte affluence.
 */
export const availability = {
  days: (params = {}) => http.get('/availability/days', params).then((r) => r.data),
  slots: (date, serviceId = null) =>
    http
      .get('/availability/slots', { date, serviceId: serviceId ?? undefined })
      .then((r) => r.data),
}

/* ══════════════════════════ Bureaux / salons ══════════════════════════ */

export const offices = {
  list: () => http.get('/admin/offices').then((r) => r.data ?? []),
  find: (id) => http.get(`/admin/offices/${id}`).then((r) => r.data),
  /** Renvoie 409 si le numéro est déjà pris — il est unique en base. */
  create: (payload) => http.post('/admin/offices', payload).then((r) => r.data),
  update: (id, payload) => http.patch(`/admin/offices/${id}`, payload).then((r) => r.data),
  remove: (id) => http.delete(`/admin/offices/${id}`),
}

/* ════════════════════ Traitement des rendez-vous ══════════════════════ */

/**
 * Le parcours d'un rendez-vous confirmé : présence, bureau, agent,
 * réduction, paiements, fin de prestation.
 *
 * Toutes ces routes renvoient la FICHE COMPLÈTE remise à jour. L'écran n'a
 * donc jamais à recalculer un total ni à deviner un statut : il réaffiche
 * ce que le serveur vient de dire.
 *
 * L'auteur de chaque opération est le compte connecté, déduit du jeton :
 * aucune de ces fonctions n'accepte d'identifiant d'utilisateur.
 */
export const operations = {
  /** GET /admin/operations — confirmés, présents, en cours, terminés. */
  list: (params = {}) =>
    http.get('/admin/operations', params).then((r) => ({ rows: r.data ?? [], meta: r.meta })),

  /** GET /admin/appointments/:id/operation */
  find: (id) => http.get(`/admin/appointments/${id}/operation`).then((r) => r.data),

  discountReasons: () => http.get('/admin/operations/discount-reasons').then((r) => r.data ?? []),

  /** POST …/arrival — « Client présent ». Bureau et agent facultatifs. */
  markPresent: (id, payload = {}) =>
    http.post(`/admin/appointments/${id}/arrival`, payload).then((r) => r.data),

  /** PATCH …/assignment — change le bureau ou l'agent après coup. */
  assign: (id, payload) =>
    http.patch(`/admin/appointments/${id}/assignment`, payload).then((r) => r.data),

  start: (id) => http.post(`/admin/appointments/${id}/start`, {}).then((r) => r.data),

  /** POST …/complete — déclenche le remerciement, SMS et e-mail (une seule fois). */
  complete: (id, { notify = true } = {}) =>
    http.post(`/admin/appointments/${id}/complete`, { notify }).then((r) => r.data),

  setDiscount: (id, payload) =>
    http.put(`/admin/appointments/${id}/discount`, payload).then((r) => r.data),

  addPayment: (id, payload) =>
    http.post(`/admin/appointments/${id}/payments`, payload).then((r) => r.data),

  removePayment: (id, paymentId) =>
    http.delete(`/admin/appointments/${id}/payments/${paymentId}`).then((r) => r.data),
}

/* ═══════════════════ Historique des prestations ═══════════════════════ */

export const history = {
  list: (params = {}) =>
    http.get('/admin/history', params).then((r) => ({ rows: r.data ?? [], meta: r.meta })),
}

/* ══════════════════════ Proformas et reçus (PDF) ══════════════════════ */

export const documents = {
  list: (appointmentId) =>
    http.get(`/admin/appointments/${appointmentId}/documents`).then((r) => r.data ?? []),

  createProforma: (appointmentId) =>
    http.post(`/admin/appointments/${appointmentId}/documents/proforma`, {}).then((r) => r.data),

  /** Refusé tant qu'aucun paiement n'a été enregistré. */
  createReceipt: (appointmentId) =>
    http.post(`/admin/appointments/${appointmentId}/documents/receipt`, {}).then((r) => r.data),

  /**
   * Télécharge le PDF. La route est protégée par le jeton : il faut passer
   * par le client HTTP, un lien direct ne suffirait pas.
   */
  download: async (id, number) => {
    const { data } = await http.get(`/admin/documents/${id}/pdf`, undefined, {
      blob: true,
      timeout: 30000,
    })
    saveBlob(data, `${number || `document-${id}`}.pdf`)
  },
}

/* ═══════════════════════════════ Clientes ═════════════════════════════ */

/**
 * Les fiches clientes.
 *
 * Elles se créent toutes seules : dès qu'un rendez-vous est déposé, le
 * numéro de téléphone sert de matricule et la fiche est ouverte ou
 * retrouvée. Ces routes servent à consulter et à corriger, pas à saisir.
 */
export const customers = {
  list: (params = {}) =>
    http.get('/admin/customers', params).then((r) => ({ rows: r.data ?? [], meta: r.meta })),
  stats: () => http.get('/admin/customers/stats').then((r) => r.data),
  /** Fiche complète : visites, montants et messages envoyés. */
  find: (id) => http.get(`/admin/customers/${id}`).then((r) => r.data),
  birthdays: (date) => http.get('/admin/customers/birthdays', { date }).then((r) => r.data ?? []),
  /**
   * Anniversaires d'aujourd'hui et des jours suivants, pour la cloche.
   * Chaque ligne porte `inDays` : 0 aujourd'hui, 1 demain — rien à
   * recalculer côté écran, et jamais de surprise le jour même.
   */
  upcomingBirthdays: (days = 7) =>
    http.get('/admin/customers/birthdays/upcoming', { days }).then((r) => r.data ?? []),
  create: (payload) => http.post('/admin/customers', payload).then((r) => r.data),
  update: (id, payload) => http.patch(`/admin/customers/${id}`, payload).then((r) => r.data),
  /** Refusé si la cliente a des rendez-vous à son nom. */
  remove: (id) => http.delete(`/admin/customers/${id}`),
}

/* ═════════════════════════════ Comptabilité ═══════════════════════════ */

/**
 * Caisse, banques, dépenses.
 *
 * Réservé à l'administratrice : ces routes renvoient 403 à un compte
 * « Équipe ». Le menu et le routeur le savent déjà, mais c'est le serveur
 * qui refuse.
 *
 * Les encaissements n'apparaissent pas ici en écriture : ils entrent en
 * caisse tout seuls quand une cliente paie, depuis la fiche du rendez-vous.
 */
export const accounting = {
  summary: (params = {}) => http.get('/admin/accounting/summary', params).then((r) => r.data),

  accounts: () => http.get('/admin/accounting/accounts').then((r) => r.data ?? []),
  createAccount: (payload) => http.post('/admin/accounting/accounts', payload).then((r) => r.data),
  updateAccount: (id, payload) =>
    http.patch(`/admin/accounting/accounts/${id}`, payload).then((r) => r.data),
  removeAccount: (id) => http.delete(`/admin/accounting/accounts/${id}`),

  categories: () => http.get('/admin/accounting/categories').then((r) => r.data ?? []),
  createCategory: (payload) =>
    http.post('/admin/accounting/categories', payload).then((r) => r.data),
  updateCategory: (id, payload) =>
    http.patch(`/admin/accounting/categories/${id}`, payload).then((r) => r.data),
  removeCategory: (id) => http.delete(`/admin/accounting/categories/${id}`),

  entries: (params = {}) =>
    http
      .get('/admin/accounting/entries', params)
      .then((r) => ({ rows: r.data ?? [], meta: r.meta })),
  /** Refusée si elle ferait passer le compte sous zéro. */
  addExpense: (payload) => http.post('/admin/accounting/expenses', payload).then((r) => r.data),
  transfer: (payload) => http.post('/admin/accounting/transfers', payload).then((r) => r.data),
  /** Un transfert retire ses deux moitiés ; un encaissement est refusé ici. */
  removeEntry: (id) => http.delete(`/admin/accounting/entries/${id}`),
}

/* ══════════════════════════════ Messagerie ════════════════════════════ */

export const messaging = {
  /** Dit si la passerelle est configurée, et quelle variable manque. */
  status: () => http.get('/admin/messaging/status').then((r) => r.data),
  stats: () => http.get('/admin/messaging/stats').then((r) => r.data),

  /** Essai vers un numéro : renvoie la réponse brute du fournisseur. */
  test: (payload) => http.post('/admin/messaging/test', payload).then((r) => r.data),

  /** Longueur et nombre de segments — le salon paie au segment. */
  preview: (message) => http.post('/admin/messaging/preview', { message }).then((r) => r.data),

  send: (payload) => http.post('/admin/messaging/send', payload).then((r) => r.data),
  campaign: (payload) => http.post('/admin/messaging/campaign', payload).then((r) => r.data),

  logs: (params = {}) =>
    http.get('/admin/messaging/logs', params).then((r) => ({ rows: r.data ?? [], meta: r.meta })),

  birthdays: (date) => http.get('/admin/messaging/birthdays', { date }).then((r) => r.data),
  /** Idempotent : une cliente déjà souhaitée aujourd'hui est ignorée. */
  sendBirthdays: (payload = {}) =>
    http.post('/admin/messaging/birthdays/send', payload).then((r) => r.data),

  /**
   * Rappels de la veille.
   *
   * `reminders()` dit qui reste à prévenir pour une journée ; l'envoi est
   * idempotent — un rendez-vous déjà rappelé est ignoré, le journal faisant
   * foi. Deux clics, ou deux personnes qui cliquent ensemble, ne doublent
   * donc jamais les SMS.
   */
  reminders: (date) => http.get('/admin/messaging/reminders', { date }).then((r) => r.data),
  sendReminders: (payload = {}) =>
    http.post('/admin/messaging/reminders/send', payload).then((r) => r.data),

  /**
   * Les modèles des messages du parcours : confirmation, refus, annulation,
   * rappel, remerciement. Ils se lisent ici et s'enregistrent par
   * `salon.save()` — ce sont des réglages du salon comme les autres.
   */
  templates: () => http.get('/admin/messaging/templates').then((r) => r.data ?? []),
}

/* ══════════════════════════════ Dépôt d'images ════════════════════════════ */

export const uploads = {
  /**
   * POST /admin/uploads — multipart, champ « image ».
   * Renvoie { path, url, filename } ; c'est `path` qu'il faut enregistrer
   * dans les champs `imageUrl`, pas l'URL absolue.
   */
  send: (file) => {
    const form = new FormData()
    form.append('image', file)
    return http.post('/admin/uploads', null, { raw: form, timeout: 60000 }).then((r) => r.data)
  },
  remove: (filename) => http.delete(`/admin/uploads/${encodeURIComponent(filename)}`),
}
