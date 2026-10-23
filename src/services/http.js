/**
 * Point d'entrée réseau UNIQUE du dashboard.
 * Aucun `fetch` ne doit être écrit ailleurs dans le projet.
 *
 * Toutes les routes visées sont celles de l'API existante `backend_beaute_halal`.
 * Le dashboard n'accède jamais à la base directement.
 */

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/+$/, '')

const DEFAULT_TIMEOUT = 15000

/** Clé du jeton en mémoire de navigateur. Aucun mot de passe n'est stocké. */
const TOKEN_KEY = 'bh_admin_token'

export { BASE_URL }

/* ─────────────────────────── Jeton d'authentification ─────────────────────── */

let memoryToken = null

export function getToken() {
  if (memoryToken) return memoryToken
  try {
    memoryToken = localStorage.getItem(TOKEN_KEY)
  } catch {
    // Navigation privée ou stockage bloqué : on reste en mémoire seule.
    memoryToken = null
  }
  return memoryToken
}

export function setToken(token) {
  memoryToken = token || null
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Sans stockage, la session dure le temps de l'onglet : acceptable.
  }
}

/**
 * Prévient l'application qu'une session n'est plus valide.
 * Le store d'authentification s'y abonne pour rediriger vers la connexion.
 */
const expiryHandlers = new Set()
export function onSessionExpired(handler) {
  expiryHandlers.add(handler)
  return () => expiryHandlers.delete(handler)
}

/* ────────────────────────────── Erreurs ───────────────────────────────────── */

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', details = null, cause = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.cause = cause
  }

  get isNetworkError() {
    return this.status === 0
  }

  get isUnauthorized() {
    return this.status === 401
  }

  get isForbidden() {
    return this.status === 403
  }

  get isConflict() {
    return this.status === 409
  }

  get isValidationError() {
    return this.status === 422 || this.status === 400
  }
}

/** Messages lisibles : jamais de détail technique à l'écran. */
function friendlyMessage(status, payload) {
  const fromServer = payload?.error?.message
  if (fromServer && status < 500) return fromServer

  if (status === 0) {
    return 'Impossible de joindre le serveur. Vérifiez votre connexion, puis réessayez.'
  }
  if (status === 401) return 'Session expirée. Reconnectez-vous.'
  if (status === 403) return 'Vous n’avez pas les droits nécessaires pour cette action.'
  if (status === 404) return 'Cette ressource est introuvable.'
  if (status === 409) return 'Cette action entre en conflit avec des données existantes.'
  if (status === 429) return 'Trop de tentatives. Patientez quelques minutes.'
  if (status >= 500) return 'Le service est momentanément indisponible. Réessayez dans un instant.'
  return 'Une erreur est survenue. Merci de réessayer.'
}

/* ────────────────────────────── Requête ───────────────────────────────────── */

async function request(
  path,
  {
    method = 'GET',
    body = null,
    timeout = DEFAULT_TIMEOUT,
    auth = true,
    raw = null,
    /**
     * Réponse binaire attendue (un PDF). Les routes de documents sont
     * protégées par le jeton, que seul ce client sait poser : un simple
     * <a href> ne pourrait pas les ouvrir. On récupère donc le fichier ici,
     * puis l'appelant en fait ce qu'il veut — téléchargement ou aperçu.
     */
    blob = false,
  } = {},
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  const headers = {}
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  // `raw` sert au dépôt d'image (FormData) : le navigateur pose lui-même
  // le Content-Type avec la frontière multipart, on ne doit pas l'écraser.
  if (body && !raw) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: raw ?? (body ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timer)
    const aborted = error?.name === 'AbortError'
    throw new ApiError(
      aborted
        ? 'Le serveur met trop de temps à répondre. Réessayez.'
        : friendlyMessage(0),
      { status: 0, code: aborted ? 'TIMEOUT' : 'NETWORK_ERROR', cause: error },
    )
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 204) return { data: null, meta: null }

  /*
   * Réponse binaire : on ne tente pas de la lire comme du JSON. Une erreur,
   * elle, reste du JSON même sur ces routes — on la laisse donc suivre le
   * chemin normal ci-dessous.
   */
  if (blob && response.ok) {
    return { data: await response.blob(), meta: null }
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok || payload?.success === false) {
    // 401 sur une route protégée : le jeton est mort, on ferme la session.
    if (response.status === 401 && auth) {
      setToken(null)
      expiryHandlers.forEach((handler) => {
        try {
          handler()
        } catch {
          /* un abonné en échec ne doit pas masquer l'erreur d'origine */
        }
      })
    }

    throw new ApiError(friendlyMessage(response.status, payload), {
      status: response.status,
      code: payload?.error?.code ?? 'HTTP_ERROR',
      details: payload?.error?.details ?? null,
    })
  }

  // `extra` : champs de premier niveau autres que data/meta (ex. curseur et compteurs de la messagerie).
  const extra = { ...(payload ?? {}) }
  delete extra.success
  delete extra.data
  delete extra.meta
  return { data: payload?.data ?? null, meta: payload?.meta ?? null, extra }
}

/**
 * Construit une chaîne de requête en ignorant les valeurs vides.
 *
 * `params` est ramené à un objet même quand on lui passe explicitement
 * `null` : une valeur par défaut ne couvre que l'absence d'argument, pas un
 * null transmis — et `Object.entries(null)` lève une exception.
 */
function toQuery(params) {
  if (!params) return ''
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.append(key, String(value))
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

/**
 * Propose un fichier au téléchargement depuis un Blob déjà récupéré.
 * L'URL temporaire est libérée aussitôt : elle ne sert qu'au clic.
 */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Laisser le navigateur démarrer le téléchargement avant de révoquer.
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const http = {
  get: (path, params, options) => request(`${path}${toQuery(params)}`, options),
  post: (path, body, options) => request(path, { method: 'POST', body, ...options }),
  patch: (path, body, options) => request(path, { method: 'PATCH', body, ...options }),
  put: (path, body, options) => request(path, { method: 'PUT', body, ...options }),
  delete: (path, options) => request(path, { method: 'DELETE', ...options }),
}

export default http
