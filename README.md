# NOVA Fishing

Jeu de pêche 2D en pixel art, vue du dessus, jouable dans le navigateur sur PC et téléphone.
On navigue sur un océan procédural, on repère des ombres, on lance, on ferre au bon moment, on gagne le combat
à la jauge, puis on vend au port pour améliorer bateau et canne. La progression est liée au compte Discord.

- Règles et formules : [BALANCING.md](BALANCING.md)
- Variables d'environnement : [.env.example](.env.example)

## Sommaire

1. [Pile technique et écarts par rapport au cahier des charges](#pile-technique)
2. [Lancer en local](#lancer-en-local)
3. [Tests](#tests)
4. [Déploiement sur Railway, pas à pas](#déploiement-sur-railway-pas-à-pas)
5. [Sécurité et intégrité](#sécurité-et-intégrité)
6. [Module de récompenses (future passerelle NovaBot)](#module-de-récompenses)
7. [Limites connues](#limites-connues)

## Pile technique

| Couche | Choix |
|---|---|
| Langage | TypeScript partout |
| Rendu du jeu | Moteur Canvas 2D maison, rendu en basse résolution agrandi sans lissage (pixel-perfect) |
| Interface | React 19 |
| Build | esbuild (`scripts/build.mjs`) |
| Serveur | Node 22, module `http` natif, routeur maison (`packages/server/src/http.ts`) |
| Base | PostgreSQL via `pg`, SQL écrit à la main, migrations `.sql` numérotées appliquées au démarrage |
| Authentification | Discord OAuth2, Authorization Code + `state` + PKCE |
| Tests | `node:test` (règles et serveur), Playwright (parcours dans Chrome) |

### Écarts et raisons

Le cahier des charges demandait Phaser, Vite, Fastify, Prisma et Vitest. L'environnement où ce projet a été écrit
ne pouvait installer aucun paquet npm : du code écrit pour ces bibliothèques serait parti sans jamais avoir été
exécuté. Tout ce qui est listé ci-dessus a au contraire été lancé et testé pendant le développement.

| Demandé | Retenu | Conséquence |
|---|---|---|
| Phaser 3 | Canvas 2D maison | Zéro dépendance de rendu, bundle client de 300 ko. Pas de WebGL : suffisant ici car le jeu est dessiné à basse résolution (640 × 360 environ) puis agrandi. |
| Vite | esbuild | Même résultat (un bundle JS + un CSS). Pas de rechargement à chaud. |
| Fastify | `http` natif | Routeur, cookies, limites de taille et de débit écrits et testés ici. Les routes sont de simples fonctions : passer à Fastify plus tard est mécanique. |
| Prisma | `pg` + SQL | Même pratique que NovaBot (fichiers `.sql` numérotés). Quatre tables, une quinzaine de requêtes. |
| Vitest | `node:test` | Intégré à Node, aucune installation. |

Le seul module qui n'a pas pu être exécuté pendant le développement est l'adaptateur `pg`
(`packages/server/src/pg-store.ts`, le pilote n'étant pas installable) : voir [Limites connues](#limites-connues).

### Organisation

```
packages/shared   règles du jeu, pures et partagées : monde, espèces, combat, équipement, sauvegarde
packages/server   HTTP, OAuth2, sessions, stockage, validation de toutes les récompenses
packages/client   moteur Canvas (game/) et interface React (ui/)
tests             tests des règles, du serveur, et parcours Playwright (tests/e2e)
scripts           build, simulation d'équilibrage, vérification du SQL
```

## Lancer en local

Il faut Node 22 ou plus récent.

```bash
npm install
DEV_AUTH=1 MEMORY_STORE_FILE=.data/store.json npm run dev
```

Puis ouvrir <http://localhost:3000>. `DEV_AUTH=1` ajoute un bouton « Entrer sans Discord » ; sans `DATABASE_URL`,
les sauvegardes vont en mémoire (et dans le fichier indiqué). Ces deux facilités sont refusées en production.

## Tests

```bash
npm test             # 38 tests : monde, prix, cale, améliorations, combat, équilibrage, naufrage, serveur, récompenses
npm run test:e2e     # parcours complet dans Chrome (construit le projet, lance le serveur, joue une partie)
npm run balance      # tableaux d'équilibrage (joueurs simulés)
npm run typecheck    # vérification des types
DATABASE_URL=postgres://... npx tsx scripts/check-sql.ts   # migration + chaque requête SQL sur un vrai PostgreSQL
```

`test:e2e` cherche Chrome dans `/usr/bin` ; sinon, indiquer son chemin avec `CHROME=/chemin/vers/chrome`.
`check-sql.ts` travaille dans un schéma jetable `nf_check` qu'il supprime à la fin.

## Déploiement sur Railway, pas à pas

Le jeu est **un seul service** : le serveur Node sert à la fois l'API et les fichiers du client.
Il s'ajoute au projet Railway de NovaBot sans toucher aux services existants.

### 1. Configurer Discord OAuth2

1. Ouvrir <https://discord.com/developers/applications>.
2. Choisir l'application de NovaBot, ou en créer une dédiée avec **New Application** (recommandé : un secret
   distinct de celui du bot).
3. Menu **OAuth2** : noter le **Client ID**, puis **Reset Secret** pour obtenir le **Client Secret** (affiché une
   seule fois).
4. Toujours dans **OAuth2**, section **Redirects**, ajouter exactement :
   `https://VOTRE-DOMAINE/auth/discord/callback`
   (le domaine sera connu à l'étape 3 ; on peut revenir l'ajouter ensuite). Pour le local :
   `http://localhost:3000/auth/discord/callback`.
5. Enregistrer. Aucun bot, aucune permission, aucun autre réglage n'est nécessaire : le jeu ne demande que la
   portée `identify` (identifiant, pseudo, avatar).

### 2. Connecter GitHub à Railway

Si NovaBot est déjà déployé depuis GitHub, le compte est déjà relié. Il faut seulement que Railway voie ce dépôt :
sur GitHub, **Settings → Applications → Railway → Configure**, puis ajouter `nova-fishing` à la liste des dépôts
autorisés (ou « All repositories »).

### 3. Ajouter le service au projet Railway existant

1. Ouvrir le projet Railway de NovaBot.
2. **Create** (ou **+ New**) → **GitHub Repo** → choisir `nova-fishing`. Railway crée un nouveau service à côté des
   autres et lance un premier build (il échouera tant que les variables ne sont pas saisies : c'est normal).
3. Dans le service, onglet **Settings** :
   - **Build Command** : `npm run build`
   - **Start Command** : `npm start`
   - **Healthcheck Path** : `/health`
4. **Settings → Networking → Generate Domain** pour obtenir une adresse publique `…up.railway.app`.
   Pour un sous-domaine à vous (par exemple `peche.novabot-hub.fr`) : **Custom Domain**, puis créer chez Hostinger
   l'enregistrement CNAME que Railway indique.

Le dépôt ne contient volontairement pas de `railway.json` : la documentation de Railway annonce la fin de ce
format, les réglages se font donc dans l'onglet Settings.

### 4. Configurer PostgreSQL

Deux possibilités, au choix :

- **Réutiliser la base de NovaBot (le plus simple).** Le jeu crée et utilise son propre schéma `nova_fishing`
  dans cette base. Il n'y lit et n'y écrit rien d'autre : toutes ses requêtes sont préfixées par ce schéma, et les
  tables de NovaBot (schéma `public`) ne sont jamais touchées.
- **Une base séparée (isolation maximale).** Dans le projet : **Create → Database → PostgreSQL**. Coût : un
  service de base en plus.

Dans les deux cas, les tables sont créées toutes seules au premier démarrage (`packages/server/migrations`).

### 5. Variables d'environnement

Onglet **Variables** du service `nova-fishing` :

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `PUBLIC_URL` | l'adresse publique du jeu, en `https://`, sans barre finale |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — remplacer `Postgres` par le nom exact du service de base |
| `SESSION_SECRET` | 32 caractères aléatoires ou plus (un générateur de mots de passe convient) |
| `DISCORD_CLIENT_ID` | le Client ID de l'étape 1 |
| `DISCORD_CLIENT_SECRET` | le Client Secret de l'étape 1 |

Facultatives : `DB_SCHEMA` (défaut `nova_fishing`), `WORLD_SEED` (défaut `20261111` ; **ne plus la changer après
l'ouverture**, elle définit toute la carte), `DATABASE_SSL=1` (seulement avec l'adresse publique de la base),
`INTERNAL_API_TOKEN` (voir plus bas), `FRAME_ANCESTORS`. Ne pas définir `PORT` : Railway le fournit.

Si une variable obligatoire manque, le service s'arrête au démarrage avec la liste exacte de ce qui manque dans
les logs, au lieu de tourner à moitié.

### 6. Déployer

Chaque `git push` sur `main` redéploie. Après avoir saisi les variables, Railway relance un déploiement ; sinon,
**Deployments → Redeploy**. Le build fait `npm install` puis `npm run build` ; le démarrage applique les
migrations puis écoute sur le port fourni.

### 7. Vérifier que le jeu fonctionne

1. `https://VOTRE-DOMAINE/health` doit répondre `{"status":"ok",…}` (`db_down` et un code 503 si la base est
   injoignable).
2. Les logs du service doivent contenir `Prêt sur le port … (production, monde …, PostgreSQL schéma nova_fishing)`.
3. Ouvrir le jeu, cliquer **Se connecter avec Discord**, autoriser. On arrive à Port-Nova.
   - « redirect_uri invalide » côté Discord : l'adresse de l'étape 1.4 ne correspond pas exactement à
     `PUBLIC_URL` + `/auth/discord/callback`.
4. Pêcher un poisson, le vendre, redéployer le service, se reconnecter : les pièces doivent être là.

### 8. Ajouter un lien depuis l'accueil de NovaBot

Le jeu doit être servi à la racine de son propre domaine (ses adresses internes commencent par `/`), donc sur un
sous-domaine et non sur un chemin `/fishing` du site existant. Sur la page d'accueil de NovaBot, un simple lien
suffit :

```html
<a href="https://peche.novabot-hub.fr">Jouer à NOVA Fishing</a>
```

Le site de NovaBot n'a pas été modifié.

## Sécurité et intégrité

Le client affiche, le serveur décide.

- **Pêche.** Un lancer n'est accepté que sur une ombre que le serveur recalcule lui-même (même graine, même
  créneau), à portée du bateau, pas déjà résolue. Le serveur tire l'espèce et l'individu avec un sel secret, ouvre
  une session de pêche à identifiant unique et à usage unique, juge le ferrage à sa propre horloge, puis **rejoue
  le combat** à partir de la liste des appuis : c'est son résultat qui compte. Un combat « terminé » plus vite que
  le temps réel est refusé.
- **Économie.** Prix recalculés côté serveur à partir de spécimens qu'il a créés. Ventes, achats, améliorations
  et réparations se font sous verrou par joueur (`SELECT … FOR UPDATE` dans une transaction) : deux requêtes
  simultanées ne peuvent pas vendre deux fois le même poisson.
- **Déplacements.** La position envoyée est comparée à la vitesse maximale du bateau et au temps écoulé ; un saut
  impossible est refusé et le bateau replacé.
- **Sessions.** Jeton aléatoire de 256 bits dans un cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production ;
  seule son empreinte SHA-256 est en base. Durée : 30 jours.
- **Requêtes.** Corps JSON obligatoire et limité en taille, origine vérifiée, en-tête `X-NF-Client` exigé
  (anti-CSRF), limitation de débit par joueur et par adresse IP, en-têtes de sécurité (CSP, `nosniff`).
- **Secrets.** Le secret Discord ne quitte jamais le serveur.

## Module de récompenses

Table `reward_events`, alimentée par le jeu (trophées, captures légendaires et mythiques) : identifiant unique,
identifiant Discord du joueur, type, détail, date, statut de synchronisation (`pending`, `synced`, `failed`).
La contrainte d'unicité `(discord_id, reward_key)` interdit les doublons.

Rien n'est envoyé à NovaBot aujourd'hui, et le jeu ne dépend pas du bot. Le jour venu, NovaBot pourra lire et
acquitter les événements par une API interne, **désactivée tant que `INTERNAL_API_TOKEN` n'est pas défini** :

```
GET  /internal/rewards?status=pending&limit=50      Authorization: Bearer <INTERNAL_API_TOKEN>
POST /internal/rewards/ack   {"ids": ["…"], "status": "synced"}
```

## Limites connues

- **Adaptateur PostgreSQL non exécuté pendant le développement.** Le pilote `pg` n'était pas installable. Le
  schéma et chacune des requêtes ont été validés sur un PostgreSQL 16 réel par `scripts/check-sql.ts` (via
  `psql`), mais le fichier `pg-store.ts` lui-même tournera pour la première fois lors du premier déploiement.
  En cas d'erreur, elle apparaîtra au démarrage dans les logs Railway.
- **Vérification des types du client.** Les types de React n'étaient pas installables : `npm run typecheck` n'a
  été validé que pour `shared`, `server` et les tests. À relancer après `npm install`.
- **Pas de `package-lock.json`.** Il se crée au premier `npm install` ; le committer rendra les builds
  reproductibles.
- **Flux Discord testé contre un faux serveur Discord** (mêmes routes, mêmes paramètres), pas contre le vrai.
- **Sessions de pêche et rencontres en mémoire du serveur.** Un redémarrage pendant un combat fait perdre ce
  combat (pas la sauvegarde). Le service est prévu pour une seule instance.
- **Créatures hostiles.** Les dégâts sont appliqués par le serveur, mais c'est le client qui signale qu'une charge
  a touché : un client modifié pourrait esquiver à tous les coups. Il ne peut en revanche rien gagner ainsi.
- **Un joueur outillé peut automatiser le combat** (les paramètres du curseur lui sont envoyés). Il reste borné
  par le temps réel et par son équipement : le mur d'équipement de BALANCING.md s'applique aussi à un robot.
- **Trajets très longs.** Le calcul d'itinéraire est borné ; au-delà, le bateau va au point le plus proche du
  but et il faut fixer un nouveau cap.
- **Tests sur appareils réels non faits.** Le parcours a tourné dans Chrome sans écran, en 1280 × 720 et en
  390 × 780 tactile ; aucun essai sur un vrai téléphone ni sur Safari ou Firefox.
