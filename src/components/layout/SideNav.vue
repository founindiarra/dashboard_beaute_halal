<script setup>
import { computed } from 'vue'

import AdminIcon from '@/components/ui/AdminIcon.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * Navigation principale, regroupée par domaine pour éviter une longue
 * liste à plat.
 *
 * L'ordre du groupe « Activité » suit le parcours réel d'une journée :
 * on décide des demandes (Rendez-vous), puis on traite celles qui sont
 * confirmées (Rendez-vous confirmés), et on retrouve ensuite ce qui est
 * passé (Historique).
 *
 * Aucune rubrique existante n'a été retirée ni déplacée d'un groupe à
 * l'autre : les entrées ajoutées prennent place à côté des anciennes.
 */
defineProps({
  unreadMessages: { type: Number, default: 0 },
  /** Rendez-vous confirmés en attente de traitement. */
  toHandle: { type: Number, default: 0 },
  /** Demandes du site v3 en attente de rappel. */
  pendingRequests: { type: Number, default: 0 },
})

defineEmits(['navigate'])

const auth = useAuthStore()

/*
 * Chaque entrée déclare le DROIT dont elle relève — le même nom que côté
 * API. Une rubrique dont la personne n'a pas le droit disparaît, et un
 * groupe qui se vide entièrement disparaît avec elle : pas d'intitulé de
 * section suspendu au-dessus du vide.
 *
 * Sans `permission`, l'entrée est ouverte à tout le monde.
 */
const GROUPES = [
  {
    title: 'Activité',
    links: [
      { name: 'dashboard', label: 'Tableau de bord', icon: 'dashboard' },
      {
        name: 'appointments',
        label: 'Rendez-vous',
        icon: 'calendar',
        badge: 'requests',
        permission: 'appointments',
      },
      {
        name: 'confirmed',
        label: 'Rendez-vous confirmés',
        icon: 'check',
        badge: 'toHandle',
        permission: 'appointments',
      },
      { name: 'history', label: 'Historique', icon: 'refresh', permission: 'appointments' },
      { name: 'customers', label: 'Clientes', icon: 'users', permission: 'customers' },
      { name: 'messaging', label: 'Messagerie', icon: 'send', permission: 'messaging' },
      { name: 'messages', label: 'Messages', icon: 'mail', badge: 'messages', permission: 'messages' },
    ],
  },
  {
    title: 'Contenu',
    links: [
      { name: 'services', label: 'Prestations', icon: 'scissors', permission: 'catalog' },
      { name: 'categories', label: 'Catégories', icon: 'tag', permission: 'catalog' },
      { name: 'testimonials', label: 'Avis clientes', icon: 'star', permission: 'catalog' },
      { name: 'tarifs', label: 'Tarifs du site', icon: 'cash', permission: 'tarifs' },
    ],
  },
  {
    title: 'Gestion',
    links: [
      { name: 'accounting', label: 'Comptabilité', icon: 'cash', permission: 'accounting' },
      // Version restreinte : chiffres d'aujourd'hui seulement. Masquée pour qui a déjà la comptabilité complète.
      { name: 'accountingDay', label: 'Caisse du jour', icon: 'cash', permission: 'accounting_day', unless: 'accounting' },
    ],
  },
  {
    title: 'Salon',
    links: [
      { name: 'agents', label: 'Agents & coiffeuses', icon: 'users', permission: 'team' },
      { name: 'offices', label: 'Bureaux', icon: 'grid', permission: 'team' },
    ],
  },
  {
    title: 'Disponibilités',
    links: [
      { name: 'calendar', label: 'Calendrier', icon: 'calendar', permission: 'appointments' },
      { name: 'hours', label: 'Horaires', icon: 'clock', permission: 'schedule' },
      { name: 'closures', label: 'Fermetures', icon: 'ban', permission: 'schedule' },
    ],
  },
  {
    title: 'Réglages',
    links: [
      { name: 'salon', label: 'Paramètres du salon', icon: 'settings', permission: 'salon' },
      { name: 'users', label: 'Utilisateurs', icon: 'shield', permission: 'users' },
      { name: 'account', label: 'Mon compte', icon: 'user' },
    ],
  },
]

const groups = computed(() =>
  GROUPES.map((groupe) => ({
    ...groupe,
    links: groupe.links.filter(
      (lien) => (!lien.permission || auth.can(lien.permission)) && !(lien.unless && auth.can(lien.unless)),
    ),
  })).filter((groupe) => groupe.links.length > 0),
)

/** Compteur à afficher sur une entrée, ou 0 s'il n'y en a pas. */
const badgeFor = (link, counts) => {
  if (link.badge === 'messages') return counts.unreadMessages
  if (link.badge === 'toHandle') return counts.toHandle
  if (link.badge === 'requests') return counts.pendingRequests
  return 0
}
</script>

<template>
  <nav class="flex flex-col gap-5 py-3" aria-label="Navigation principale">
    <div v-for="group in groups" :key="group.title" class="flex flex-col gap-0.5">
      <p class="px-3 pb-1.5 text-[0.6rem] font-medium uppercase tracking-[0.2em] text-cream/35">
        {{ group.title }}
      </p>

      <!--
        La page courante porte un aplat clair et un liseré doré à gauche :
        d'un coup d'œil on sait où l'on est, sans avoir à lire.
      -->
      <RouterLink
        v-for="link in group.links"
        :key="link.name"
        :to="{ name: link.name }"
        class="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.84rem] text-cream/60 transition-colors hover:bg-cream/8 hover:text-cream"
        active-class="!bg-cream/12 !text-cream before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-gold-soft"
        exact-active-class="!bg-cream/12 !text-cream"
        @click="$emit('navigate')"
      >
        <AdminIcon :name="link.icon" class="h-[1.1rem] w-[1.1rem] shrink-0" />
        <span class="min-w-0 flex-1 truncate">{{ link.label }}</span>
        <span
          v-if="badgeFor(link, { unreadMessages, toHandle, pendingRequests }) > 0"
          class="shrink-0 rounded-full bg-gold px-2 py-0.5 text-[0.62rem] font-medium text-cocoa-dark"
        >
          {{
            badgeFor(link, { unreadMessages, toHandle, pendingRequests }) > 99
              ? '99+'
              : badgeFor(link, { unreadMessages, toHandle, pendingRequests })
          }}
        </span>
      </RouterLink>
    </div>
  </nav>
</template>
