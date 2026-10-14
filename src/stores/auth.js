import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { auth as authApi } from '@/services'
import { getToken, onSessionExpired, setToken } from '@/services/http'

/**
 * Session administrateur.
 *
 * Le mot de passe n'est jamais conservé : il part une seule fois vers
 * `/admin/auth/login` et seul le jeton renvoyé est gardé. Le jeton lui-même
 * n'est pas décodé côté navigateur — c'est le backend qui fait foi, et un
 * jeton expiré se manifeste par un 401 que le client HTTP intercepte.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const loading = ref(false)
  const ready = ref(false)
  const error = ref(null)

  const isAuthenticated = computed(() => Boolean(user.value))
  const isAdmin = computed(() => user.value?.role === 'admin')

  /**
   * Droits de la personne connectée, tels que le serveur les a calculés.
   *
   * Rien n'est déduit ici : la frontière entre l'administratrice et l'équipe
   * est écrite une seule fois, dans `src/lib/permissions.js` du backend, et
   * voyage avec le profil. Le dashboard s'en sert pour ne pas proposer ce qui
   * serait de toute façon refusé — il ne protège rien par lui-même.
   */
  const permissions = computed(() => user.value?.permissions ?? [])
  const can = (permission) => permissions.value.includes(permission)

  /** Appelé par le client HTTP dès qu'une requête protégée reçoit un 401. */
  const handleExpiry = () => {
    user.value = null
    setToken(null)
  }
  onSessionExpired(handleExpiry)

  /**
   * Restaure la session au démarrage : un jeton en stockage ne prouve rien,
   * on le fait valider par le serveur avant d'ouvrir quoi que ce soit.
   */
  const restore = async () => {
    if (ready.value) return
    const token = getToken()
    if (!token) {
      ready.value = true
      return
    }
    try {
      user.value = await authApi.me()
    } catch {
      user.value = null
      setToken(null)
    } finally {
      ready.value = true
    }
  }

  const login = async (email, password) => {
    loading.value = true
    error.value = null
    try {
      const result = await authApi.login(email, password)
      setToken(result.token)
      user.value = result.user
      ready.value = true
      return true
    } catch (caught) {
      error.value = caught?.message || 'Connexion impossible.'
      setToken(null)
      user.value = null
      return false
    } finally {
      loading.value = false
    }
  }

  const logout = () => {
    // L'API n'expose pas de route de déconnexion : le jeton est sans état,
    // l'oublier côté navigateur suffit et évite d'inventer un endpoint.
    setToken(null)
    user.value = null
    error.value = null
  }

  /** Rafraîchit le profil après une modification du compte. */
  const refresh = async () => {
    user.value = await authApi.me()
    return user.value
  }

  return {
    user,
    loading,
    ready,
    error,
    isAuthenticated,
    isAdmin,
    permissions,
    can,
    restore,
    login,
    logout,
    refresh,
  }
})

export default useAuthStore
