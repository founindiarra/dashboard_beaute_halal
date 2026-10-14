<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import NotificationBell from '@/components/layout/NotificationBell.vue'
import SideNav from '@/components/layout/SideNav.vue'
import AdminIcon from '@/components/ui/AdminIcon.vue'
import AdminLogo from '@/components/ui/AdminLogo.vue'
import { stats as statsApi } from '@/services'
import { useAuthStore } from '@/stores/auth'

/**
 * Coquille de l'administration : barre latérale fixe sur grand écran,
 * tiroir plein écran sur mobile et tablette.
 */
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const menuOpen = ref(false)
const unreadMessages = ref(0)
/** Demandes en attente de décision — alimente la cloche de l'en-tête. */
const pendingAppointments = ref(0)
/** Rendez-vous confirmés qui attendent encore d'être traités. */
const toHandle = ref(0)
const drawer = ref(null)

const publicSite = import.meta.env.VITE_PUBLIC_SITE_URL || ''

/** Date du jour, affichée à droite de la barre — repère utile pour un planning. */
const today = new Date().toLocaleDateString('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const initials = computed(() => {
  const name = auth.user?.name || ''
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'BH'
  )
})

/**
 * Compteurs de la navigation et de la cloche.
 *
 * Une seule source : /admin/stats, déjà utilisée par le tableau de bord.
 * Rien n'est inventé ici — « confirmed » est le nombre de rendez-vous
 * confirmés en base, c'est-à-dire ceux qui attendent d'être traités.
 * Un compteur indisponible vaut zéro et n'empêche jamais la navigation.
 */
const loadBadge = async () => {
  try {
    const data = await statsApi.get()
    unreadMessages.value = data?.messages?.unread ?? 0
    pendingAppointments.value = data?.appointments?.pending ?? 0
    toHandle.value = data?.appointments?.confirmed ?? 0
  } catch {
    unreadMessages.value = 0
    pendingAppointments.value = 0
    toHandle.value = 0
  }
}

onMounted(loadBadge)
watch(() => route.name, loadBadge)

// Échap referme le tiroir mobile.
const onKeydown = (event) => {
  if (event.key === 'Escape' && menuOpen.value) menuOpen.value = false
}

watch(menuOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
  if (open) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})

const logout = () => {
  auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-dvh lg:flex">
    <!-- ── Barre latérale, écrans larges ── -->
    <aside
      class="hidden w-[16.5rem] shrink-0 flex-col bg-cocoa-dark lg:sticky lg:top-0 lg:flex lg:h-dvh"
    >
      <div class="flex items-center gap-3 px-4 pb-4 pt-5">
        <span
          class="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gold-soft/50 bg-cocoa"
        >
          <AdminLogo class="h-[1.25rem] w-auto text-gold-soft" />
        </span>
        <span class="flex min-w-0 flex-col leading-tight">
          <span class="truncate font-display text-[1.05rem] text-cream">Beauté Halal</span>
          <span class="truncate text-[0.63rem] text-cream/45">
            L’art des locks, avec soin et élégance
          </span>
        </span>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-2.5">
        <SideNav :unread-messages="unreadMessages" :to-handle="toHandle" />
      </div>

      <!--
        Pied de la barre : qui est connecté, puis les deux sorties — le site
        public et la déconnexion. Elles étaient auparavant réparties entre la
        barre et l'en-tête ; les réunir ici évite de les chercher.
      -->
      <div class="mt-auto border-t border-cream/10 p-2.5">
        <RouterLink
          :to="{ name: 'account' }"
          class="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-cream/8"
        >
          <span
            class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cream/12 text-[0.7rem] font-medium text-cream"
          >
            {{ initials }}
          </span>
          <span class="flex min-w-0 flex-col leading-tight">
            <span class="truncate text-[0.82rem] text-cream">{{ auth.user?.name }}</span>
            <span class="truncate text-[0.68rem] text-cream/45">
              {{ auth.user?.role === 'admin' ? 'Administratrice' : 'Équipe' }}
            </span>
          </span>
          <AdminIcon name="chevron-right" class="ml-auto h-3.5 w-3.5 shrink-0 text-cream/40" />
        </RouterLink>

        <a
          v-if="publicSite"
          :href="publicSite"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-0.5 flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-cream/50 transition-colors hover:bg-cream/8 hover:text-cream"
        >
          <AdminIcon name="external" class="h-3.5 w-3.5" />
          Voir le site public
        </a>

        <button
          type="button"
          class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-cream/50 transition-colors hover:bg-cream/8 hover:text-cream"
          @click="logout"
        >
          <AdminIcon name="logout" class="h-3.5 w-3.5" />
          Déconnexion
        </button>
      </div>
    </aside>

    <!-- ── Colonne de contenu ── -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur-sm sm:px-6"
      >
        <button
          type="button"
          class="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line text-cocoa-dark transition-colors hover:bg-ivory lg:hidden"
          :aria-expanded="menuOpen"
          aria-controls="admin-drawer"
          aria-label="Ouvrir le menu"
          @click="menuOpen = true"
        >
          <AdminIcon name="menu" class="h-5 w-5" />
        </button>

        <p class="min-w-0 flex-1 truncate text-sm font-medium text-cocoa-dark">
          {{ route.meta?.title || 'Administration' }}
        </p>

        <div class="flex shrink-0 items-center gap-2">
          <NotificationBell
            :pending="pendingAppointments"
            @seen="pendingAppointments = $event"
          />
          <span
            class="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-muted md:inline-flex"
          >
            <AdminIcon name="calendar" class="h-3.5 w-3.5 text-gold" />
            {{ today }}
          </span>
          <RouterLink
            :to="{ name: 'account' }"
            class="grid h-9 w-9 place-items-center rounded-full bg-ivory text-xs font-medium text-cocoa-dark transition-colors hover:bg-sand lg:hidden"
            :aria-label="`Mon compte — ${auth.user?.name || ''}`"
          >
            {{ initials }}
          </RouterLink>
          <button
            type="button"
            class="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-ivory hover:text-danger lg:hidden"
            aria-label="Se déconnecter"
            title="Se déconnecter"
            @click="logout"
          >
            <AdminIcon name="logout" class="h-4 w-4" />
          </button>
        </div>
      </header>

      <main class="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-7">
        <div class="mx-auto w-full max-w-7xl">
          <slot />
        </div>
      </main>
    </div>

    <!-- ── Tiroir mobile / tablette ── -->
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="menuOpen"
        class="fixed inset-0 z-50 flex lg:hidden"
        @click.self="menuOpen = false"
      >
        <div class="absolute inset-0 bg-ink/45" aria-hidden="true" />
        <div
          id="admin-drawer"
          ref="drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          class="relative flex h-full w-[17rem] max-w-[85vw] flex-col bg-cocoa-dark"
        >
          <div class="flex items-center justify-between gap-2 border-b border-cream/10 px-4 py-3">
            <span class="flex min-w-0 items-center gap-2.5">
              <span
                class="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gold-soft/50 bg-cocoa"
              >
                <AdminLogo class="h-[1.15rem] w-auto text-gold-soft" />
              </span>
              <span class="truncate font-display text-base text-cream">Beauté Halal</span>
            </span>
            <button
              type="button"
              class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream"
              aria-label="Fermer le menu"
              @click="menuOpen = false"
            >
              <AdminIcon name="close" class="h-4 w-4" />
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-2">
            <SideNav
              :unread-messages="unreadMessages"
              :to-handle="toHandle"
              @navigate="menuOpen = false"
            />
          </div>

          <div class="border-t border-cream/10 p-3">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-cream/65 transition-colors hover:bg-cream/8 hover:text-cream"
              @click="logout"
            >
              <AdminIcon name="logout" class="h-4 w-4" />
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
