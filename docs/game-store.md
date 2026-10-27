# Parties des comptes dans le navigateur : conception

Garder dans le navigateur les parties déjà récupérées sur Lichess et Chess.com, et ne plus demander aux plateformes que ce qui manque. Aujourd'hui, réanalyser 500 parties est instantané côté moteur (voir [analysis-cache.md](analysis-cache.md)) mais demande encore environ 20 s de téléchargement : Lichess envoie environ 20 parties par seconde sans token. Décision résumée dans [decisions.md](decisions.md) (2026-10-23).

État : implémenté le 2026-10-23 pour la recherche des parties de l'analyse (`features/games/store.ts`, `features/games/periods.ts`, `features/review/fetch.ts`). L'onglet Parties télécharge encore lui-même ses pages.

## Principes

1. **Un magasin qui grandit au fil des recherches**, pas un import complet imposé. Une carrière de 10 000 parties prendrait environ 8 minutes sur Lichess : on ne télécharge que ce que les recherches demandent, et on le garde.
2. **On sait exactement ce qu'on a.** Pour chaque compte, on note les périodes couvertes (Lichess) ou les mois lus (Chess.com). Une recherche entièrement couverte ne fait aucune requête, sauf la mise à jour des parties récentes.
3. **On garde les parties brutes**, telles que les API les donnent. La normalisation (`fromLichessGame`, `fromChessComGame`) reste dans le code et peut évoluer sans tout retélécharger.
4. **Rien ne se perd sur un arrêt.** Ce qui est arrivé est écrit au fil de l'eau, et la période couverte avance avec.
5. **C'est un cache.** Le navigateur peut l'effacer ; la recherche retombe alors sur les plateformes, comme aujourd'hui.

## Ce que ça change pour l'utilisateur

- Première recherche de 500 parties : même durée qu'aujourd'hui.
- Recherches suivantes : seulement les nouvelles parties depuis la dernière fois (souvent une requête presque vide), puis lecture locale. Une analyse de 500 parties déjà vues passe d'environ 20 s à environ 1 s.
- La barre de progression reste : elle compte les parties trouvées sur place puis celles qui arrivent.

## Schéma Dexie

Dans la base `craftyourchess` existante (`lib/db.ts`), une `db.version(2)` qui ajoute deux tables. Le magasin dans `features/games/store.ts`, les périodes dans `features/games/periods.ts`, les recherches dans `features/review/fetch.ts`.

```ts
/** A game of an account, as the platform's API gives it. Key: [account+id] */
type StoredGame = {
  /** 'lichess:alice': platform and lowercase username */
  account: string
  /** Lichess id, or Chess.com uuid */
  id: string
  /** End of the game (ms): the order of the lists, as ReviewGame.playedAt */
  playedAt: number
  /** Lichess only: start of the game (ms), the date the API filters on */
  createdAt?: number
  /** The game seen from the account's side, to filter without parsing the moves */
  summary: GameSummary
  /** Rules `summary` was made with (SUMMARY_VERSION): made again from `raw` when they change */
  summaryVersion: number
  raw: LichessGame | ChessComGame
}

/** What is known of an account's games. Key: account */
type AccountSync = {
  account: string
  /** Lichess: per perf (bullet, blitz…), the periods whose games are all stored (createdAt, ms) */
  lichess?: Record<string, Period[]>
  /** Chess.com: when each month ('2026/10') was read (ms) */
  chesscomMonths?: Record<string, number>
  /** Last search on this account, for eviction */
  usedAt: number
}
```

```ts
db.version(2).stores({
  accountGames: '[account+id], [account+playedAt]',
  accountSync: 'account, usedAt',
})
```

- `accountGames` : une ligne par compte et par partie. Quand deux comptes cherchés se sont affrontés, leur partie est enregistrée deux fois : c'est rare, sans gravité, et bien plus simple qu'une liste de comptes par partie (chaque compte garde ses propres périodes et s'évince seul). Supprimer les parties d'un compte (éviction, favori retiré) ne touche donc jamais celles d'un autre, même leurs parties communes.

- Le **résumé** (`GameSummary`, vu du compte) est calculé à l'écriture : `matchesSelection` s'applique directement dessus, sans lire les coups (lire le PGN d'une partie Chess.com coûte cher). Seules les parties retenues sont normalisées.
- `[account+playedAt]` sert aussi à tout supprimer pour un compte (éviction), et à lire les parties d'un compte de la plus récente à la plus ancienne, ou sur une période.

## Lichess : périodes couvertes, par cadence

L'API filtre par cadence (`perfType`), par couleur et par classée/amicale. Ne télécharger que les cadences demandées compte vraiment (un joueur qui veut ses 100 dernières parties de blitz alors qu'il joue surtout en bullet). La couverture se tient donc **par cadence**. La couleur et classée/amicale restent filtrées sur place : on télécharge les deux, pour ne pas multiplier les périodes (au pire deux fois plus de parties).

- Une **période** `{ from, to }` (sur `createdAt`, la date que filtre l'API) veut dire : toutes les parties standard de cette cadence commencées dans cet intervalle sont enregistrées. Plusieurs périodes par cadence, fusionnées dès qu'elles se touchent.
- **Ce qui manque** pour une recherche = la période demandée moins les périodes couvertes, cadence par cadence. Les cadences qui ont les mêmes manques partagent une requête (le cas courant : elles ont toujours été cherchées ensemble). Sinon, une requête par groupe, l'une après l'autre.
- **Parties terminées seulement** : l'API n'exporte pas une partie en cours, et filtre sur la date de début. Une partie commencée avant une recherche mais finie après serait manquée. Une période enregistrée s'arrête donc **avant** sa requête : 3 h avant pour les cadences en direct, 60 jours pour la correspondance (la marge qu'utilise déjà `fetch.ts`). La recherche suivante redemande naturellement ce bout, et les doublons sont écrasés par leur identifiant. Pendant la recherche elle-même, ce qu'elle vient de télécharger compte comme couvert.
- **Ordre des requêtes** : toujours l'ordre normal de l'export, de la plus récente à la plus ancienne. Sur un arrêt, tout ce qui va de `until` à la dernière partie reçue est là : la période s'enregistre jusque-là. Une page incomplète (moins de parties que `max`) couvre toute la période demandée ; une période qui part de 0 veut dire qu'on a atteint la première partie. Pas besoin de `sort=dateAsc`.
- **Une requête après l'autre**, la plus récente lacune d'abord, pour les cadences qui ont exactement la même : la correspondance (60 jours ouverts) part dans sa propre requête, les cadences en direct ensemble.
- **Pas encore de file unique** pour toutes les requêtes Lichess de l'app : comme avant, la page d'analyse attend que la recherche d'une analyse en cours soit finie avant de chercher.

### L'algorithme (« les N dernières » comme une période)

1. Pour chaque cadence demandée, les **lacunes** de l'intervalle cherché : `[0, maintenant]` pour les N dernières, la période choisie (avec la marge de `fetch.ts` : 1 jour, 60 jours avec la correspondance) sinon.
2. Le **plancher** est la fin de la plus récente lacune, toutes cadences confondues : au-dessus, toutes les parties sont là. Lire sur place les parties commencées au-dessus du plancher qui passent les filtres, de la plus récente à la plus ancienne, au plus N.
3. Assez de parties, ou plus aucune lacune : c'est fini. Sinon, demander la plus récente lacune (`max` : ce qui manque, au moins 100 si des filtres s'appliquent ici, comme avant), enregistrer, et recommencer.

Résultat, la deuxième fois : les 3 dernières heures des cadences en direct, et 60 jours de correspondance (deux petites requêtes), puis une lecture locale. Une période passée déjà couverte ne fait aucune requête.

## Chess.com : mois lus

Chess.com ne sert que des mois entiers, toutes cadences confondues : la couverture est naturellement par mois.

- La liste des mois (`/games/archives`) est redemandée à chaque recherche (une requête).
- **Un mois passé est définitif** une fois lu plus de 24 h après sa fin (le délai de cache de Chess.com, jusqu'à 12 h) : on ne le redemande jamais.
- Le mois en cours, et le précédent tant qu'il n'est pas définitif, sont redemandés à chaque recherche, comme avant.
- Toujours en série, du plus récent au plus ancien, en s'arrêtant dès qu'on a assez de parties.

## Lecture

- Lire `accountGames` par `[account+playedAt]` de la plus récente à la plus ancienne, appliquer `matchesSelection` au résumé gardé, puis normaliser seulement ce qui reste (`fromLichessGame` / `fromChessComGame`).
- Si les règles du résumé changent, augmenter `SUMMARY_VERSION` : les résumés d'avant sont refaits à partir de `raw` à la lecture.
- **Repli** : toute erreur du magasin (`GameStoreError`, à distinguer d'une erreur des plateformes) relance la recherche sans lui, comme avant.

## Ce qui ne change pas (et pourquoi)

- **Les évaluations Lichess ajoutées après coup** (analyse serveur demandée plus tard) ne sont pas rafraîchies. C'est sans gravité : notre propre moteur évalue ce qui manque, et le cache d'analyses le garde.
- **Le profil et les statistiques** (fenêtre du profil) restent dans TanStack Query : ce sont des données courtes, toujours redemandées.
- **Une partie supprimée** ou un compte fermé sur la plateforme reste dans le magasin jusqu'à son éviction. On l'accepte.

## Place et éviction

- Environ **3 Ko par partie** (Lichess avec horloges et évaluations, Chess.com avec son PGN et ses horloges) : 10 000 parties ≈ 30 Mo.
- **Plafond par appareil** (`lib/storageLimits.ts`) : 100 000 parties sur ordinateur (≈ 300 Mo), 15 000 sur téléphone (≈ 45 Mo). Au-delà, ou sur une `QuotaExceededError`, après chaque recherche, jusqu'à 90 % du plafond :
  1. **des comptes entiers**, les moins récemment cherchés (`accountSync.usedAt`), jamais ceux des favoris ni celui en cours ;
  2. puis **les parties les plus anciennes** des comptes restants (index `playedAt`, base en version 3), favoris compris. Leurs périodes Lichess repartent après la plus récente partie retirée, et les mois Chess.com touchés sont oubliés : ce qu'on sait reste juste, et une recherche ancienne redemanderait simplement ces parties.
- Même règle que le cache d'analyses : une écriture refusée ne fait jamais échouer la recherche.

## Vie privée et effacement

- Les parties sont publiques, mais elles sont maintenant stockées : à déclarer sur `/legal` (« les parties des comptes que vous avez cherchés, telles que Lichess et Chess.com les publient, pour ne pas les retélécharger »).
- `clearLocalData()` supprime déjà toute la base.
- Réglages : la section « Données enregistrées » (nombre de parties, vider en gardant les joueurs cochés) a été retirée le 2026-10-24 ; le détail reviendra au clic sur l'indicateur de synchronisation de l'en-tête. `storedAccounts`, `clearGameStore` et `deleteStoredAccounts` restent dans `store.ts` pour cela.
- La règle de CLAUDE.md « Données distantes éphémères : TanStack Query, ne pas dupliquer » change : les parties des comptes passent dans Dexie, le reste des données distantes reste dans TanStack Query.

## Tests

- Périodes : fusion, manques d'une recherche, regroupement des cadences aux manques identiques.
- Lichess : mise à jour du présent avec chevauchement, recul par pages, première partie atteinte, arrêt en cours (la période avance jusqu'à la dernière partie reçue).
- Chess.com : mois définitifs jamais redemandés, mois en cours toujours redemandé.
- Recherche entièrement couverte : aucune requête en dehors du présent.
- Résultats identiques à aujourd'hui pour une même sélection (même jeu de parties, même ordre).
- Éviction par compte, et recherche qui continue sans magasin si IndexedDB échoue.

## Plus tard

- L'onglet **Parties** (`features/history`) lit le magasin au lieu de paginer l'API.
- Proposer un **import complet** d'un compte, en arrière-plan, pour les joueurs qui le veulent.
- Rafraîchir les évaluations Lichess des parties récentes sans analyse serveur.
