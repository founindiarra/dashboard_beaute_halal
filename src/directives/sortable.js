import Sortable from 'sortablejs'

/**
 * Glisser-déposer pour réordonner une liste ou une grille : `v-sortable="{ onReorder, disabled }"` sur le <ul>.
 * – Souris : on maintient l'élément et on le glisse. Écran tactile : appui long (≈ 0,25 s) puis glisser, pour ne pas
 *   gêner le défilement de la page.
 * – Le DOM n'est JAMAIS laissé dans l'ordre manipulé par la bibliothèque : on le remet comme avant et on appelle
 *   `onReorder(ancienIndex, nouvelIndex)` ; c'est Vue qui réécrit la liste (les `:key` des éléments doivent être stables).
 */
const instances = new WeakMap()

function creer(el, valeur) {
  const options = valeur ?? {}
  const sortable = Sortable.create(el, {
    animation: 180,
    draggable: options.draggable || 'li',
    handle: options.handle || undefined,
    delay: 250,
    delayOnTouchOnly: true,
    touchStartThreshold: 6,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    disabled: Boolean(options.disabled),
    onEnd(evt) {
      const { item, from, oldIndex, newIndex } = evt
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
      // Remet l'élément à sa place d'origine : Vue réaffichera la liste dans le nouvel ordre.
      from.removeChild(item)
      from.insertBefore(item, from.children[oldIndex] ?? null)
      instances.get(el)?.onReorder?.(oldIndex, newIndex)
    },
  })
  instances.set(el, { sortable, onReorder: options.onReorder })
}

export const vSortable = {
  mounted(el, { value }) {
    creer(el, value)
  },
  updated(el, { value }) {
    const inst = instances.get(el)
    if (!inst) return creer(el, value)
    inst.onReorder = value?.onReorder
    inst.sortable.option('disabled', Boolean(value?.disabled))
  },
  unmounted(el) {
    instances.get(el)?.sortable.destroy()
    instances.delete(el)
  },
}

/** Déplace un élément d'une liste (renvoie une nouvelle liste). */
export function deplacer(liste, de, vers) {
  const copie = [...liste]
  const [x] = copie.splice(de, 1)
  copie.splice(vers, 0, x)
  return copie
}
