# Beauté Halal — Dashboard d'administration

Interface de gestion du salon **Beauté Halal**.
Vue 3 · Vite · Tailwind CSS v4 · Vue Router · Pinia · JavaScript.

```
Site public                          Dashboard admin
beaute-halal.aeemci-ce.ci            admin-beaute-halal.aeemci-ce.ci
            │                                    │
            └──────────────┬─────────────────────┘
                           ▼
              API Node.js existante
              backend-beaute-halal.aeemci-ce.ci/api
                           ▼
                   Base MySQL existante
```

> Le dashboard **n'a pas de backend et pas de base à lui**. Il consomme la même
> API que le site public, et n'accède **jamais** directement à MySQL ni à
> phpMyAdmin. Toute lecture et toute écriture passent par `src/services/`.

---

## Démarrage

```bash
npm install
copy .env.example .env   # puis vérifiez VITE_API_URL
npm run dev              # dashboard sur http://localhost:5174
npm run build            # build de production (dossier dist/)
npm run preview          # prévisualisation du build (port 4174)
npm run lint             # ESLint, avec correction automatique
npm run format           # Prettier sur src/
```

Le port **5174** est volontairement différent de celui du site public (5173) :
les deux peuvent tourner en même temps.

### Configuration requise côté backend

Trois valeurs du `.env` du backend doivent être corrigées, sans quoi le
dashboard ne pourra pas fonctionner. **Ces changements ne sont pas faits par ce
projet** — ils sont à reporter sur le serveur :

```env
# 1. Autoriser les origines réelles (aujourd'hui limité à localhost)
CORS_ORIGINS=https://beaute-halal.aeemci-ce.ci,https://admin-beaute-halal.aeemci-ce.ci,http://localhost:5173,http://localhost:5174

# 2. Sans cela, les images téléversées sont renvoyées avec une URL en localhost
API_URL=https://backend-beaute-halal.aeemci-ce.ci

# 3. Active la limitation de débit et les avertissements de sécurité
NODE_ENV=production
```

Sans le premier point, le navigateur bloque tous les appels avec une erreur CORS
et aucun écran ne charge de données.

---

## Architecture

```
dashboard_beaute_halal/
├─ index.html                 noindex/nofollow, polices, point d'entrée
├─ vite.config.js             Plugins Vue + Tailwind, alias "@", port 5174
├─ eslint.config.js           Règles ESLint (format plat, ESLint 9)
├─ vercel.json / netlify.toml Réécriture SPA + en-têtes de sécurité
├─ public/
│  ├─ .htaccess               Réécriture SPA + en-têtes — Apache / cPanel
│  ├─ _redirects              Réécriture SPA — Netlify
│  ├─ robots.txt              Disallow: / — jamais indexé
│  └─ favicon.svg
└─ src/
   ├─ main.js                 App + Pinia + routeur
   ├─ App.vue                 Choisit la coquille selon la route
   ├─ style.css               Tokens de design et classes communes
   ├─ router/index.js         Routes + garde d'authentification
   ├─ services/
   │  ├─ http.js              ★ CLIENT HTTP UNIQUE — jeton, erreurs, 401
   │  └─ index.js             Une fonction par endpoint réellement exposé
   ├─ stores/
   │  ├─ auth.js              Session, restauration, expiration
   │  └─ toasts.js            Notifications d'action
   ├─ composables/
   │  └─ useResource.js       Chargement + erreur + « Réessayer »
   ├─ layouts/
   │  └─ AdminLayout.vue      Barre latérale, en-tête, tiroir mobile
   ├─ components/
   │  ├─ layout/SideNav.vue
   │  ├─ ui/                  BaseButton, BaseField, BaseToggle, BaseModal,
   │  │                       ConfirmDialog, DataState, StatusBadge,
   │  │                       SearchInput, ImageField, PageHeader,
   │  │                       CategoryManager, ToastStack, AdminIcon
   │  └─ appointments/        AppointmentDetail, MonthCalendar
   ├─ pages/                  Une page par section (14)
   └─ utils/format.js         Prix, durées, dates, libellés de statut
```

**Règle de couche** : aucun `fetch` en dehors de `src/services/http.js`.
Les pages appellent `src/services/index.js`, qui expose une fonction par
endpoint vérifié dans le code du backend.

---

## Sécurité

- **Aucune route n'est accessible sans session.** La garde du routeur valide le
  jeton auprès de `GET /admin/auth/me` avant d'afficher quoi que ce soit ; un
  jeton présent en stockage ne suffit jamais.
- **Le mot de passe n'est jamais conservé.** Il part une seule fois vers
  `POST /admin/auth/login`, et seul le jeton renvoyé est gardé.
- **Expiration automatique.** Tout 401 sur une route protégée efface le jeton et
  renvoie à la connexion, avec mémorisation de la page demandée.
- **Aucun secret backend** dans ce projet : ni `JWT_SECRET`, ni identifiants de
  base, ni mot de passe. Le `.env` d'un front est public une fois déployé.
- **`noindex, nofollow`** dans le HTML, le `robots.txt` et les en-têtes HTTP,
  plus `X-Frame-Options: DENY` contre le détournement de clic.

---

## Ce que le dashboard sait faire

| Section | Endpoints utilisés |
| --- | --- |
| Connexion, compte | `POST /admin/auth/login`, `GET /me`, `POST /change-password`, `PATCH /users/:id` |
| Tableau de bord | `GET /admin/stats`, `GET /admin/appointments?from=&order=asc` |
| Rendez-vous | `GET/PATCH/DELETE /admin/appointments`, `PATCH /:id/status` |
| Prestations | `GET/POST/PATCH/DELETE /admin/services` |
| Catégories | `GET/POST/PATCH/DELETE /admin/service-categories` |
| Nos coiffures | `GET/POST/PATCH/DELETE /admin/gallery` et `/admin/gallery-categories` |
| Équipe | `GET/POST/PATCH/DELETE /admin/team` |
| Avis | `GET/POST/PATCH/DELETE /admin/testimonials` |
| Horaires | `GET /admin/opening-hours`, `PUT /admin/opening-hours` |
| Créneaux | `GET/POST/PATCH/DELETE /admin/time-slots` |
| Fermetures | `GET/POST/DELETE /admin/closures` |
| Messages | `GET/PATCH/DELETE /admin/messages` |
| Paramètres | `GET /admin/salon`, `PUT /admin/salon` |
| Images | `POST /admin/uploads`, `DELETE /admin/uploads/:filename` |

### Ce qu'il ne fait pas, et pourquoi

- **Le prix et la durée d'un rendez-vous ne sont pas modifiables.** L'API ne les
  expose pas en écriture : le serveur les fige à la réservation d'après la
  prestation. Les afficher modifiables serait mentir.
- **Aucune statistique inventée.** Chiffre d'affaires, taux de remplissage,
  évolution mensuelle : l'API ne les calcule pas, ils n'apparaissent donc pas.
- **Les fermetures se créent jour par jour.** `POST /admin/closures` prend une
  date ; une période est enregistrée par une série d'appels, sans inventer
  d'endpoint de plage.
- **Le calendrier charge 100 rendez-vous par mois au maximum**, la limite de
  pagination de l'API.

---

## Nos coiffures et la prestation associée

Depuis la migration `002_gallery_service.sql` du backend, une réalisation porte
un `service_id` facultatif. Le formulaire d'une coiffure propose donc un
sélecteur **« Prestation à réserver »** :

- une prestation choisie → sur le site public, « Réserver cette coiffure »
  présélectionne cette prestation et amène directement au choix de la date ;
- « Aucune prestation associée » → la cliente choisit sa prestation elle-même.

Seules les prestations **actives** sont proposées : rattacher une prestation
désactivée mènerait la cliente dans une impasse. Supprimer une prestation ne
supprime jamais une coiffure — la contrainte est `ON DELETE SET NULL`, la photo
perd seulement son raccourci de réservation.

---

## Déploiement

Le build produit un dossier `dist/` statique, à publier sur
`https://admin-beaute-halal.aeemci-ce.ci`.

**Le serveur doit renvoyer `index.html` pour toute adresse inconnue**, sinon un
rafraîchissement sur `/rendez-vous` donne une 404.

| Hébergeur | Fichier | Action |
| --- | --- | --- |
| Apache / cPanel | `public/.htaccess` | Rien à faire, copié dans `dist/` |
| Netlify | `netlify.toml` + `public/_redirects` | Rien à faire |
| Vercel | `vercel.json` | Rien à faire |
| Nginx | — | Ajoutez le bloc ci-dessous |

```nginx
location / {
  try_files $uri $uri/ /index.html;
  add_header X-Robots-Tag "noindex, nofollow";
  add_header X-Frame-Options "DENY";
}
```

Avant de publier : vérifiez `VITE_API_URL`, relancez `npm run build`, et
assurez-vous que le domaine du dashboard figure dans le `CORS_ORIGINS` du
backend.

---

## Identité visuelle

Mêmes couleurs que le site public — doré `#B08A57`, chocolat `#4A3528`, sable —
mais une application de travail : fond neutre `#F7F5F2`, surfaces blanches,
densité plus forte, pas d'animation décorative. Cormorant Garamond reste réservé
aux chiffres et à la marque ; Jost porte toute l'interface.

Les tokens sont définis une seule fois dans `src/style.css` (bloc `@theme`).

---

## Accessibilité et responsive

Vérifié à 1440, 1024, 768, 375 et 320 px : aucun débordement horizontal sur
aucune page. Les tableaux défilent dans leur propre conteneur (`.table-scroll`),
jamais la page.

Les fenêtres modales et le tiroir de navigation sont de vraies boîtes de
dialogue : focus déplacé à l'ouverture, piégé à l'intérieur, Échap ferme, focus
rendu au bouton d'origine.
