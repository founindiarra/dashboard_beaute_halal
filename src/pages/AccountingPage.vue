<script setup>
import { computed, ref, watch } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseField from '@/components/ui/BaseField.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataState from '@/components/ui/DataState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { accounting as api } from '@/services'
import { useToastStore } from '@/stores/toasts'
import { addDays, formatDateShort, formatPrice, toDateKey } from '@/utils/format'

/**
 * Comptabilité du salon.
 *
 * Trois idées, et l'écran en découle.
 *
 *  1. Les RECETTES ne se saisissent pas ici. Elles entrent en caisse toutes
 *     seules au moment où la cliente paie, depuis la fiche du rendez-vous.
 *     Saisir une recette deux fois, c'est une caisse fausse.
 *  2. Les DÉPENSES se saisissent ici, et seulement ici. Elles ont une
 *     catégorie, pour savoir en fin de mois où est parti l'argent.
 *  3. Un SOLDE ne se stocke pas, il se calcule. Ce que montre cette page est
 *     toujours la somme des écritures, jamais un chiffre tenu à part.
 *
 * Écran réservé à l'administratrice : le menu le cache à l'équipe, le routeur
 * le refuse, et le serveur répond 403 de toute façon.
 */
const toasts = useToastStore()

/* ══════════════════════════════ Période ═══════════════════════════════ */

const moisCourant = () => {
  const today = toDateKey()
  return { from: `${today.slice(0, 7)}-01`, to: today }
}

const periode = ref(moisCourant())

const RACCOURCIS = [
  { label: 'Ce mois-ci', get: moisCourant },
  { label: '30 derniers jours', get: () => ({ from: addDays(toDateKey(), -30), to: toDateKey() }) },
  {
    label: 'Mois dernier',
    get: () => {
      const debut = new Date()
      debut.setDate(1)
      debut.setMonth(debut.getMonth() - 1)
      const fin = new Date(debut.getFullYear(), debut.getMonth() + 1, 0)
      return { from: toDateKey(debut), to: toDateKey(fin) }
    },
  },
  { label: 'Depuis le début', get: () => ({ from: '', to: '' }) },
]

/* ══════════════════════════════ Synthèse ══════════════════════════════ */

const summary = ref(null)
const summaryLoading = ref(false)
const summaryError = ref(null)

const loadSummary = async () => {
  summaryLoading.value = true
  summaryError.value = null
  try {
    summary.value = await api.summary({
      from: periode.value.from || undefined,
      to: periode.value.to || undefined,
    })
  } catch (caught) {
    summaryError.value = caught?.message || 'Chargement impossible.'
  } finally {
    summaryLoading.value = false
  }
}

const comptes = computed(() => summary.value?.accounts ?? [])
const caisse = computed(() => comptes.value.find((c) => c.kind === 'cash') || null)
const comptesActifs = computed(() => comptes.value.filter((c) => c.isActive))
const parCategorie = computed(() => summary.value?.byCategory ?? [])
const plusGrossePart = computed(() =>
  parCategorie.value.reduce((max, ligne) => Math.max(max, ligne.total), 0),
)

/* ══════════════════════════════ Catégories ════════════════════════════ */

const categories = ref([])
const loadCategories = async () => {
  categories.value = await api.categories().catch(() => [])
}

const categoriesActives = computed(() => categories.value.filter((c) => c.isActive))

/* ══════════════════════════════ Écritures ═════════════════════════════ */

const rows = ref([])
const meta = ref(null)
const loading = ref(false)
const error = ref(null)

const filters = ref({ search: '', kind: '', accountId: '', categoryId: '', page: 1 })

const KINDS = [
  { value: '', label: 'Toutes les écritures' },
  { value: 'payment', label: 'Encaissements' },
  { value: 'expense', label: 'Dépenses' },
  { value: 'transfer', label: 'Transferts' },
  { value: 'adjustment', label: 'Régularisations' },
]

const optionsComptes = computed(() => [
  { value: '', label: 'Tous les comptes' },
  ...comptes.value.map((c) => ({ value: String(c.id), label: c.name })),
])

const optionsCategories = computed(() => [
  { value: '', label: 'Toutes les catégories' },
  ...categoriesActives.value.map((c) => ({ value: String(c.id), label: c.name })),
])

const loadEntries = async () => {
  loading.value = true
  error.value = null
  try {
    const result = await api.entries({
      search: filters.value.search || undefined,
      kind: filters.value.kind || undefined,
      accountId: filters.value.accountId || undefined,
      categoryId: filters.value.categoryId || undefined,
      from: periode.value.from || undefined,
      to: periode.value.to || undefined,
      page: filters.value.page,
      limit: 30,
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

const rafraichir = () => Promise.all([loadSummary(), loadEntries()])

let debounce = null
watch(
  () => filters.value.search,
  () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      filters.value.page = 1
      loadEntries()
    }, 350)
  },
)
watch(
  () => [filters.value.kind, filters.value.accountId, filters.value.categoryId],
  () => {
    filters.value.page = 1
    loadEntries()
  },
)
watch(() => filters.value.page, loadEntries)
watch(
  () => [periode.value.from, periode.value.to],
  () => {
    filters.value.page = 1
    rafraichir()
  },
)

loadSummary()
loadEntries()
loadCategories()

const tonDe = (ecriture) => {
  if (ecriture.kind === 'payment') return 'ok'
  if (ecriture.kind === 'expense') return 'danger'
  if (ecriture.kind === 'transfer') return 'info'
  return 'neutral'
}

/* ═════════════════════════════ Dépense ════════════════════════════════ */

const depenseOpen = ref(false)
const depenseBusy = ref(false)
const depenseError = ref('')
const depense = ref({})

const ouvrirDepense = () => {
  depenseError.value = ''
  depense.value = {
    accountId: String(caisse.value?.id ?? comptesActifs.value[0]?.id ?? ''),
    categoryId: '',
    amount: '',
    label: '',
    occurredOn: toDateKey(),
  }
  depenseOpen.value = true
}

const compteChoisi = computed(
  () => comptes.value.find((c) => String(c.id) === String(depense.value.accountId)) || null,
)

const resteApresDepense = computed(() => {
  const montant = Number(depense.value.amount) || 0
  if (!compteChoisi.value) return null
  return compteChoisi.value.balance - montant
})

const enregistrerDepense = async () => {
  depenseError.value = ''
  const montant = Number(depense.value.amount)
  if (!depense.value.accountId) {
    depenseError.value = 'Choisissez le compte qui paie.'
    return
  }
  if (!Number.isFinite(montant) || montant <= 0) {
    depenseError.value = 'Indiquez un montant supérieur à zéro.'
    return
  }
  if (!depense.value.label?.trim() || depense.value.label.trim().length < 2) {
    depenseError.value = 'Dites en deux mots à quoi correspond cette dépense.'
    return
  }

  depenseBusy.value = true
  try {
    await api.addExpense({
      accountId: Number(depense.value.accountId),
      categoryId: depense.value.categoryId ? Number(depense.value.categoryId) : null,
      amount: montant,
      label: depense.value.label.trim(),
      occurredOn: depense.value.occurredOn || undefined,
    })
    depenseOpen.value = false
    await rafraichir()
    toasts.success('Dépense enregistrée.')
  } catch (caught) {
    // Notamment « Solde insuffisant : la Caisse ne contient que … ».
    depenseError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    depenseBusy.value = false
  }
}

/* ═════════════════════════════ Transfert ══════════════════════════════ */

const transfertOpen = ref(false)
const transfertBusy = ref(false)
const transfertError = ref('')
const transfert = ref({})

const ouvrirTransfert = () => {
  transfertError.value = ''
  transfert.value = {
    fromAccountId: String(caisse.value?.id ?? ''),
    toAccountId: String(comptesActifs.value.find((c) => c.kind === 'bank')?.id ?? ''),
    amount: '',
    label: '',
    occurredOn: toDateKey(),
  }
  transfertOpen.value = true
}

const optionsTransfert = computed(() =>
  comptesActifs.value.map((c) => ({
    value: String(c.id),
    label: `${c.name} — ${formatPrice(c.balance)}`,
  })),
)

const enregistrerTransfert = async () => {
  transfertError.value = ''
  const montant = Number(transfert.value.amount)
  if (!transfert.value.fromAccountId || !transfert.value.toAccountId) {
    transfertError.value = 'Choisissez les deux comptes.'
    return
  }
  if (transfert.value.fromAccountId === transfert.value.toAccountId) {
    transfertError.value = 'Les deux comptes doivent être différents.'
    return
  }
  if (!Number.isFinite(montant) || montant <= 0) {
    transfertError.value = 'Indiquez un montant supérieur à zéro.'
    return
  }

  transfertBusy.value = true
  try {
    await api.transfer({
      fromAccountId: Number(transfert.value.fromAccountId),
      toAccountId: Number(transfert.value.toAccountId),
      amount: montant,
      label: transfert.value.label?.trim() || null,
      occurredOn: transfert.value.occurredOn || undefined,
    })
    transfertOpen.value = false
    await rafraichir()
    toasts.success('Transfert enregistré.')
  } catch (caught) {
    transfertError.value = caught?.message || 'Transfert impossible.'
  } finally {
    transfertBusy.value = false
  }
}

/* ═══════════════════════ Annulation d'une écriture ════════════════════ */

const aSupprimer = ref(null)
const suppressionBusy = ref(false)

const messageSuppression = computed(() => {
  const e = aSupprimer.value
  if (!e) return ''
  if (e.transferRef) {
    return `Annuler ce transfert de ${formatPrice(e.amount)} ? Les deux écritures, au départ et à l’arrivée, seront retirées ensemble.`
  }
  return `Annuler « ${e.label} » (${formatPrice(e.amount)}) ? Le solde de ${e.account.name} sera recalculé.`
})

const confirmerSuppression = async () => {
  suppressionBusy.value = true
  try {
    await api.removeEntry(aSupprimer.value.id)
    aSupprimer.value = null
    await rafraichir()
    toasts.success('Écriture annulée.')
  } catch (caught) {
    // Un encaissement renvoie 409 : le message dit où aller le corriger.
    toasts.error(caught?.message || 'Annulation impossible.')
    aSupprimer.value = null
  } finally {
    suppressionBusy.value = false
  }
}

/* ══════════════════════════════ Comptes ═══════════════════════════════ */

const comptesOpen = ref(false)
const compteForm = ref(null)
const compteBusy = ref(false)
const compteError = ref('')

const ouvrirCompte = (compte = null) => {
  compteError.value = ''
  compteForm.value = compte
    ? { ...compte, id: compte.id }
    : {
        id: null,
        kind: caisse.value ? 'bank' : 'cash',
        name: '',
        bankName: '',
        accountNumber: '',
        note: '',
        isActive: true,
      }
}

const enregistrerCompte = async () => {
  compteError.value = ''
  const f = compteForm.value
  if (!f.name?.trim() || f.name.trim().length < 2) {
    compteError.value = 'Donnez un nom à ce compte.'
    return
  }
  if (f.kind === 'bank' && !f.bankName?.trim()) {
    compteError.value = 'Indiquez le nom de la banque.'
    return
  }

  compteBusy.value = true
  try {
    const payload = {
      name: f.name.trim(),
      bankName: f.bankName?.trim() || null,
      accountNumber: f.accountNumber?.trim() || null,
      note: f.note?.trim() || null,
      isActive: Boolean(f.isActive),
    }
    if (f.id) {
      await api.updateAccount(f.id, payload)
    } else {
      await api.createAccount({ ...payload, kind: f.kind })
    }
    compteForm.value = null
    await loadSummary()
    toasts.success(f.id ? 'Compte modifié.' : 'Compte créé.')
  } catch (caught) {
    compteError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    compteBusy.value = false
  }
}

const compteASupprimer = ref(null)
const supprimerCompte = async () => {
  compteBusy.value = true
  try {
    await api.removeAccount(compteASupprimer.value.id)
    compteASupprimer.value = null
    await loadSummary()
    toasts.success('Compte supprimé.')
  } catch (caught) {
    toasts.error(caught?.message || 'Suppression impossible.')
    compteASupprimer.value = null
  } finally {
    compteBusy.value = false
  }
}

/* ═════════════════════════ Catégories de dépenses ═════════════════════ */

const categorieForm = ref(null)
const categorieBusy = ref(false)
const categorieError = ref('')

const ouvrirCategorie = (categorie = null) => {
  categorieError.value = ''
  categorieForm.value = categorie ? { ...categorie } : { id: null, name: '', isActive: true }
}

const enregistrerCategorie = async () => {
  categorieError.value = ''
  const f = categorieForm.value
  if (!f.name?.trim() || f.name.trim().length < 2) {
    categorieError.value = 'Donnez un nom à cette catégorie.'
    return
  }

  categorieBusy.value = true
  try {
    if (f.id) {
      await api.updateCategory(f.id, { name: f.name.trim(), isActive: Boolean(f.isActive) })
    } else {
      await api.createCategory({ name: f.name.trim() })
    }
    categorieForm.value = null
    await loadCategories()
    toasts.success(f.id ? 'Catégorie modifiée.' : 'Catégorie créée.')
  } catch (caught) {
    categorieError.value = caught?.message || 'Enregistrement impossible.'
  } finally {
    categorieBusy.value = false
  }
}

const categorieASupprimer = ref(null)
const supprimerCategorie = async () => {
  categorieBusy.value = true
  try {
    await api.removeCategory(categorieASupprimer.value.id)
    categorieASupprimer.value = null
    await Promise.all([loadCategories(), loadSummary()])
    toasts.success('Catégorie supprimée.')
  } catch (caught) {
    toasts.error(caught?.message || 'Suppression impossible.')
    categorieASupprimer.value = null
  } finally {
    categorieBusy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="Comptabilité"
      subtitle="Ce qui entre, ce qui sort, et ce qui reste. Les encaissements arrivent tout seuls depuis les rendez-vous."
    >
      <template #actions>
        <BaseButton size="sm" variant="secondary" @click="comptesOpen = true">
          <AdminIcon name="bank" class="h-3.5 w-3.5" />
          Comptes
        </BaseButton>
        <BaseButton
          size="sm"
          variant="secondary"
          :disabled="comptesActifs.length < 2"
          @click="ouvrirTransfert"
        >
          <AdminIcon name="refresh" class="h-3.5 w-3.5" />
          Transférer
        </BaseButton>
        <BaseButton size="sm" :disabled="!comptesActifs.length" @click="ouvrirDepense">
          <AdminIcon name="plus" class="h-3.5 w-3.5" />
          Dépense
        </BaseButton>
      </template>
    </PageHeader>

    <!-- ── Aucun compte : on ne peut rien faire tant que la caisse n'existe pas ── -->
    <div
      v-if="summary && !comptes.length"
      class="card flex flex-col items-start gap-3 p-5 text-sm text-cocoa"
    >
      <p class="font-medium text-cocoa-dark">Commencez par créer la caisse.</p>
      <p class="text-muted">
        C’est elle qui reçoit les encaissements des rendez-vous. Vous pourrez ensuite ajouter des
        comptes bancaires et transférer l’argent de l’une vers les autres.
      </p>
      <BaseButton size="sm" @click="comptesOpen = true">
        <AdminIcon name="plus" class="h-3.5 w-3.5" />
        Créer la caisse
      </BaseButton>
    </div>

    <!-- ── Période ── -->
    <div class="card flex flex-col gap-3 p-3.5 lg:flex-row lg:items-end">
      <div class="grid flex-1 gap-3 sm:grid-cols-2">
        <BaseField v-model="periode.from" label="Du" type="date" />
        <BaseField v-model="periode.to" label="Au" type="date" />
      </div>
      <div class="flex flex-wrap gap-1.5">
        <BaseButton
          v-for="raccourci in RACCOURCIS"
          :key="raccourci.label"
          size="sm"
          variant="secondary"
          @click="periode = raccourci.get()"
        >
          {{ raccourci.label }}
        </BaseButton>
      </div>
    </div>

    <!-- ── Chiffres de la période ── -->
    <DataState
      :loading="summaryLoading && !summary"
      :error="summaryError"
      :empty="false"
      loading-label="Chargement de la comptabilité…"
      @retry="loadSummary"
    >
      <div v-if="summary" class="flex flex-col gap-5">
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div class="card stat-card">
            <span class="stat-icon"><AdminIcon name="cash" class="h-5 w-5" /></span>
            <span class="stat-value">{{ formatPrice(summary.treasury) }}</span>
            <span class="text-[0.78rem] text-muted">Trésorerie, tous comptes</span>
          </div>
          <div class="card stat-card">
            <span class="stat-icon"><AdminIcon name="arrow-down" class="h-5 w-5" /></span>
            <span class="stat-value text-ok">{{ formatPrice(summary.period.collected) }}</span>
            <span class="text-[0.78rem] text-muted">Encaissé sur la période</span>
          </div>
          <div class="card stat-card">
            <span class="stat-icon"><AdminIcon name="arrow-up" class="h-5 w-5" /></span>
            <span class="stat-value text-danger">{{ formatPrice(summary.period.spent) }}</span>
            <span class="text-[0.78rem] text-muted">Dépensé sur la période</span>
          </div>
          <div class="card stat-card">
            <span class="stat-icon"><AdminIcon name="chart" class="h-5 w-5" /></span>
            <span class="stat-value" :class="summary.period.net < 0 ? 'text-danger' : 'text-ok'">
              {{ formatPrice(summary.period.net) }}
            </span>
            <span class="text-[0.78rem] text-muted">Résultat de la période</span>
          </div>
        </div>

        <div class="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
          <!-- Soldes par compte -->
          <section class="card p-4">
            <h2 class="text-sm font-semibold text-cocoa-dark">Où est l’argent</h2>
            <p class="mt-0.5 text-xs text-muted">
              Chaque solde est la somme de ses écritures, recalculée à l’instant.
            </p>

            <ul class="mt-3 flex flex-col divide-y divide-line">
              <li
                v-for="compte in comptes"
                :key="compte.id"
                class="flex items-center justify-between gap-3 py-2.5"
              >
                <span class="flex min-w-0 items-center gap-2.5">
                  <span class="stat-icon h-8 w-8 shrink-0">
                    <AdminIcon :name="compte.kind === 'cash' ? 'cash' : 'bank'" class="h-4 w-4" />
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate text-sm text-cocoa-dark">{{ compte.name }}</span>
                    <span class="block truncate text-xs text-muted">
                      {{ compte.kind === 'cash' ? 'Espèces' : compte.bankName || 'Banque' }}
                      <template v-if="!compte.isActive"> · désactivé</template>
                    </span>
                  </span>
                </span>
                <span
                  class="shrink-0 font-medium whitespace-nowrap"
                  :class="compte.balance < 0 ? 'text-danger' : 'text-cocoa-dark'"
                >
                  {{ formatPrice(compte.balance) }}
                </span>
              </li>
              <li v-if="!comptes.length" class="py-3 text-sm text-muted">Aucun compte.</li>
            </ul>
          </section>

          <!-- Dépenses par catégorie -->
          <section class="card p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-sm font-semibold text-cocoa-dark">Où part l’argent</h2>
                <p class="mt-0.5 text-xs text-muted">Dépenses de la période, par catégorie.</p>
              </div>
              <BaseButton size="sm" variant="ghost" @click="ouvrirCategorie()">
                <AdminIcon name="plus" class="h-3.5 w-3.5" />
                Catégorie
              </BaseButton>
            </div>

            <ul v-if="parCategorie.length" class="mt-3 flex flex-col gap-2.5">
              <li v-for="ligne in parCategorie" :key="ligne.name" class="flex flex-col gap-1">
                <span class="flex items-baseline justify-between gap-3 text-sm">
                  <span class="min-w-0 truncate text-cocoa">{{ ligne.name }}</span>
                  <span class="shrink-0 whitespace-nowrap text-cocoa-dark">
                    {{ formatPrice(ligne.total) }}
                  </span>
                </span>
                <span class="h-1.5 overflow-hidden rounded-full bg-line-soft">
                  <span
                    class="block h-full rounded-full bg-gold"
                    :style="{
                      width: `${plusGrossePart ? Math.max(4, (ligne.total / plusGrossePart) * 100) : 0}%`,
                    }"
                  />
                </span>
              </li>
            </ul>
            <p v-else class="mt-4 text-sm text-muted">Aucune dépense sur cette période.</p>
          </section>
        </div>
      </div>
    </DataState>

    <!-- ── Filtres du journal ── -->
    <div class="card flex flex-col gap-3 p-3.5">
      <SearchInput
        v-model="filters.search"
        label="Rechercher une écriture"
        placeholder="Libellé, référence de rendez-vous…"
      />
      <div class="grid gap-3 sm:grid-cols-3">
        <BaseField v-model="filters.kind" label="Nature" :options="KINDS" />
        <BaseField v-model="filters.accountId" label="Compte" :options="optionsComptes" />
        <BaseField v-model="filters.categoryId" label="Catégorie" :options="optionsCategories" />
      </div>
    </div>

    <!-- ── Journal ── -->
    <section class="card overflow-hidden">
      <DataState
        :loading="loading"
        :error="error"
        :empty="!rows.length"
        loading-label="Chargement des écritures…"
        empty-label="Aucune écriture sur cette période."
        empty-hint="Les encaissements apparaissent dès qu’une cliente règle sa prestation."
        @retry="loadEntries"
      >
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Libellé</th>
                <th class="hidden md:table-cell">Compte</th>
                <th class="hidden lg:table-cell">Catégorie</th>
                <th class="text-right">Montant</th>
                <th class="w-10"><span class="sr-only">Annuler</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ecriture in rows" :key="ecriture.id">
                <td class="whitespace-nowrap text-xs">
                  {{ formatDateShort(ecriture.occurredOn) }}
                </td>
                <td class="min-w-[12rem]">
                  <span class="block truncate text-cocoa-dark">{{ ecriture.label }}</span>
                  <span class="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <StatusBadge :label="ecriture.kindLabel" :tone="tonDe(ecriture)" />
                    <RouterLink
                      v-if="ecriture.appointment"
                      :to="{ name: 'operation', params: { id: ecriture.appointment.id } }"
                      class="text-[0.7rem] text-muted underline-offset-2 hover:text-gold hover:underline"
                    >
                      {{ ecriture.appointment.reference }}
                    </RouterLink>
                  </span>
                </td>
                <td class="hidden whitespace-nowrap text-xs md:table-cell">
                  {{ ecriture.account.name }}
                </td>
                <td class="hidden whitespace-nowrap text-xs lg:table-cell">
                  {{ ecriture.category?.name || '—' }}
                </td>
                <td
                  class="text-right font-medium whitespace-nowrap"
                  :class="ecriture.direction === 'in' ? 'text-ok' : 'text-danger'"
                >
                  {{ ecriture.direction === 'in' ? '+' : '−' }}{{ formatPrice(ecriture.amount) }}
                </td>
                <td class="text-right">
                  <button
                    type="button"
                    class="inline-grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                    :aria-label="`Annuler ${ecriture.label}`"
                    @click="aSupprimer = ecriture"
                  >
                    <AdminIcon name="trash" class="h-4 w-4" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="meta && meta.pages > 1"
          class="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted"
        >
          <span>{{ meta.total }} écritures · page {{ meta.page }} sur {{ meta.pages }}</span>
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

    <!-- ══════════════════════════ Dépense ══════════════════════════ -->
    <BaseModal :open="depenseOpen" title="Enregistrer une dépense" @close="depenseOpen = false">
      <div class="flex flex-col gap-4">
        <p
          v-if="depenseError"
          class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ depenseError }}
        </p>

        <BaseField
          v-model="depense.accountId"
          label="Payé depuis"
          required
          :options="optionsTransfert"
        />

        <div class="grid gap-4 sm:grid-cols-2">
          <BaseField
            v-model="depense.amount"
            label="Montant"
            type="number"
            min="0"
            step="1"
            required
          />
          <BaseField v-model="depense.occurredOn" label="Date" type="date" required />
        </div>

        <BaseField
          v-model="depense.label"
          label="À quoi correspond cette dépense ?"
          required
          placeholder="Achat de mèches, électricité, transport…"
        />

        <BaseField
          v-model="depense.categoryId"
          label="Catégorie"
          :options="[{ value: '', label: 'Sans catégorie' }, ...optionsCategories.slice(1)]"
          hint="Elle sert au récapitulatif « où part l’argent »."
        />

        <p
          v-if="compteChoisi && resteApresDepense !== null"
          class="rounded-lg px-3 py-2 text-sm"
          :class="
            resteApresDepense < 0
              ? 'border border-danger/25 bg-danger-bg text-danger'
              : 'bg-ivory text-cocoa'
          "
        >
          <template v-if="resteApresDepense < 0">
            {{ compteChoisi.name }} ne contient que {{ formatPrice(compteChoisi.balance) }}. La
            dépense sera refusée.
          </template>
          <template v-else>
            Après cette dépense, {{ compteChoisi.name }} contiendra
            {{ formatPrice(resteApresDepense) }}.
          </template>
        </p>
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="depenseBusy" @click="depenseOpen = false">
          Annuler
        </BaseButton>
        <BaseButton :loading="depenseBusy" @click="enregistrerDepense">Enregistrer</BaseButton>
      </template>
    </BaseModal>

    <!-- ══════════════════════════ Transfert ══════════════════════════ -->
    <BaseModal :open="transfertOpen" title="Transférer de l’argent" @close="transfertOpen = false">
      <div class="flex flex-col gap-4">
        <p
          v-if="transfertError"
          class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ transfertError }}
        </p>

        <p class="text-sm text-muted">
          Un dépôt à la banque, ou un retrait pour remettre du liquide en caisse. Rien n’est créé ni
          perdu : la somme change simplement de compte.
        </p>

        <div class="grid gap-4 sm:grid-cols-2">
          <BaseField
            v-model="transfert.fromAccountId"
            label="Depuis"
            required
            :options="optionsTransfert"
          />
          <BaseField
            v-model="transfert.toAccountId"
            label="Vers"
            required
            :options="optionsTransfert"
          />
          <BaseField
            v-model="transfert.amount"
            label="Montant"
            type="number"
            min="0"
            step="1"
            required
          />
          <BaseField v-model="transfert.occurredOn" label="Date" type="date" required />
        </div>

        <BaseField
          v-model="transfert.label"
          label="Note"
          placeholder="Dépôt du chiffre de la semaine…"
        />
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="transfertBusy" @click="transfertOpen = false">
          Annuler
        </BaseButton>
        <BaseButton :loading="transfertBusy" @click="enregistrerTransfert">Transférer</BaseButton>
      </template>
    </BaseModal>

    <!-- ══════════════════════════ Comptes ══════════════════════════ -->
    <BaseModal
      :open="comptesOpen && !compteForm"
      title="Comptes du salon"
      @close="comptesOpen = false"
    >
      <div class="flex flex-col gap-3">
        <p class="text-sm text-muted">
          Une seule caisse — celle qui reçoit les encaissements — et autant de comptes bancaires que
          nécessaire.
        </p>

        <ul class="flex flex-col divide-y divide-line">
          <li
            v-for="compte in comptes"
            :key="compte.id"
            class="flex items-center justify-between gap-3 py-2.5"
          >
            <span class="min-w-0">
              <span class="block truncate text-sm text-cocoa-dark">{{ compte.name }}</span>
              <span class="block truncate text-xs text-muted">
                {{ compte.kind === 'cash' ? 'Espèces' : compte.bankName || 'Banque' }} ·
                {{ formatPrice(compte.balance) }} · {{ compte.entries }} écriture(s)
              </span>
            </span>
            <span class="flex shrink-0 gap-1">
              <BaseButton size="sm" variant="ghost" @click="ouvrirCompte(compte)">
                Modifier
              </BaseButton>
              <BaseButton
                v-if="compte.kind !== 'cash'"
                size="sm"
                variant="ghost"
                @click="compteASupprimer = compte"
              >
                <AdminIcon name="trash" class="h-3.5 w-3.5" />
                <span class="sr-only">Supprimer {{ compte.name }}</span>
              </BaseButton>
            </span>
          </li>
        </ul>

        <BaseButton size="sm" variant="secondary" @click="ouvrirCompte()">
          <AdminIcon name="plus" class="h-3.5 w-3.5" />
          {{ caisse ? 'Ajouter un compte bancaire' : 'Créer la caisse' }}
        </BaseButton>

        <div class="mt-2 border-t border-line pt-3">
          <p class="text-sm font-medium text-cocoa-dark">Catégories de dépenses</p>
          <ul class="mt-2 flex flex-wrap gap-1.5">
            <li v-for="categorie in categories" :key="categorie.id">
              <button
                type="button"
                class="rounded-full border border-line px-3 py-1 text-[0.72rem] transition-colors hover:border-gold hover:text-gold"
                :class="categorie.isActive ? 'text-cocoa' : 'text-muted line-through'"
                @click="ouvrirCategorie(categorie)"
              >
                {{ categorie.name }}
              </button>
            </li>
            <li v-if="!categories.length" class="text-xs text-muted">Aucune catégorie.</li>
          </ul>
          <BaseButton size="sm" variant="ghost" class="mt-2" @click="ouvrirCategorie()">
            <AdminIcon name="plus" class="h-3.5 w-3.5" />
            Ajouter une catégorie
          </BaseButton>
        </div>
      </div>

      <template #footer>
        <BaseButton variant="secondary" @click="comptesOpen = false">Fermer</BaseButton>
      </template>
    </BaseModal>

    <!-- Fiche d'un compte -->
    <BaseModal
      :open="Boolean(compteForm)"
      :title="compteForm?.id ? 'Modifier le compte' : 'Nouveau compte'"
      size="sm"
      @close="compteForm = null"
    >
      <div v-if="compteForm" class="flex flex-col gap-4">
        <p
          v-if="compteError"
          class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ compteError }}
        </p>

        <BaseField
          v-model="compteForm.name"
          label="Nom du compte"
          required
          placeholder="Caisse du salon, Compte NSIA…"
        />

        <template v-if="compteForm.kind !== 'cash'">
          <BaseField v-model="compteForm.bankName" label="Banque" required />
          <BaseField v-model="compteForm.accountNumber" label="Numéro de compte" />
        </template>

        <BaseField v-model="compteForm.note" label="Note" textarea :rows="2" />

        <BaseToggle
          v-if="compteForm.id && compteForm.kind !== 'cash'"
          v-model="compteForm.isActive"
          label="Compte actif"
          hint="Un compte désactivé reste dans l’historique mais ne se propose plus."
        />
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="compteBusy" @click="compteForm = null">
          Annuler
        </BaseButton>
        <BaseButton :loading="compteBusy" @click="enregistrerCompte">Enregistrer</BaseButton>
      </template>
    </BaseModal>

    <!-- Fiche d'une catégorie -->
    <BaseModal
      :open="Boolean(categorieForm)"
      :title="categorieForm?.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'"
      size="sm"
      @close="categorieForm = null"
    >
      <div v-if="categorieForm" class="flex flex-col gap-4">
        <p
          v-if="categorieError"
          class="rounded-lg border border-danger/25 bg-danger-bg px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {{ categorieError }}
        </p>

        <BaseField
          v-model="categorieForm.name"
          label="Nom"
          required
          placeholder="Mèches, Électricité, Transport…"
        />

        <BaseToggle
          v-if="categorieForm.id"
          v-model="categorieForm.isActive"
          label="Catégorie active"
        />

        <BaseButton
          v-if="categorieForm.id"
          size="sm"
          variant="ghost"
          @click="categorieASupprimer = categorieForm"
        >
          <AdminIcon name="trash" class="h-3.5 w-3.5" />
          Supprimer cette catégorie
        </BaseButton>
      </div>

      <template #footer>
        <BaseButton variant="secondary" :disabled="categorieBusy" @click="categorieForm = null">
          Annuler
        </BaseButton>
        <BaseButton :loading="categorieBusy" @click="enregistrerCategorie">Enregistrer</BaseButton>
      </template>
    </BaseModal>

    <!-- ══════════════════════════ Confirmations ══════════════════════════ -->
    <ConfirmDialog
      :open="Boolean(aSupprimer)"
      title="Annuler cette écriture"
      :message="messageSuppression"
      confirm-label="Annuler l’écriture"
      :busy="suppressionBusy"
      @confirm="confirmerSuppression"
      @close="aSupprimer = null"
    />

    <ConfirmDialog
      :open="Boolean(compteASupprimer)"
      title="Supprimer ce compte"
      :message="`Supprimer « ${compteASupprimer?.name} » ? Un compte qui porte des écritures ne peut pas être supprimé — désactivez-le plutôt.`"
      :busy="compteBusy"
      @confirm="supprimerCompte"
      @close="compteASupprimer = null"
    />

    <ConfirmDialog
      :open="Boolean(categorieASupprimer)"
      title="Supprimer cette catégorie"
      :message="`Supprimer « ${categorieASupprimer?.name} » ? Si elle est déjà utilisée par des dépenses, la suppression sera refusée.`"
      :busy="categorieBusy"
      @confirm="supprimerCategorie"
      @close="categorieASupprimer = null"
    />
  </div>
</template>
