# APIs externes

## Lichess : https://lichess.org/api

- Données **publiques, sans authentification** : profil, stats, historique Elo, parties. Un joueur ne peut pas cacher ses parties.
- **Toute la carrière** est accessible.
- CORS autorisé : l'API est appelable directement depuis le navigateur.

| Endpoint                                  | Usage                                                                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/user/{username}`                | profil et classements par cadence                                                                                                                                         |
| `GET /api/user/{username}/perf/{perf}`    | stats détaillées d'une cadence                                                                                                                                            |
| `GET /api/user/{username}/rating-history` | historique Elo complet                                                                                                                                                    |
| `GET /api/games/user/{username}`          | export des parties en flux (`Accept: application/x-ndjson`). Paramètres : `since`, `until`, `max`, `perfType`, `color`, `moves`, `evals`, `opening`, `clocks`, `accuracy` |
| `GET /api/cloud-eval?fen=...&multiPv=3`   | évaluations en cache uniquement (404 si la position est inconnue)                                                                                                         |
| `/analysis/<FEN>?color=white\|black`      | plateau d'analyse sur une position quelconque (espaces du FEN remplacés par `_`), pour un lien sortant                                                                    |
| `explorer.lichess.ovh`                    | opening explorer                                                                                                                                                          |
| `tablebase.lichess.ovh`                   | tablebases jusqu'à 7 pièces                                                                                                                                               |
| https://database.lichess.org              | exports mensuels de toutes les parties, sous licence CC0                                                                                                                  |

**Analyse serveur** (avec `evals=true&accuracy=true`), présente **seulement si la partie a été analysée** sur Lichess (bouton « Analyse par ordinateur ») :

- `analysis[]` : une entrée par demi-coup, l'évaluation de la position **après** ce coup, côté Blancs : `{ eval: 76 }` (centipions) ou `{ mate: 3 }`. Sur les coups fautifs s'ajoutent `best` (UCI), `variation` et `judgment: { name: 'Inaccuracy' | 'Mistake' | 'Blunder', comment }`.
- `players.{white,black}.analysis` : `{ inaccuracy, mistake, blunder, acpl, accuracy }`. Avec `division=true` : `division: { middle, end }` (demi-coups).
- Aucun moyen de demander une analyse serveur par l'API.
- Le 2026-10-04, `GET /api/games/user/{username}` renvoyait 404 depuis `curl` et depuis un Chromium headless (alors que `/game/export/{id}` répondait), mais **fonctionne depuis un navigateur normal**, y compris dans l'app : un filtrage côté Lichess des clients automatisés, ou de l'IP de test.

- **Une partie par son id** : `GET /game/export/{id}` avec `Accept: application/json` renvoie **401 depuis un navigateur** (constaté le 2026-10-22, alors que sans cet en-tête il répond). On passe par `POST /api/games/export/_ids` (corps : les ids séparés par des virgules, jusqu'à 300 ; réponse NDJSON au même format que l'export d'un joueur, avec `evals`, `clocks`).

**Export paginé** (historique) : `max=30&moves=false&until=<ms>`, où `until` est une borne sur la date de **début** (`createdAt`) ; la page suivante part de `min(createdAt) − 1`. Sans `perfType`, l'export comprend toutes les variantes et les parties amicales. Chaque joueur a `rating` (avant la partie) et `ratingDiff` (parties classées).

**Débit** : environ 20 parties/s sans token. **Une seule requête à la fois.** En cas de 429, attendre 60 s avant de réessayer.

**Synchro** : un import complet au départ, puis `since = createdAt de la dernière partie + 1`.

**Comptes fermés ou bannis** : `disabled: true` ou `tosViolation: true`. Un compte fermé ne renvoie presque que `{id, username, disabled}` (exemple : `hikaru`).

## Chess.com : Published-Data API

- Lecture seule, sans authentification, données publiques.
- `GET https://api.chess.com/pub/player/{username}` (profil), `/stats` (état **actuel** seulement, pas d'historique), `/games/archives` (liste des mois), `/games/{YYYY}/{MM}` (ou `/pgn`).
- Toute la carrière est accessible, mois par mois. La courbe d'Elo doit être reconstruite à partir des parties.
- Données en cache : la plupart des endpoints se rafraîchissent **au plus une fois toutes les 12 h**, certains toutes les 24 h. Une partie récente peut donc manquer, ce que l'onglet Chess.com signale discrètement. **Faire les requêtes en série** (le parallèle provoque des 429).
- Synchro : ne récupérer à nouveau que le mois en cours.
- CORS : `access-control-allow-origin: *`. Le navigateur interdit de définir le `User-Agent` : on reste donc strictement en série.
- Les pseudos sont **redirigés en 301 vers leur version en minuscules** : le client met le pseudo en minuscules avant d'appeler l'API. La casse d'affichage se trouve dans l'URL du profil (`url`).
- Joueur inconnu : 404 avec `{"code":0,"message":"User ... not found."}`. Sans `User-Agent`, `curl` reçoit un 403, mais pas le navigateur.
- Le 2026-10-28, le mois en cours de certains comptes très actifs (`hikaru`, `magnuscarlsen`) figurait dans `/games/archives` mais répondait 404 `{"code":0,"message":"An internal error has occurred. ..."}`, depuis le navigateur aussi. L'app saute ce mois (`fetchArchiveGames` rend `null`).
- Le 2026-10-29, même réponse sur `/stats` d'un compte existant (`ganjaskhan`), profil et archives fonctionnant : seul un profil introuvable vaut « compte inexistant », des stats en 404 donnent un compte sans Elo (`fetchPlayer`).
- `/stats` : `chess_{bullet,blitz,rapid,daily}` et `chess960_daily`, chacun avec `last` (Elo actuel), `best` (meilleur Elo et partie associée) et `record` (V/N/D). S'y ajoutent `tactics`, `puzzle_rush` et `fide` (déclaratif). Il n'y a pas de cadence « classique ».
- `status` : `basic`, `premium`, `staff`, `closed` ou `closed:fair_play_violations`.
- Parties d'un mois : `pgn` (avec `[%clk]`), `time_control` (`"180+2"`, `"600"`, `"1/86400"` pour le daily), `time_class`, `rules` (`chess`, `chess960`…), `rated`, `end_time`, `white`/`black` (`username`, `rating`, `result`). **Aucune évaluation par coup** : seulement `accuracies: { white, black }` quand une Game Review existe (fréquent mais pas garanti).
- `white.rating` / `black.rating` dans une partie : l'Elo **après** la partie ; aucune variation n'est fournie (à calculer avec la partie précédente de la même cadence).
- `result` : `win` pour le gagnant ; nulles = `agreed`, `repetition`, `stalemate`, `insufficient`, `50move`, `timevsinsufficient` ; le reste est une défaite (`checkmated`, `resigned`, `timeout`, `abandoned`…).

## Moteur

Stockfish WASM dans des Web Workers : gratuit, sans limite, sans serveur. On utilise la version lite mono-thread, plusieurs instances en parallèle. La version multi-thread exige les en-têtes COOP/COEP (voir [decisions.md](decisions.md)).
