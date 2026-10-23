import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

/**
 * Deux familles de routes :
 *  – « /connexion », accessible sans session ;
 *  – tout le reste, protégé par une garde qui vérifie la session auprès de
 *    l'API avant de rendre quoi que ce soit.
 *
 * Les vues sont chargées à la demande : la page de connexion n'embarque pas
 * le code du reste du dashboard.
 */
const routes = [
  {
    path: '/connexion',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { public: true, title: 'Connexion' },
  },
  {
    path: '/',
    name: 'dashboard',
    component: () => import('@/pages/DashboardPage.vue'),
    meta: { title: 'Tableau de bord' },
  },
  {
    path: '/rendez-vous',
    name: 'appointments',
    component: () => import('@/pages/AppointmentsPage.vue'),
    meta: { title: 'Rendez-vous', permission: 'appointments' },
  },
  /*
   * Traitement des rendez-vous confirmés.
   *
   * La page « /rendez-vous » reste en place et garde tous les statuts :
   * c'est là que les demandes sont acceptées ou refusées. Celle-ci prend la
   * suite — présence, bureau, agent, paiement, reçu — et ne montre donc que
   * les rendez-vous déjà décidés.
   */
  // Ancien lien : la page « Demandes du site » n'existe plus, les demandes sont dans « Rendez-vous ».
  { path: '/demandes', redirect: { name: 'appointments' } },
  {
    path: '/tarifs',
    name: 'tarifs',
    component: () => import('@/pages/TarifsPage.vue'),
    meta: { title: 'Tarifs du site', permission: 'tarifs' },
  },
  {
    path: '/soins-capillaires',
    name: 'soins',
    component: () => import('@/pages/SoinsPage.vue'),
    meta: { title: 'Soins capillaires', permission: 'soins' },
  },
  {
    path: '/textes-du-site',
    name: 'siteTexts',
    component: () => import('@/pages/SiteTextsPage.vue'),
    meta: { title: 'Textes et règles du site', permission: 'site_texts' },
  },
  {
    path: '/images-des-pages',
    name: 'sitePhotos',
    component: () => import('@/pages/SitePhotosPage.vue'),
    meta: { title: 'Images des pages', permission: 'site_photos' },
  },
  // Anciens liens : « Coiffures du site » est désormais la page Prestations ; « Photos du site » a été renommée.
  { path: '/coiffures-du-site', redirect: { name: 'services' } },
  { path: '/photos-du-site', redirect: { name: 'sitePhotos' } },
  {
    path: '/rendez-vous-confirmes',
    name: 'confirmed',
    component: () => import('@/pages/ConfirmedAppointmentsPage.vue'),
    meta: { title: 'Rendez-vous confirmés', permission: 'appointments' },
  },
  {
    path: '/rendez-vous-confirmes/:id',
    name: 'operation',
    component: () => import('@/pages/AppointmentOperationPage.vue'),
    meta: { title: 'Fiche de rendez-vous', permission: 'appointments' },
  },
  {
    path: '/prestations',
    name: 'services',
    component: () => import('@/pages/ServicesPage.vue'),
    meta: { title: 'Prestations', permission: 'catalog' },
  },
  {
    path: '/categories',
    name: 'categories',
    component: () => import('@/pages/CategoriesPage.vue'),
    meta: { title: 'Catégories', permission: 'catalog' },
  },
  {
    path: '/avis',
    name: 'testimonials',
    component: () => import('@/pages/TestimonialsPage.vue'),
    meta: { title: 'Avis clientes', permission: 'catalog' },
  },
  {
    path: '/calendrier',
    name: 'calendar',
    component: () => import('@/pages/CalendarPage.vue'),
    meta: { title: 'Calendrier des jours', permission: 'appointments' },
  },
  {
    path: '/horaires',
    name: 'hours',
    component: () => import('@/pages/HoursPage.vue'),
    meta: { title: 'Horaires d’ouverture', permission: 'schedule' },
  },
  {
    path: '/fermetures',
    name: 'closures',
    component: () => import('@/pages/ClosuresPage.vue'),
    meta: { title: 'Fermetures exceptionnelles', permission: 'schedule' },
  },
  {
    path: '/messages',
    name: 'messages',
    component: () => import('@/pages/MessagesPage.vue'),
    meta: { title: 'Messages', permission: 'messages' },
  },
  {
    path: '/clientes',
    name: 'customers',
    component: () => import('@/pages/CustomersPage.vue'),
    meta: { title: 'Clientes', permission: 'customers' },
  },
  {
    path: '/clientes/:id',
    name: 'customer',
    component: () => import('@/pages/CustomerPage.vue'),
    meta: { title: 'Fiche cliente', permission: 'customers' },
  },
  {
    path: '/whatsapp',
    name: 'whatsapp',
    component: () => import('@/pages/WhatsAppPage.vue'),
    // Réservé à l'administratrice : le serveur refuse tout autre compte, le menu ne fait que masquer.
    meta: { title: 'WhatsApp', permission: 'whatsapp' },
  },
  {
    path: '/paiements-jeko',
    name: 'jeko',
    component: () => import('@/pages/JekoPaymentsPage.vue'),
    // Réservé à l'administratrice : le serveur refuse tout autre compte, le menu ne fait que masquer.
    meta: { title: 'Paiements Jèko', permission: 'jeko' },
  },
  {
    path: '/messagerie',
    name: 'messaging',
    component: () => import('@/pages/MessagingPage.vue'),
    meta: { title: 'Messagerie', permission: 'messaging' },
  },
  /*
   * Comptabilité : le droit `accounting` n'appartient qu'à l'administratrice.
   * La garde évite d'ouvrir un écran qui ne renverrait que des 403 ; c'est le
   * serveur qui protège réellement.
   */
  {
    path: '/comptabilite',
    name: 'accounting',
    component: () => import('@/pages/AccountingPage.vue'),
    meta: { title: 'Comptabilité', permission: 'accounting' },
  },
  {
    path: '/caisse-du-jour',
    name: 'accountingDay',
    component: () => import('@/pages/AccountingDayPage.vue'),
    meta: { title: 'Caisse du jour', permission: 'accounting_day' },
  },
  {
    path: '/agents',
    name: 'agents',
    component: () => import('@/pages/AgentsPage.vue'),
    meta: { title: 'Agents & coiffeuses', permission: 'team' },
  },
  {
    path: '/bureaux',
    name: 'offices',
    component: () => import('@/pages/OfficesPage.vue'),
    meta: { title: 'Bureaux & salons', permission: 'team' },
  },
  {
    path: '/historique',
    name: 'history',
    component: () => import('@/pages/HistoryPage.vue'),
    meta: { title: 'Historique des prestations', permission: 'appointments' },
  },
  /*
   * Page gardée par un DROIT et non par un rôle : `meta.permission` porte le
   * même nom que côté API (`requirePermission('users')`). Déplacer la
   * frontière dans la table des permissions du backend suffit — cette route
   * n'a pas à être touchée.
   *
   * Cette garde évite seulement d'ouvrir un écran qui ne renverrait que des
   * 403. Elle ne protège rien : c'est le serveur qui refuse.
   */
  {
    path: '/utilisateurs',
    name: 'users',
    component: () => import('@/pages/UsersPage.vue'),
    meta: { title: 'Utilisateurs', permission: 'users' },
  },
  {
    path: '/parametres',
    name: 'salon',
    component: () => import('@/pages/SalonPage.vue'),
    meta: { title: 'Paramètres du salon', permission: 'salon' },
  },
  {
    path: '/compte',
    name: 'account',
    component: () => import('@/pages/AccountPage.vue'),
    meta: { title: 'Mon compte' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/NotFoundPage.vue'),
    meta: { title: 'Page introuvable' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Une seule vérification par chargement d'application : le jeton éventuel
  // est validé côté serveur, jamais décodé ici.
  await auth.restore()

  if (to.meta.public) {
    // Déjà connecté : inutile de repasser par le formulaire.
    if (auth.isAuthenticated) return { name: 'dashboard' }
    return true
  }

  if (!auth.isAuthenticated) {
    // On mémorise la destination pour y revenir après la connexion.
    return { name: 'login', query: to.fullPath === '/' ? {} : { suite: to.fullPath } }
  }

  // Droit manquant : on renvoie au tableau de bord plutôt que d'afficher un
  // écran d'erreur pour une page que la personne n'a pas à voir.
  if (to.meta?.permission && !auth.can(to.meta.permission)) return { name: 'dashboard' }

  return true
})

/*
 * Filet contre les déploiements à cheval.
 *
 * Les vues sont chargées à la demande : leur fichier est téléchargé au moment
 * où l'on arrive dessus. Si un nouveau build a été mis en ligne entre-temps,
 * ce fichier n'existe plus sous le nom que la page connaît — le chargement
 * échoue, la vue n'apparaît jamais et l'écran reste figé sur la page
 * précédente, adresse déjà changée. C'est silencieux et très déroutant.
 *
 * On recharge alors la page une seule fois, ce qui va rechercher la version
 * à jour. Le drapeau en sessionStorage évite toute boucle : si le rechargement
 * ne suffit pas, l'erreur est laissée telle quelle plutôt que de tourner sans
 * fin.
 */
const RELOAD_FLAG = 'bh_admin_chunk_reload'

router.onError((error, to) => {
  const message = String(error?.message ?? '')
  const chargementRate =
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      message,
    )
  if (!chargementRate || !to?.fullPath) return

  let dejaTente = false
  try {
    dejaTente = sessionStorage.getItem(RELOAD_FLAG) === '1'
    sessionStorage.setItem(RELOAD_FLAG, '1')
  } catch {
    // Navigation privée ou stockage bloqué : on tente le rechargement une fois.
  }
  if (!dejaTente) window.location.assign(to.fullPath)
})

router.afterEach(() => {
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    /* sans importance */
  }
})

router.afterEach((to) => {
  document.title = to.meta?.title
    ? `${to.meta.title} — Beauté Halal Admin`
    : 'Beauté Halal — Administration'
})

export default router
