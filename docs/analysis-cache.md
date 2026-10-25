# Cache des analyses : conception

Garder dans le navigateur tout ce que Stockfish a calculé, pour qu'une analyse relancée sur des parties déjà vues soit instantanée, et que chaque calcul profite aux suivants (ouvertures communes, approfondissement, changement de critères). Première version locale, sans backend. Décision résumée dans [decisions.md](decisions.md) (2026-10-23).

État : implémenté le 2026-10-23 (`lib/db.ts`, `features/review/cache.ts`, branché dans `analyze.ts`). Le bouton de mise à jour et l'usage par le coach restent pour plus tard.

## Principes

1. **On garde les évaluations, pas le jugement.** Les erreurs (`mistakes`, `opponentErrors`) dépendent des critères : elles sont recalculées à chaque fois par `judge`, ce qui est quasi gratuit. Changer de critères reste donc instantané.
2. **Une évaluation par position, pas par partie.** La clé est la position (FEN normalisée), pas la partie : les positions de répertoire ne sont calculées qu'une fois, une transposition est reconnue, et toute évaluation sert à toutes les parties qui passent par là.
3. **On garde tout ce qui a été fait**, tant qu'il y a de la place. On ne supprime que pour tenir sous un plafond (voir [Place et éviction](#place-et-éviction)).
4. **Chaque évaluation dit comment elle a été obtenue** (moteur, nœuds) : c'est ce qui permet de la réutiliser sans se tromper, et plus tard de proposer de mettre à jour les anciennes analyses.
5. **C'est un cache, pas une sauvegarde.** Le navigateur peut l'effacer : l'app doit toujours fonctionner sans, et l'interface ne promet jamais que c'est conservé.

## Ce qu'on garde, ce qu'on ne garde pas

| Gardé                                                                      | Pas gardé, et pourquoi                                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Évaluations de notre Stockfish (passe rapide, passe profonde, approfondir) | Erreurs, thèmes, phases : recalculés à partir des évaluations et des critères                                                         |
| Coups et position de départ de chaque partie analysée, et ses références   | Résumé complet de la partie (Elo, cadence, horloges) : c'est une donnée distante, qui reste dans TanStack Query                       |
| Version de l'analyse appliquée à chaque partie                             | Évaluations de Lichess (`serverCps`) et `[%eval]` d'un PGN : redonnées à chaque récupération de la partie, et d'un autre moteur       |
|                                                                            | Recherches du coach d'entraînement (MultiPV, `searchMoves`) : pas comparables à une évaluation normale (voir [Plus tard](#plus-tard)) |

## Schéma Dexie

Une base `craftyourchess` (la première base IndexedDB de l'app ; les parties importées pourront la rejoindre), dans `src/lib/db.ts`. Le code du cache lui-même dans `src/features/review/cache.ts`.

```ts
/** Score from the side to move, as the engine gives it */
type StoredScore = { cp: number } | { mate: number }

/** One engine evaluation of a position. Key: [key+engine] */
type CachedPosition = {
  /** Normalized FEN (see "Clé de position") */
  key: string
  /** Engine that produced it: ENGINE_ID (see "Versions") */
  engine: string
  score: StoredScore
  /** UCI, castling as the king move */
  bestMove: string
  /** Search budget asked for */
  nodes: number
  /** Last time this evaluation was read or written (ms), for eviction */
  usedAt: number
}

/** A game whose positions were evaluated. Key: hash */
type CachedGame = {
  /** Hash of the starting position and the moves (see "Identité des parties") */
  hash: string
  /** Where it comes from: 'lichess:abc123', 'chesscom:2026-10:uuid', 'import:<id>'. Several possible */
  refs: string[]
  initialFen?: string
  sanMoves: string[]
  playedAt: number
  /** How it was analysed last (see "Versions") */
  analysis: { version: number; engine: string; quickNodes: number; deepNodes: number }
  usedAt: number
}
```

```ts
db.version(1).stores({
  positions: '[key+engine], usedAt',
  games: 'hash, *refs, usedAt',
})
```

- `positions` : une entrée par position et par moteur. La clé composée permet de garder, à côté, les évaluations d'un ancien moteur après une mise à jour (elles servent d'indices, voir [Versions](#versions)).
- `games.refs` est un index _multiEntry_ : on retrouve une partie par son identifiant de plateforme sans connaître son hash.
- `usedAt` indexé partout : c'est l'ordre d'éviction.
- **Migrations** : tout changement de structure passe par un nouveau `db.version(n).upgrade(...)`. On ne supprime jamais la base depuis le code, sauf par `clearLocalData()`.

## Clé de position

La FEN de chessops sans ses deux compteurs, pour qu'une même position atteinte par deux chemins ait la même clé :

```
rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -
```

- **Gardés** : placement, trait, roques, case en passant.
- **Case en passant** seulement si une prise en passant est réellement possible (sinon `-`). La FEN d'un PGN ou d'une API la note parfois dès qu'un pion avance de deux cases, ce qui couperait le cache en deux pour rien. À vérifier sur ce que produit chessops et à normaliser nous-mêmes si besoin.
- **Retirés** : le numéro de coup (sans effet sur l'évaluation) et le compteur des 50 coups. Stockfish en tient compte près de la limite, mais ce cas est rare et l'écart minime : on l'accepte. Si un jour c'est gênant, garder le compteur dans la clé seulement quand il dépasse 80.
- Les **répétitions** ne sont pas dans la FEN : c'est déjà le cas aujourd'hui, puisque le moteur ne reçoit que la FEN (`engine.evaluate(position.fen)`). Le cache ne change rien.
- Les **positions finales** (mat, pat, matériel insuffisant) ne sont pas mises en cache : `finalCp` les évalue sans moteur.

## Règle de réutilisation

Une évaluation en cache remplace un calcul si :

```
cached.engine === ENGINE_ID && cached.nodes >= nodes demandés
```

- **Une seule entrée par position et par moteur** : celle qui a cherché le plus de nœuds. Écrire une évaluation moins profonde que celle en place ne fait rien (lecture puis écriture dans la même transaction, pour que deux onglets ne s'écrasent pas).
- **`precise`** (le drapeau de `AnalysedPosition`) se déduit des nœuds : `nodes >= DEEP_NODES`. Une position vue en profondeur dans une autre partie ou une autre analyse est donc déjà précise.
- **Les budgets sont en nœuds, pas en temps** (`analyze.ts`) : une évaluation vaut la même chose quel que soit l'appareil, c'est ce qui rend ce cache fiable.
- **Reproductibilité** : même à budget fixe, Stockfish dépend un peu de sa table de hachage, remplie par les recherches précédentes. Une évaluation en cache peut différer de quelques centipions d'un nouveau calcul. Sans conséquence ; on ne promet pas une analyse identique au centipion.

### Dans `analyzeGames`

1. `prepare` comme aujourd'hui (positions, `finalCp`, `serverCps`).
2. **Lecture** : pour les positions encore sans évaluation, un `bulkGet` des clés `[key, ENGINE_ID]` (toutes les parties d'un coup). Une évaluation à `QUICK_NODES` ou plus remplit `cps` et `byEngine` ; à `DEEP_NODES` ou plus, aussi `deep`.
3. **Passe rapide** sur ce qui manque encore, puis **passe profonde** sur les positions suspectes qui ne sont pas déjà dans `deep`. Une analyse entièrement en cache ne démarre aucun moteur (comme aujourd'hui quand tout vient de Lichess).
4. **Écriture** au fil du calcul, par lots (une seconde après la première évaluation du lot, dans une transaction ; `cacheWriter`), pour ne pas écrire à chaque position. Une analyse arrêtée garde ce qui est calculé.
5. `deepenGame` écrit aussi ses évaluations : approfondir une partie profite à toutes les suivantes.
6. Une fois l'analyse finie (pas si elle est arrêtée), on écrit l'entrée `games` de chaque partie (coups, références, version de l'analyse).

La progression compte à part les positions trouvées en cache (`cached`) : la passe rapide ne porte que sur ce qui reste, et son résumé dit « 295 positions · 129 déjà analysées ». L'estimation affichée avant de lancer (onglet Analyse) part du travail réellement restant (`analysisWorkLeft`, `workSeconds`) : positions absentes du cache, et passe profonde exacte des parties déjà évaluées. Tout en cache : « Déjà analysées : prêt tout de suite ».

## Versions

Deux numéros, avec des rôles différents :

- **`ENGINE_ID`** (dans `lib/engine/`), par exemple `sf19-lite` : change dès que le moteur ou son réseau de neurones change. Une évaluation d'un autre moteur n'est jamais réutilisée telle quelle.
- **`ANALYSIS_VERSION`** (dans `analyze.ts`), un entier : change quand la façon d'analyser change (budgets `QUICK_NODES` / `DEEP_NODES`, choix des positions de la passe profonde, nouvelle passe…). Gardé dans `games.analysis` avec le moteur et les budgets.

Les critères ne sont pas versionnés : les erreurs sont recalculées avec ceux du moment. Si des critères plus sensibles demandent de nouvelles positions profondes, la passe profonde les calcule simplement, le reste vient du cache.

**Mettre à jour les analyses passées** (bouton, plus tard) : une requête sur `games` dont `analysis.version` ou `analysis.engine` est dépassé, puis une nouvelle analyse de ces parties à partir de leurs coups, sans réseau. Les évaluations de l'ancien moteur peuvent servir de première passe pour repérer les coups suspects : on ne relance alors que les positions qui comptent, en profondeur, au lieu de tout.

## Identité des parties

- **Clé** : un hash de la position de départ et des coups (`initialFen ?? 'startpos'` + `sanMoves.join(' ')`). Le même hash que celui des imports si possible (`import/pgn.ts`), mais sur les coups seuls.
- **Références** : `refs` garde le lien avec chaque source, au format de `gameRef.ts` (`lichess:<id>`, `chesscom:<AAAA-MM>:<uuid>`) ou `import:<id>` pour un import. Une partie Lichess importée ensuite en PGN retrouve le même enregistrement, et ajoute sa référence.
- **Cas limite** : deux parties différentes aux coups identiques (abandon très tôt dans une ouverture courante) partagent une entrée. Sans conséquence, puisque les évaluations sont par position ; les informations propres à chaque partie (adversaire, date, cadence) ne sont pas dans le cache, elles restent attachées à la partie récupérée.

## Place et éviction

Ordre de grandeur, partie moyenne de 80 demi-coups :

- une entrée `positions` ≈ 150 à 300 octets avec le surcoût d'IndexedDB (dont environ 55 pour la FEN) ;
- une entrée `games` ≈ 1 Ko ;
- **≈ 15 à 20 Ko par partie**, 10 à 15 % de moins grâce aux ouvertures partagées.

Les quotas des navigateurs (de l'ordre de plusieurs Go, même sur téléphone) laissent de la marge : ~25 000 à 30 000 parties dans 500 Mo, plus de 100 000 sur ordinateur. Plus que ce que joue un gros joueur.

- **Plafonds par appareil** (`lib/storageLimits.ts`) : ordinateur 2 millions de positions et 50 000 parties analysées (≈ 500 Mo), téléphone 300 000 positions et 8 000 parties (≈ 75 Mo). Comptés en entrées plutôt qu'en octets : `navigator.storage.estimate()` est approximatif et inclut le cache du service worker.
- **Recyclage** : au-delà du plafond, ou sur une `QuotaExceededError`, on supprime par lots les entrées les plus anciennement utilisées (index `usedAt`), dans `positions` comme dans `games`, jusqu'à 90 % du plafond. Vérifié à chaque fin d'analyse et au plus une fois par minute pendant les écritures (approfondissement compris) : les nouvelles évaluations, de l'analyse de fond comme des analyses lancées par le joueur, prennent toujours la place des plus anciennes. Une écriture refusée ne fait jamais échouer l'analyse : on continue sans cache.
- **`usedAt`** est mis à jour à la lecture seulement s'il date de plus d'un jour, pour ne pas transformer chaque lecture en écriture.
- **Persistance** : `navigator.storage.persist()` est demandé à la première écriture. Chrome l'accorde seul à une PWA installée ou à un site souvent visité, Firefox demande, Safari décide selon l'usage. Sur iPhone, Safari efface les données d'un site non visité depuis 7 jours, sauf s'il est installé sur l'écran d'accueil : une raison de plus de mettre l'installation en avant.
- **Mises à jour de l'app** : IndexedDB est lié au domaine, pas à la version. Une mise à jour de la PWA remplace les fichiers du service worker, pas la base. Un autre domaine (staging) a sa propre base, vide.

## Vie privée et effacement

Obligatoire (CLAUDE.md) :

- déclarer la base `craftyourchess` sur la page `/legal` (ce qu'elle contient : les coups et les évaluations des parties analysées, rien d'autre) ;
- l'effacer dans `clearLocalData()` (`lib/localData.ts`), qui devient alors asynchrone ;
- réglages, section **« Mémoire »** : « Toutes les positions analysées sont gardées dans le navigateur. », le nombre de positions et de parties analysées (« 353 positions · 35 parties analysées » : des parties, pas des analyses, deux parties aux mêmes coups partageant une analyse ; relu toutes les 3 s tant que les réglages sont ouverts), et un bouton **« Vider »** confirmé par une fenêtre. Il supprime les positions, les parties analysées et les parties enregistrées, **sauf les parties synchronisées des favoris, leurs analyses et leurs positions** : l'analyse de fond les gère seule. Une partie synchronisée, c'est une des N dernières du favori (son option), toutes plateformes confondues : les analyses de ses parties plus anciennes (sorties de la fenêtre au fil des nouvelles parties, ou analysées à la main) sont vidées. Ses parties enregistrées restent toutes, anciennes comprises : le magasin sait quelles périodes il a en entier et ne doit pas y avoir de trous. Pour les retrouver, `clearMemory` (`features/background/memory.ts`) prend les N dernières parties de chaque favori dans le magasin, les analyses qui y renvoient (`refs`), et rejoue leurs coups pour lister les positions à garder ; une position partagée avec une autre partie reste.

## Tests

- Normalisation de la clé : compteurs retirés, case en passant gardée seulement si la prise est possible, transposition = même clé.
- Règle de réutilisation : autre moteur, budget insuffisant, budget suffisant ; une écriture moins profonde ne remplace pas.
- `analyzeGames` avec un cache plein (aucun moteur démarré), partiel (seulement le reste calculé), et une analyse arrêtée (ce qui est calculé est écrit).
- Identité : même partie par deux sources → une entrée, deux références.
- Éviction au-delà du plafond, et analyse qui continue sur une erreur de quota.
- Avec fake-indexeddb, déjà dans `test/setup.ts`.

## Plus tard

- Bouton « Mettre à jour les analyses passées » (voir [Versions](#versions)).
- Le **coach d'entraînement** lit le cache (meilleur coup, évaluation) avant de lancer une recherche. Ses propres recherches en MultiPV pourraient aussi être gardées, avec `multipv` dans l'entrée : à concevoir à part.
- **Export / import** du cache dans un fichier : sauvegarde, et passage d'un appareil à un autre.
- Si la place devient un problème : un hash de 64 bits comme clé à la place de la FEN en clair (gardée pour l'instant, utile pour relancer et pour déboguer).
- Une synchro entre appareils supposerait un backend : hors de cette première version.
