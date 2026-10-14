import { onMounted, ref, shallowRef } from 'vue'

/**
 * Charge une ressource de l'API et expose les états attendus par l'interface :
 * chargement, erreur, données, avec un « Réessayer ».
 *
 *   const { data, loading, error, reload } = useResource(services.list, [])
 *
 * `loader` est une fonction async ; `initialValue` est affichée tant que rien
 * n'est chargé (tableau vide, objet null…).
 */
export function useResource(loader, initialValue = null, { immediate = true } = {}) {
  const data = shallowRef(initialValue)
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  const reload = async (...args) => {
    loading.value = true
    error.value = null
    try {
      data.value = await loader(...args)
      loaded.value = true
      return data.value
    } catch (caught) {
      // Le message vient déjà d'ApiError : il est lisible tel quel.
      error.value = caught?.message || 'Une erreur est survenue.'
      return null
    } finally {
      loading.value = false
    }
  }

  if (immediate) onMounted(() => reload())

  return { data, loading, error, loaded, reload }
}

export default useResource
