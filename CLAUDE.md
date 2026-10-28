# CraftYourChess

Application web (PWA installable) pour explorer les stats et les parties d'un joueur sur Lichess et Chess.com. Projet perso, prototype qui évolue vite. 100 % navigateur, local-first, sans backend. En ligne sur https://craftyourchess.com, en lancement très discret : gratuit, open source, sans compte, sans pub ni traçage (des dons peut-être plus tard, voir la vision).

- Vision produit (réflexions en cours, rien de définitif) : [docs/vision.md](docs/vision.md)
- Décisions et justifications : [docs/decisions.md](docs/decisions.md). **À mettre à jour à chaque nouveau choix structurant.**
- Design (thème « L'Établi ») : [docs/design.md](docs/design.md)
- APIs Lichess / Chess.com, limites de débit : [docs/apis.md](docs/apis.md)
- Feuille de route : [docs/roadmap.md](docs/roadmap.md)
- Cache des analyses dans le navigateur (conception et règles) : [docs/analysis-cache.md](docs/analysis-cache.md)
- Parties des comptes dans le navigateur, synchro incrémentale : [docs/game-store.md](docs/game-store.md)
- Analyse de fond des joueurs favoris : [docs/background-analysis.md](docs/background-analysis.md)
- Checklists en cours, à supprimer une fois terminées : [docs/domain-craftyourchess.md](docs/domain-craftyourchess.md) (finitions du domaine), [docs/staging.md](docs/staging.md) (environnement de staging, reporté), [docs/logo-prompt.md](docs/logo-prompt.md) (prompt logo pour ChatGPT et Gemini), [docs/identity-brief.md](docs/identity-brief.md) (identité visuelle avec Claude Design)

## Commandes

Raccourcis : `make dev`, `make build`, `make preview`, `make check`, `make clean` (`make` seul affiche la liste). Ils appellent les scripts pnpm ci-dessous et lancent `pnpm install` automatiquement si besoin.

```bash
pnpm dev                  # serveur de dev (http://localhost:5173)
pnpm check                # typecheck + lint + format:check + tests : à lancer avant chaque commit
pnpm test                 # vitest en mode watch
pnpm build                # build de prod + service worker PWA, dans dist/
pnpm format               # prettier --write
pnpm dlx shadcn@latest add <composant>   # ajouter un composant shadcn/ui
pnpm generate-pwa-assets  # régénérer les icônes après une modification de public/favicon.svg
```

pnpm uniquement (pas npm ni yarn). Node ≥ 24.

## Stack

Vite + React 19 + TypeScript (strict, `noUncheckedIndexedAccess`) · Paraglide JS (i18n) · TanStack Router (routes sous forme de fichiers) + TanStack Query · Tailwind v4 + shadcn/ui (Radix, icônes Lucide) · `@lichess-org/chessground` (plateau) + chessops (règles, PGN) · Stockfish 19 lite (WASM mono-thread) · Dexie (IndexedDB : parties des comptes, cache des analyses) · ECharts, installé mais pas encore utilisé · vite-plugin-pwa · Vitest + Testing Library · oxlint + Prettier.

## Organisation du code

```
src/
  paraglide/          # GÉNÉRÉ par Paraglide depuis messages/*.json (git-ignoré, ne pas éditer)
  routes/             # une route par fichier (TanStack Router), routeTree.gen.ts est généré automatiquement
  components/ui/      # composants shadcn, générés par la CLI, modifiables
  theme/              # thème « L'Établi » : tokens (etabli.css) et polices (fonts/)
  routes/player/      # page du joueur, un onglet par fichier : Parties (history, où arrive le profil ; index y redirige, l'aperçu est une fenêtre de l'en-tête, ProfileButton), Analyse (analysis), Résultats (results), un onglet fermable par entraînement (training.$number) ; la session d'analyse est portée par route.tsx. routes/analysis/ ne fait que rediriger les anciennes adresses
  components/         # composants applicatifs partagés (board/, SettingsMenu, Footer, FeedbackLink…)
  hooks/              # hooks transverses (useConfirm, useKeepAwake, usePageMeta : titre et référencement de chaque page)
  features/<nom>/     # code propre à une fonctionnalité, à créer au besoin
  features/player/    # profil croisé : summary.ts (normalisation), search.ts (paramètres ?lichess=&chesscom=), recentSearches.ts, profileSettings.ts (réglages gardés par joueur), hook, composants, rating/ (graphique de l'Elo)
  features/games/     # résumé commun d'une partie (normalize.ts), table des parties (GamesTable), magasin des parties des comptes (store.ts, periods.ts)
  features/history/   # onglet Parties : feed.ts (fusion paginée Lichess + Chess.com), queries.ts
  features/review/    # analyse : criteria.ts, selection.ts, fetch.ts (recherche), estimate.ts, errors.ts (erreur, coup valide), analyze.ts (deux passes, approfondissement), cache.ts (évaluations gardées par position dans IndexedDB), library.ts (parties des comptes ou importées), themes.ts (thèmes des erreurs), phases.ts, settings.ts, session des onglets d'analyse (session.tsx), graphique d'évaluation (components/EvalChart.tsx)
  features/training/  # rejouer ses erreurs : session.ts (reducer), order.ts (ordre de jeu, options), settings.ts (options mémorisées), coach.ts (Stockfish), moves.ts (FEN/UCI), evaluation.ts
  features/import/    # import de parties PGN : pgn.ts (lecture, joueur, côté), store.ts (lot en mémoire), fenêtre d'import et onglet Parties d'un import
  features/background/ # analyse de fond des joueurs favoris : favorites.ts (favoris, nombre de parties), runner.ts (boucle), étoile du profil, indicateur de l'en-tête, réglages
  features/contact/   # formulaire de retours (FeedbackForm)
  lib/lichess/        # client HTTP, types, queryOptions de l'API Lichess
  lib/chesscom/       # idem pour l'API Chess.com
  lib/engine/         # Stockfish WASM : protocole UCI, Worker, pool de moteurs
  lib/http.ts         # fetchJson, ApiError, null sur 404, politique de retry
  lib/format.ts       # formats (nombres, dates, pays…) dans la langue courante
  lib/contact.ts      # envoi des retours via Web3Forms (clé VITE_WEB3FORMS_KEY)
  lib/db.ts           # base Dexie `craftyourchess` (parties des comptes, cache des analyses)
  lib/activity.ts     # activités du joueur (Stockfish, téléchargements de parties) : le travail de fond leur cède la place
  lib/localData.ts    # clearLocalData() (localStorage et base IndexedDB) et migration des anciennes clés chessme:*
  lib/project.ts      # lien du code source, hébergeur, adresse de contact
  lib/                # utilitaires transverses
  test/setup.ts       # setup Vitest (jest-dom, fake-indexeddb)
messages/en.json, fr.json  # traductions (source de vérité)
project.inlang/       # configuration Paraglide (langues, langue de base)
```

## Conventions

- **Code, identifiants et commentaires en anglais. Interface utilisateur bilingue anglais / français** (voir ci-dessous).
- Imports avec l'alias `@/` (correspond à `src/`).
- Prettier : pas de point-virgule, guillemets simples, 100 colonnes. Les classes Tailwind sont triées automatiquement.
- Tests à côté du code (`foo.test.ts`). Tester en priorité la logique pure : parsing, calculs de stats, synchro.
- Appels réseau : une fonction dans `lib/<source>/client.ts` (via `fetchJson`), puis un `queryOptions` dans `queries.ts`. « Compte inexistant » vaut `null`, pas une erreur. Les loaders font un `prefetchQuery` (qui ne lève jamais d'erreur) et les composants un `useQuery`, en gérant les états chargement / absent / erreur source par source.
- **Ne jamais additionner ni convertir des Elo entre plateformes.** Seuls les compteurs et les dates se combinent (voir `summary.ts`).
- Données persistantes : Dexie, pour les parties des comptes (docs/game-store.md) et le cache des analyses (docs/analysis-cache.md). Les autres données distantes (profil, statistiques, onglet Parties pour l'instant) : TanStack Query. Ne pas dupliquer l'une dans l'autre.
- **Couleurs : uniquement via les tokens** (`bg-card`, `bg-field`, `text-muted-foreground`, `text-win`, `text-title`…) définis dans `src/theme/etabli.css`. Jamais de code hexadécimal dans un composant. Un seul bouton principal par écran (voir `docs/design.md`).
- chessground gère lui-même son DOM : passer par le wrapper `components/board/Board.tsx`, sans le manipuler depuis React.

## Internationalisation (obligatoire)

L'interface existe en **anglais (langue de base) et en français**. Langue initiale : le choix enregistré dans le `localStorage` (clé `PARAGLIDE_LOCALE`), sinon la langue du navigateur, sinon l'anglais. Le sélecteur EN / FR est dans l'en-tête, et changer de langue recharge la page.

- **Aucun texte visible en dur dans les composants** : tout passe par `m.<clé>()` (`import { m } from '@/paraglide/messages'`). Cela vaut aussi pour `title`, `aria-label`, `placeholder` et les messages d'erreur.
- **Chaque nouvelle clé est ajoutée en même temps dans `messages/en.json` et `messages/fr.json`.** Une clé absente d'une langue retombe sur l'anglais, sans erreur : vérifier les deux fichiers.
- Clés en `snake_case`, paramètres nommés : `"view_on": "View on {platform}"`. Pluriels avec `declarations` / `match` (exemple : `games_count`).
- Les libellés définis au niveau du module sont des **fonctions** (`label: m.category_blitz`), appelées au rendu. Jamais `m.x()` au niveau du module.
- Les noms de marques ne se traduisent pas (Lichess, Chess.com, Puzzle Storm, Daily…).
- Nombres, dates, pays, listes : `lib/format.ts`, qui suit la langue courante. Ne pas créer d'`Intl.*` avec une locale codée en dur.
- `src/paraglide/` est régénéré par le plugin Vite (dev, build, tests) et par `pnpm i18n` (lancé par `pnpm typecheck`).

## Règles à respecter

- **API Lichess : une seule requête à la fois**. Sur un 429, attendre 60 s. Ne jamais paralléliser les exports de parties.
- **Stockfish et téléchargements de parties du joueur** : tout nouvel usage passe par `lib/activity.ts` (`withActivity` / `beginActivity`), pour que l'analyse de fond lui cède la place. Les clients `lib/lichess` et `lib/chesscom` le font déjà pour les parties.
- Licence : **GPL-3.0** (fichier `LICENSE`), imposée par chessground, chessops et Stockfish. Le lien « Code source » du pied de page doit rester visible (`lib/project.ts`), et toute nouvelle dépendance doit être compatible avec la GPL.
- **Vie privée** : tout nouveau stockage local (clé `localStorage` préfixée `craftyourchess:`, base IndexedDB) ou tout nouveau service tiers appelé doit être **déclaré sur la page `/legal`**, et le stockage doit être **effacé par `clearLocalData()`** (`lib/localData.ts`).
- Stockfish multi-thread exige les en-têtes COOP/COEP : à configurer à la fois dans Vite et chez l'hébergeur le jour où on l'ajoute (voir docs/decisions.md).
- pnpm 11 refuse par défaut les versions publiées très récemment : c'est voulu, ne pas forcer.
- **Déploiement** : Render (site statique), configuré dans `render.yaml`, servi sur **https://craftyourchess.com** (domaine chez Cloudflare, `CNAME` en DNS only vers `craftyourchess-2rcp.onrender.com`). Un push sur `main` redéploie le site une fois la CI GitHub verte. On travaille sur `develop` et on ne merge sur `main` (en fast-forward) que ce qui doit partir en ligne. **Aucun push, même sur `develop`, sans l'accord explicite de l'utilisateur** : committer, puis demander. La clé `VITE_WEB3FORMS_KEY` est définie dans l'environnement du service Render et dans le `.env` local (git-ignoré).
- **Référencement** : chaque page appelle `usePageMeta` (titre, `noindex` pour les pages de joueur). Une nouvelle page publique s'ajoute aussi à `public/sitemap.xml`.
- Adresse de contact : `craftyourchess@gmail.com`, aussi celle du compte Web3Forms.
