# Journal des décisions

Chaque décision structurante est notée ici, avec sa raison et les alternatives écartées. On la révise quand le contexte change : ajouter une entrée datée plutôt que réécrire l'historique.

---

## 2026-10-04 : choix fondateurs

### Architecture : local-first, 100 % navigateur, sans backend

L'API Lichess est publique, ne demande pas d'authentification et accepte les appels directs depuis le navigateur (CORS). Le navigateur importe donc tout l'historique une fois, en flux NDJSON, le stocke dans IndexedDB, puis fait une synchro incrémentale (`since`).

- **Pour** : gratuit, pas de serveur à maintenir, pas de données personnelles stockées côté serveur (donc pas de RGPD), tout est instantané une fois l'import fait.
- **Contre** : les données restent dans un seul navigateur (il faut réimporter sur chaque appareil), et le navigateur peut effacer IndexedDB (à limiter avec `navigator.storage.persist()`).
- **On réévaluera** si on ajoute des comptes, une synchro entre appareils, Chess.com à grande échelle ou des analyses lourdes. Piste : Hono + SQLite/Postgres.

### Framework : React (plutôt que Svelte)

Écosystème plus large, shadcn et TanStack pensés d'abord pour React, acquis réutilisable ailleurs. SvelteKit était plus léger mais avec un écosystème plus petit. chessground n'étant lié à aucun framework, ce point n'a pas pesé dans le choix.

### Stack

| Rôle              | Choix                                                  | Alternatives écartées                                                                         |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Build             | Vite                                                   | —                                                                                             |
| Routing           | TanStack Router (routes sous forme de fichiers)        | React Router : moins typé                                                                     |
| Données distantes | TanStack Query                                         | —                                                                                             |
| UI                | Tailwind v4 + shadcn/ui (Radix, preset Nova, Lucide)   | —                                                                                             |
| Échiquier         | `@lichess-org/chessground`                             | `chessground` (ancien nom, abandonné sur npm), react-chessboard                               |
| Règles / PGN      | chessops                                               | chess.js : moins bien intégré à chessground, PGN annoté moins complet                         |
| Stockage local    | Dexie                                                  | idb : plus bas niveau                                                                         |
| Graphiques        | ECharts                                                | Observable Plot : plus statique, alors qu'on veut zoom, infobulles et brush sur la courbe Elo |
| Stats lourdes     | **reporté** (DuckDB-WASM si besoin)                    | Pèse plusieurs Mo, alors que de simples calculs JS suffisent jusqu'à environ 50 000 parties   |
| Moteur            | Stockfish WASM lite mono-thread, plusieurs Web Workers | APIs tierces : fragiles et limitées                                                           |
| Tests             | Vitest + Testing Library + fake-indexeddb              | —                                                                                             |
| Qualité           | oxlint (fourni par le template Vite) + Prettier        | ESLint : plus lent, rien de plus pour nos besoins                                             |
| Paquets           | pnpm                                                   | —                                                                                             |

**Licence** : chessground et chessops sont sous GPL-3, le projet doit donc rester open source. Pour un produit commercial au code fermé, il faudrait passer à react-chessboard et chess.js.

### Bureau et mobile : PWA (plutôt qu'Electron)

Le but est de pouvoir épingler l'application sur le bureau du PC ou l'écran d'accueil du téléphone.

- **PWA** (vite-plugin-pwa) : installable depuis Chrome ou Edge sur Windows (fenêtre dédiée, icône dans la barre des tâches et le menu Démarrer), et depuis Android et iOS (écran d'accueil). Une seule base de code, aucun magasin d'applications, mises à jour automatiques. Elle fonctionne hors ligne une fois les parties importées, ce qui va très bien avec le local-first.
- **Electron, écarté** : plus de 100 Mo par installation, aucune version mobile, et aucun gain tant qu'on n'a pas besoin d'API système.
- **Plan B : Tauri v2**, si un jour on a besoin du natif (système de fichiers, Stockfish natif plus rapide que le WASM, distribution dans les magasins d'applications). Tauri enveloppe la même application Vite et cible le bureau et le mobile. La stack actuelle n'aurait rien à changer.

Limite connue : sur iOS, le stockage d'une PWA peut être effacé si l'application n'est pas utilisée pendant plusieurs semaines. Ce n'est pas grave, car les parties se réimportent depuis Lichess.

### Hébergement : Render (site statique)

Site en ligne : https://craftyourchess.com/ (le service Render reste joignable sur https://craftyourchess-2rcp.onrender.com/). La configuration est versionnée dans [`render.yaml`](../render.yaml) (un Blueprint Render) :

- branche `main`, avec `autoDeployTrigger: checksPass` : chaque push sur `main` redéploie le site, **mais seulement une fois la CI GitHub verte** ;
- build : `corepack pnpm install --frozen-lockfile && corepack pnpm build`. corepack utilise le pnpm épinglé dans `packageManager`, et Node 24 est fixé par `.node-version` ;
- dossier publié : `dist`, avec une réécriture `/* → /index.html` pour le routing côté client (les fichiers existants sont servis tels quels) ;
- en-têtes : cache permanent pour `/assets/*` (noms de fichiers hachés), `no-cache` pour `sw.js` et `index.html` afin que les PWA installées reçoivent les mises à jour, plus `nosniff` et `Referrer-Policy`.

Pour Stockfish multi-thread, il faudra ajouter dans `render.yaml` (et dans `server.headers` de Vite) les en-têtes `Cross-Origin-Opener-Policy: same-origin` et `Cross-Origin-Embedder-Policy: credentialless`.

Workflow git : on développe sur `develop`, et un merge sur `main` met le site en ligne.

### Design : thème sombre de Lichess

Voir [design.md](design.md).

---

## 2026-10-04 : profil croisé Lichess + Chess.com

- **Même pseudo sur les deux plateformes**, recherché en parallèle (Lichess et Chess.com sont deux hôtes différents, la règle « une requête à la fois » s'applique par API). Chaque source est indépendante : un compte absent (404), fermé ou en erreur d'un côté ne casse pas l'autre. Les fonctions de requête renvoient `null` pour « pas de compte », ce n'est pas une erreur.
- **Limite connue** : un même pseudo peut appartenir à deux personnes différentes. Exemple : `alireza2003` est le GM sur Lichess, mais sur Chess.com c'est un compte avec 1 partie jouée en 2012. **Piste** : permettre de saisir un pseudo différent par plateforme et associer manuellement les comptes.
- **Couche de normalisation** (`src/features/player/summary.ts`) : chaque source est convertie en un `AccountSummary` commun, testé unitairement. Les vues combinées ne lisent que ce format.
- **Ce qu'on additionne** : uniquement les données de même nature, c'est-à-dire les compteurs de parties, le bilan victoires/nulles/défaites et les dates (ancienneté, dernière activité). **Ce qu'on n'additionne jamais** : les Elo. Les deux systèmes de classement ne sont pas comparables, on affiche donc l'Elo courant des deux sites côte à côte, sans conversion.
- Les comptes fermés sont affichés (« Compte fermé ») mais exclus des totaux.
- **Navigation** : trois onglets, sous forme de routes imbriquées, donc chaque onglet a sa propre URL partageable (remplacé le même jour, voir ci-dessous).
- Couleurs d'identité : bleu pour Lichess, vert pour Chess.com (tokens `bg-lichess` et `bg-chesscom`).

---

## 2026-10-04 : un pseudo par plateforme

Remplace l'hypothèse du « même pseudo partout ».

- **URL** : `/player?lichess=<pseudo>&chesscom=<pseudo>`, avec les onglets `/player/lichess` et `/player/chesscom`. Chaque paramètre est facultatif, il en faut au moins un. Les liens des onglets conservent les paramètres (`search: true`).
- **Pourquoi des paramètres d'URL plutôt que des segments de chemin** : un compte peut manquer d'un côté, et l'ordre des comptes n'a pas de sens. L'URL reste partageable et se met en favori.
- **Formulaire** : un champ par plateforme, avec un raccourci « Même pseudo ». Sur l'accueil, un seul bouton, sur le champ Chess.com, recopie le pseudo Lichess (un second bouton sur le champ Lichess a été essayé puis retiré : il encombrait le formulaire). Dans l'en-tête, un seul bouton placé entre les champs recopie depuis le dernier champ modifié, et sa flèche (→ ou ←) indique le sens (`copySource` dans `search.ts`). La version complète est sur l'accueil ; une version compacte dans l'en-tête, pré-remplie avec les comptes affichés, permet de modifier le lien depuis le profil.
- Une plateforme sans pseudo est « non liée » : pas de requête (`skipToken`), pas d'onglet, une carte « Aucun compte lié » sur la vue d'ensemble, pas de colonne dans le tableau des Elo.
- Les paramètres d'URL sont validés dans `features/player/search.ts`. TanStack Router lit les valeurs comme du JSON, donc un pseudo numérique arrive sous forme de nombre : on le reconvertit en texte.
- L'ancienne route `/player/$username` est supprimée, sans redirection, puisque rien n'a encore été déployé.

---

## 2026-10-04 : internationalisation anglais / français

- **Paraglide JS 2** (inlang), plutôt que react-i18next ou Lingui. Les messages sont compilés en fonctions typées : une clé inexistante est une erreur TypeScript, et chaque page n'embarque que les messages qu'elle utilise. L'intégration se fait par un simple plugin Vite (Lingui demande un plugin Babel ou SWC).
- **Langue initiale = langue du navigateur.** Stratégie Paraglide : `localStorage` (le choix de l'utilisateur), puis `preferredLanguage` (langue du navigateur si elle est prise en charge), puis `baseLocale` (anglais). Un essai « anglais pour tout le monde » a été fait puis abandonné : la détection est plus naturelle.
- **Changer de langue recharge la page**, comme le recommande Paraglide : pas d'état de langue réactif dans React, et tout est cohérent après le rechargement (`<html lang>`, formats `Intl`). Contrepartie : les données Lichess et Chess.com sont redemandées, ce qui est acceptable pour une action rare.
- Les traductions sont dans `messages/{en,fr}.json`. `src/paraglide/` est généré et git-ignoré. `pnpm typecheck` lance `pnpm i18n` pour que `tsc` trouve les types en CI et sur Render.
- **Dépendance réseau au build** : Paraglide télécharge son plugin de format de messages depuis jsDelivr (`project.inlang/settings.json`) et le met en cache dans `project.inlang/cache` (git-ignoré). Un build sans réseau, et sans ce cache, échoue.
- Formats (`lib/format.ts`) : les objets `Intl` suivent la langue courante et sont mis en cache par langue. Les listes « a ou b » passent par `Intl.ListFormat`, les guillemets par un message (`“…”` en anglais, `« … »` en français).
- Le manifeste PWA et la balise meta description sont en anglais. `<html lang>` est mis à jour au démarrage.

---

## 2026-10-04 : recherches récentes

- L'accueil affiche les **3 dernières recherches**. Un clic rouvre le profil, et une croix retire une entrée. Jusqu'à 10 recherches sont conservées, pour pouvoir afficher plus tard une liste plus longue.
- **Stockage : `localStorage`** (`craftyourchess:recent-searches`), et non Dexie. C'est une petite préférence propre à chaque navigateur, lue sans délai, donc pas d'état de chargement ni de clignotement sur l'accueil. Dexie reste réservé aux données volumineuses (parties importées). Le code tolère un stockage absent ou corrompu, et les onglets restent synchronisés grâce à l'événement `storage`.
- **Enregistrement depuis la page profil, une fois au moins un compte trouvé.** On ne garde que les comptes trouvés, avec la casse officielle du pseudo : une faute de frappe n'est jamais enregistrée, et une paire avec un mauvais pseudo Chess.com est mémorisée sans lui. Les visites par lien ou favori comptent aussi.
- Les doublons sont détectés sans tenir compte de la casse, sur la paire (Lichess, Chess.com). Une recherche répétée remonte en tête de liste.

---

## 2026-10-04 : analyse des 10 dernières parties (Stockfish WASM)

Un bouton sur le profil ouvre une modale : récupération des 10 dernières parties classées (Lichess et Chess.com confondus), analyse, puis une table avec le nombre d'erreurs du joueur par partie. Code : `src/features/review/` et `src/lib/engine/`.

### Notion d'erreur

Définie dans `src/features/review/errors.ts` (`isError`, `ERROR_MIN_DROP`, testée). **Toute évolution de cette règle doit être reportée ici.**

**Révisée le 2026-10-04** : d'abord « perte ≥ 1 pion, sauf partie décidée (au-delà de ±4 du même côté) ». Cette clause créait une marche brutale à ±4 (à +4,1, un coup qui restait à +4 passait quelle que soit la perte). On raisonne désormais en **chances de gain**, comme Lichess.

Pour chaque coup du joueur, évaluations avant et après, de son point de vue, converties en chances de gain :

```
gain%(cp) = 50 + 50 × (2 / (1 + e^(−0,00368208 × cp)) − 1)     (modèle de Lichess)
perte = gain%(avant) − gain%(après)
erreur ⇔ perte ≥ 10 points
```

- **10 points** ≈ 1,1 pion depuis l'équilibre (0 → −1,2), mais bien plus en position décidée : de +6 à +4,5 (−6 points) ou de −5 à −8, ce n'est pas une erreur, car l'issue ne change guère. La tolérance grandit progressivement, sans marche.
- **Mats** : un mat vaut ±10 000 cp, soit 100 % ou 0 %. Rater un mat en restant écrasant (+9) n'est pas une erreur ; le rater en retombant à +3, si.
- **Positions finales** (mat, pat, matériel insuffisant) : évaluées exactement par chessops, sans moteur.
- Un seul niveau (« erreur ») : pas de distinction imprécision / erreur / gaffe. Pour mémoire, Lichess compte une imprécision à 5 points, une erreur à 10, une gaffe à 15 sur notre échelle (ses seuils 0,1 / 0,2 / 0,3 portent sur des chances de gain de −1 à +1, voir `Advice.scala`). **Corrigé le 2026-10-05** : ce paragraphe indiquait 10 / 20 / 30, par confusion d'échelle. Notre seuil de 10 correspond donc exactement à « erreur » chez Lichess. Les flags `judgment` de Lichess sont **ignorés** : seul notre seuil compte, pour que les deux plateformes soient comptées pareil.
- La passe profonde de l'analyse réexamine les coups qui perdent au moins **6 points** en passe rapide (marge de 4 sous le seuil, `deepCheckMinDrop` dans `criteria.ts`).
- **Depuis le 2026-10-05, ce seuil est réglable** dans l'analyse approfondie (voir plus bas). 10 reste la valeur par défaut, et le bouton « Analyser ma dernière partie » l'utilise toujours.

### Moteur

- **Stockfish 19 lite, mono-thread** (paquet npm `stockfish`, GPL-3, environ 1,8 Mo) : pas de `SharedArrayBuffer`, donc **pas d'en-têtes COOP/COEP** et rien ne casse côté hébergement. Le plugin `stockfishEngine` de `vite.config.ts` sert `node_modules/stockfish/bin/` sous `/engine/` en dev et le copie dans `dist/engine/` au build. Hors du précache PWA : téléchargé au premier usage puis mis en cache (CacheFirst).
- **Parallélisme : plusieurs moteurs mono-thread** (`hardwareConcurrency − 1`, entre 1 et 4), un par Web Worker, chacun sur des parties entières. Pour une analyse en lot, c'est plus rapide qu'un moteur multi-thread, et sans contrainte d'en-têtes. Le multi-thread reste une piste pour un futur plateau d'analyse en direct.
- **Deux passes, budget en nœuds** (pas en temps, pour un résultat identique sur tous les appareils) : 100 000 nœuds sur chaque position sans évaluation, puis 1 000 000 nœuds sur les positions autour des coups du joueur qui perdent au moins 6 points de chances de gain en première passe (marge sous le seuil d'erreur de 10).
- **Évaluations Lichess réutilisées** quand la partie a été analysée par Lichess : pas de moteur pour ces positions.
- `pnpm` 11 bloque le `postinstall` du paquet (il crée seulement des alias `stockfish.js`) : refusé dans `pnpm-workspace.yaml`.

### Périmètre et comportement

- **Deux boutons sur le profil** : « Analyser les 10 dernières parties » et « Analyser la dernière partie ». Même modale, même pipeline, paramétré par le nombre de parties (`count`, 10 ou 1) : la table n'a alors qu'une ligne, et l'entraînement ne porte que sur cette partie.

- Parties **classées, variante standard** (Chess960 et variantes exclus), toutes cadences, y compris les parties très courtes. Les parties Lichess annulées (`aborted`, `noStart`) sont exclues : elles n'ont pas été jouées.
- On prend les 10 plus récentes de chaque plateforme, puis les 10 plus récentes au total (date de fin de partie). Chess.com : archives mensuelles parcourues à rebours, en série, jusqu'à 10 parties.
- **Aucune persistance** pour l'instant (ni Dexie ni cache) : tout est recalculé à chaque ouverture, pour éprouver le système. **Fermer la modale annule tout** (requêtes et Workers).
- Si une plateforme échoue, la table s'affiche avec l'autre, et un message signale l'échec.
- **Étapes affichées dès le départ** (`ReviewSteps`) : récupération, analyse rapide, vérification approfondie, chacune avec une phrase d'explication. Les étapes terminées sont cochées avec un résumé (« 10 parties », « 908 positions »), l'étape en cours a sa barre, les suivantes sont grisées. Voir ce qui reste à faire rend l'attente plus supportable. Le démarrage du moteur, d'abord une étape à part, est fondu dans l'analyse rapide : il ne dure qu'un instant et n'apprend rien à l'utilisateur.
- **Chrono discret** en bas de la modale : temps écoulé depuis l'ouverture, figé à la fin pour garder la durée totale sous les résultats.
- **Progression par étape** : une barre par passe, égale à « positions évaluées / positions à évaluer » dans cette passe. Les deux totaux sont exacts (celui de la passe profonde est connu à la fin de la passe rapide), donc la barre ne recule jamais : elle repart de zéro à chaque étape. Une première version estimait la passe profonde à l'avance (5 % des positions) sur une barre unique, qui reculait brutalement quand le vrai total tombait.
- Temps restant **de l'étape en cours** = nœuds restants de la passe / débit mesuré depuis le début de l'analyse (nœuds par seconde), affiché après 3 s de mesure.

**Mesure** (PC 20 cœurs, donc 4 Workers, Chromium headless) : environ 1 minute pour 10 parties de blitz de Hikaru, soit à peu près 980 positions dont une centaine en passe profonde, sans aucune analyse Lichess réutilisable. Reste à mesurer sur mobile.

---

## 2026-10-04 : rejouer ses erreurs

Depuis la table des résultats, le bouton « Rejouer mes erreurs (N) » lance un entraînement (sur les 10 dernières parties, ou sur la dernière seule selon le bouton choisi sur le profil) : chaque erreur détectée (voir « Notion d'erreur ») réapparaît sur un échiquier jouable, **dans un ordre aléatoire**, toutes parties confondues. Code : `src/features/training/`.

### Notion de coup valide

Définie dans `src/features/review/errors.ts` (`isValidMove`, `VALID_MAX_DROP`, testée). **Toute évolution de cette règle doit être reportée ici.**

**Révisée le 2026-10-04** : d'abord « perte < 0,5 pion par rapport au meilleur coup, ou position qui reste ≥ +4 ». Même problème de marche que pour les erreurs : un coup passant de +6 à +4,5 était accepté. Passée en chances de gain, avec le même modèle que les erreurs.

Évaluations du point de vue du joueur : `meilleur` = après le meilleur coup du moteur, `après` = après le coup proposé.

```
valide ⇔ gain%(meilleur) − gain%(après) ≤ 5 points
```

- **Depuis le 2026-10-05, ce seuil est réglable** dans l'analyse approfondie, toujours strictement inférieur au seuil d'erreur. 5 reste la valeur par défaut.

- **5 points** ≈ un demi-pion depuis l'équilibre (0 → −0,5 accepté, 0 → −0,6 refusé), plus tolérant quand la partie est décidée : +4 → +3,3 accepté, +4 → +3 refusé, +10 → +7,5 accepté, mat → +10 accepté, mat → +5 refusé.
- Paire cohérente avec les erreurs : **valide jusqu'à 5 points inclus, erreur à partir de 10**, et une zone grise entre les deux (coup ni bon ni fautif).
- **Révisée le 2026-10-05** : la règle était stricte (`< 5`). Elle est passée à `≤ 5` à la demande de l'utilisateur, pour l'analyse rapide comme pour la valeur par défaut de l'analyse approfondie. L'écart ne joue qu'à la frontière exacte.
- **Le coup joué dans la partie est toujours refusé**, même si la nouvelle recherche le trouvait limite. Un coup qui termine la partie (mat, pat) est évalué exactement par chessops.
- **Évaluations comparables** : la référence est une recherche MultiPV 5 (1,5 M nœuds partagés). Un coup du top 5 est jugé sur sa ligne. Un coup hors du top 5 est évalué depuis la même position de départ, en restreignant la recherche à ce coup (`searchmoves`), avec le budget d'une ligne (300 k nœuds). Avant, il était évalué à part, depuis la position d'après et avec un autre budget : un décalage de profondeur pouvait fausser la comparaison.
- L'écart affiché sous chaque coup reste en pions (`+2,0 → +1,4 (−0,6)`), plus parlant ; sa couleur (vert / rouge) suit cette règle.

### Déroulé

- **Mode puzzle** : avant l'essai, on ne montre que la position (orientation du joueur, trait, dernier coup adverse surligné). Le coup joué en partie n'est révélé qu'après, avec l'adversaire, la date et un lien.
- Coup refusé : « {coup} n'est pas assez bon », avec **Réessayer** ou **Voir la solution**. Coup validé : « Bon coup ! », plus le meilleur coup s'il était différent. Flèches : meilleur coup en vert, coup de la partie en rouge, coup du joueur en bleu.
- **Essayer un autre coup** : une fois la position trouvée (ou la solution affichée), un bouton permet de jouer d'autres coups pour voir ce qu'ils donnent. Le résultat de la position est figé au premier verdict (`outcome` dans le reducer) : explorer ne change jamais le bilan, et « Position suivante » reste disponible pendant l'exploration, même après un essai raté.
- **Évaluations affichées côté blancs**, selon la convention des échecs (`+` avantage blanc, `-` avantage noir), quelle que soit la couleur du joueur ; une première version les affichait du point de vue du joueur, ce qui inversait tout quand il avait les noirs. Les calculs (erreur, coup valide) restent du point de vue du joueur, et la couleur de l'écart (vert / rouge) dit si c'est bon ou mauvais pour lui. Les évaluations apparaissent après chaque essai, sous forme de transition : `+4,1 → -5,2 (-9,4)`, soit l'évaluation de la position (celle du meilleur coup), l'évaluation après le coup, puis l'écart (vert si le coup serait valide, rouge sinon). Même présentation pour le coup essayé, le meilleur coup et le coup de la partie (ce dernier reprend l'évaluation de l'analyse). Les mats s'affichent `+#` (les blancs matent) / `-#` (les noirs matent), sans écart. **L'évaluation de la position reste affichée sous la consigne** dès le premier verdict (jamais avant : ce serait un indice).
- **Cache temporaire** des évaluations par coup essayé (dans le `Coach`, vidé à la sortie de l'entraînement) : rejouer le même mauvais coup ne relance pas Stockfish.
- **Ressenti** : le trait en grand, puis un bloc de retour teinté avec icône (« Pas tout à fait » en rouge, « Bien joué ! » en vert, « La solution » en bleu) qui apparaît en fondu. Le liseré de la même couleur autour de l'échiquier a été retiré (2026-10-06) : trop appuyé. Seules les informations utiles restent : pas d'adversaire ni de date, juste un lien « Voir la partie ».
- Indicateur « Erreur 3 / 29 · 27 restantes ». Bilan final : totaux seulement (trouvées du premier coup, après plusieurs essais, solution affichée), puis **Terminer** revient à la table. **Quitter** est possible à tout moment.
- **La riposte après un raté** : le moteur montre comment le coup est puni. C'est le deuxième coup de la variante principale de la ligne qui a évalué le coup (top 5 ou recherche `searchmoves`), sans recherche supplémentaire. Il est affiché en flèche rouge sur l'échiquier (position après le coup essayé) et en toutes lettres (« Le moteur répond Cxf4 »).
- **Une fois la position résolue**, même avec le meilleur coup, ou la solution affichée, l'échiquier revient à la position de départ avec des flèches : le coup de la partie en rouge, **toujours**, pour comparer ; le meilleur coup en vert ; le coup joué en bleu s'il diffère du meilleur (2026-10-07 ; auparavant, le meilleur coup trouvé restait joué sur l'échiquier, sans flèche).
- **Coups valides (top 5 du moteur)** : la recherche de référence d'une position est en MultiPV 5 (`REFERENCE_LINES`, budget `REFERENCE_NODES` = 1,5 M nœuds partagés entre les lignes). Les coups valides sont les lignes qui passent `isValidMove`, sauf le coup de la partie, plus tout coup valide trouvé par le joueur hors de ce top 5. Si les 5 lignes sont toutes valides, on affiche « 5+ coups valides ». Le compte apparaît quand la solution est connue (coup trouvé ou solution demandée) ; la liste s'ouvre au survol (souris) ou au toucher. Bonus : jouer l'un de ces 5 coups donne un verdict instantané, sans recherche. Écarté : évaluer tous les coups légaux (liste exacte, mais budget dilué et recherche bien plus longue).
- **Itération complète uniquement** : une recherche arrêtée en cours d'itération mélange deux profondeurs dans les lignes MultiPV (un même coup peut alors apparaître deux fois). `Stockfish.evaluate` ne garde que la dernière itération complète (`completeLines`), et le meilleur coup est pris dans cette même itération.
- **Lien « Analyser sur Lichess »** dès le premier verdict : l'outil d'analyse de Lichess sur la position du problème, quelle que soit la plateforme de la partie (voir apis.md).
- **Moteur** : un seul Stockfish pendant l'entraînement (`Coach`), recherches en file, une à la fois. La recherche de référence d'une position démarre dès son affichage, pendant que le joueur réfléchit : si le joueur joue le meilleur coup, la réponse est immédiate, sinon environ 1 s (PC) pour évaluer son coup.
- **Promotions** : toujours en dame (v1), chessground n'ayant pas de sélecteur de pièce.
- Toujours sans persistance : fermer la modale perd l'analyse et l'entraînement.
- **Une seule recherche à la fois par moteur, garanti à deux niveaux** : envoyer une position pendant une recherche fait planter le WASM (`RuntimeError: unreachable`). `Stockfish` refuse donc toute commande pendant une requête en cours, et le `Coach` abandonne les recherches mises en file avant un `terminate()` (compteur de génération). Le cas s'est produit en dev : le StrictMode de React monte, démonte et remonte l'entraînement, et une recherche orpheline démarrait sur le nouveau moteur en même temps que la suivante. Tester aussi en `pnpm dev`, pas seulement sur le build.
- `Board.tsx` annule la sélection en cours quand la position change : sinon chessground garde la pièce sélectionnée (et ses destinations) de la position précédente.

---

## 2026-10-04 : historique des parties

Un onglet **Parties** sur le profil (`/player/history`) liste les parties des comptes liés, de la plus récente à la plus ancienne, toutes plateformes et cadences confondues. Code : `src/features/history/`. (Au départ, il incluait aussi les parties amicales et les variantes : voir l'entrée suivante.)

- **Pas de stockage** (choix de l'utilisateur) : rien n'est enregistré, les parties sont récupérées à la demande. **Pages de 30**, avec boutons « plus récentes » / « plus anciennes ». Une page déjà vue ne refait pas de requête (cache TanStack Query, `useInfiniteQuery`). **Mettre à jour** repart de la première page (`resetQueries`).
- **Fusion par date** (`feed.ts`, testé avec de faux clients) : chaque plateforme a un curseur et un tampon de parties récupérées mais pas encore affichées. Lichess : export paginé par `until` (date de début), 30 parties par requête, sans les coups. Chess.com : archives mensuelles, de la plus récente à la plus ancienne. Une page prend les 30 parties les plus récentes des deux tampons, en les remplissant au besoin. Une plateforme en échec est signalée et la liste continue avec l'autre.
- **Colonne Elo** (au lieu du nombre d'erreurs) : l'Elo du joueur après la partie et la variation. Lichess donne la variation (`ratingDiff`) et l'Elo d'avant ; Chess.com donne l'Elo d'après mais pas la variation, calculée par différence avec la partie précédente de la même cadence et variante (`withChessComRatingDiffs`), sur tout ce qui est déjà chargé, tampon compris. La toute première partie connue d'une cadence n'a donc pas de variation.
- **Normalisation partagée** (`src/features/games/normalize.ts`) : le résumé d'une partie (`GameSummary` : plateforme, date, cadence, variante, couleur, Elo, adversaire, résultat) sert à la fois à l'analyse et à l'historique, et la table (`GamesTable`) est la même, avec une dernière colonne au choix (erreurs ou Elo).
- Limite connue : Lichess pagine sur la date de **début** et la liste est triée sur la date de **fin** ; une partie par correspondance très longue peut apparaître un peu plus loin que sa date de fin.

---

## 2026-10-04 : mises à jour de la PWA

Constat sur Android : l'app installée ne recevait pas les nouvelles versions. Le service worker ne cherchait une mise à jour qu'au chargement d'une page, or rouvrir l'app depuis l'écran d'accueil reprend souvent la page en mémoire sans la recharger ; et une version trouvée ne s'appliquait qu'au chargement suivant.

- **Enregistrement manuel** (`src/lib/registerServiceWorker.ts`, `registerType: 'prompt'`, `injectRegister: false`, dépendance `workbox-window`) : recherche de mise à jour au retour de l'app au premier plan (`visibilitychange`) et toutes les heures.
- **Au lancement** : une nouvelle version trouvée dans les 10 premières secondes est appliquée tout de suite (rechargement), puisque rien n'a encore été commencé.
- **Plus tard** : un bandeau « Une nouvelle version de CraftYourChess est disponible · Mettre à jour » (`UpdateBanner`), plutôt qu'un rechargement forcé qui ferait perdre une analyse ou un entraînement en cours (rien n'est stocké).
- **Cache du moteur limité aux fichiers de Stockfish** (2026-10-05) : la règle `url.pathname.includes('/engine/')` (CacheFirst) attrapait aussi, en dev, les modules sources servis par Vite (`/src/lib/engine/stockfish.ts`, `uci.ts`, `pool.ts`). Ils restaient figés dans le cache : un navigateur de dev exécutait un vieux `stockfish.ts` avec un `coach.ts` récent, d'où « Impossible de démarrer Stockfish » à chaque coup (en réalité `TypeError: lines.map` sur l'ancien `evaluate()`), seulement en dev. La règle ne vise plus que `/engine/` à la racine du site (`startsWith`, même origine). Le cache s'appelle désormais `stockfish`, et l'ancien (`engine`) est supprimé au démarrage. La fonction `urlPattern` doit rester autonome : Workbox recopie son texte dans `sw.js`.
- Une page jamais contrôlée par le service worker (première visite) ne reçoit pas l'événement de prise de contrôle : un rechargement simple suit au bout de 2 s si besoin.
- **Mise à jour déjà en cours d'installation** (2026-10-21) : un Ctrl+R ne suffisait pas, il fallait un Ctrl+Maj+R, et l'app installée sur téléphone demandait de nombreuses fermetures. Le navigateur commence à installer la nouvelle version dès le rechargement. Sous Firefox et Safari, `register()` rend la main pendant cette installation, que `workbox-window` ignore alors : ni rechargement ni bandeau, et la nouvelle version restait en attente jusqu'à la fermeture de tous les onglets. Chrome attend la fin de l'installation, d'où un problème invisible en local. `registerServiceWorker.ts` surveille donc aussi la registration directement (`waiting`, `installing`, `updatefound`) et recharge la page dès que le nouveau service worker prend le contrôle (`controllerchange`). Reproduit et vérifié avec deux builds dans un Chromium automatisé qui imite Firefox.

---

## 2026-10-04 : licence, mentions légales et confidentialité

En vue d'un partage public :

- **Fichier `LICENSE` (GPL-3.0)**, texte officiel de gnu.org. Comme le JavaScript et le WASM sont envoyés aux visiteurs, c'est une distribution au sens de la GPL : le code source doit leur être accessible. Le pied de page affiche donc « Code source (GPL-3.0) », un lien vers le dépôt public, et `main` correspond à la version déployée.
- **Pied de page** : « Projet indépendant, sans lien avec Lichess ou Chess.com ». On cite les marques sans utiliser leurs logos.
- **Page `/legal`** (en anglais et en français) :
  - **éditeur** : site personnel non professionnel, donc anonyme comme l'autorise la LCEN (art. 6), avec contact par les issues GitHub ;
  - **hébergeur** : Render Services, Inc. ;
  - **confidentialité** : aucun compte, cookie, mesure d'audience ni publicité ; liste de ce qui est stocké localement ; liste des services tiers appelés (lichess.org, api.chess.com, images.chesscomfiles.com) et journaux de l'hébergeur ;
  - **bouton « Supprimer mes données locales »** ;
  - **licence et crédits** : chessground et chessops, Stockfish, pièces cburnett, Noto Sans, API.
- Si on ajoute un jour de la publicité ou de la mesure d'audience : bannière de consentement et politique de confidentialité à revoir entièrement.

---

## 2026-10-05 : l'historique liste les mêmes parties que la revue

Constat : une partie amicale toute récente apparaissait dans l'historique, mais « Analyser ma dernière partie » prenait la partie classée d'avant, ce qui donnait l'impression d'un bug.

- **Choix de l'utilisateur** : la revue reste limitée aux **parties classées en échecs standard**, et l'historique s'aligne dessus. Plus de parties amicales, ni de variantes (Chess960, partie depuis une position…), ni de parties contre l'ordinateur (toujours amicales sur Lichess).
- **Une seule règle** : `isRatedStandardGame` (`src/features/games/normalize.ts`), utilisée par la revue (`fromLichessGame`) et par l'historique (`feed.ts`). Toute évolution du périmètre se fait là.
- L'export Lichess de l'historique demande directement `rated=true` et `perfType` (cadences standard), comme la revue, pour ne pas télécharger des parties écartées ensuite. Côté Chess.com, le filtre est appliqué mois par mois, et un mois sans partie retenue fait passer au précédent.
- Le libellé « Amicale » est supprimé, et le message vide devient « Aucune partie classée trouvée ».

---

## 2026-10-05 : analyse approfondie paramétrable

Le bouton « Analyser les 10 dernières parties » devient **« Analyse approfondie »**. Le bouton « Analyser ma dernière partie » ne change pas : dernière partie, seuils par défaut, lancement immédiat. Code : `src/features/review/` (`criteria.ts`, `selection.ts`, `fetch.ts`, `estimate.ts`, `settings.ts`, composants `ReviewSetup`, `ReviewRecap`, `ReviewDialog`).

### Déroulé en deux étapes

**Réglages → « Trouver les parties » → récapitulatif → « Lancer l'analyse »**. Le récapitulatif donne le nombre exact de parties, leur répartition (plateforme, cadence) et une estimation de durée **pour l'appareil utilisé**, calculée sur les vraies parties. Ensuite, l'analyse se déroule comme avant (étapes, progression, résultats, entraînement).

### Filtres

- **Plateformes** : les comptes trouvés, cochés par défaut.
- **Parties** : les N dernières (de 1 à « ≈ total des parties classées du profil », avec raccourcis 3 / 5 / 10 / 50 / 100), ou une **période** (dernière semaine, dernier mois, 3 derniers mois, dernière année, ou dates personnalisées). Une période choisie par raccourci est retenue comme raccourci : « dernière semaine » reste la dernière semaine à la prochaine ouverture.
- **Cadences**, **couleur**, **résultat**, **longueur minimale** (en coups ; 0 = toutes).
- Les API filtrent ce qu'elles savent filtrer : Lichess les cadences (l'UltraBullet compte comme bullet), la couleur et les dates de **début** ; Chess.com les mois. `matchesSelection` revérifie tout, et la période porte sur la date de **fin**. Côté Lichess, une marge de 60 jours avant le début de la période couvre les parties par correspondance.
- **« N dernières » avec des filtres que Lichess ne connaît pas** (résultat, longueur) : pagination à rebours par pages de 100 jusqu'à obtenir N parties retenues. Sans ces filtres, on demande exactement N parties à Lichess (le bouton rapide en demande 1).
- **Pas de plafond** (choix de l'utilisateur), mais un **avertissement à partir de 100 parties** : les analyses ne sont pas encore enregistrées.

### Seuils

- Un curseur « erreur » (3 à 30, défaut 10), avec les repères de Lichess : imprécision 5, erreur 10, gaffe 15.
- Un curseur « coup valide » (1 à 29, défaut 5). Il reste **strictement sous le seuil d'erreur** (`normalizeCriteria`) : déplacer l'un pousse l'autre. Sinon, un coup pourrait être à la fois une erreur et un coup valide.
- Un coup valide perd **au plus** le seuil (`perte ≤ seuil`, affiché « au plus X % »), comme dans l'analyse rapide.
- Le seuil de la passe approfondie suit le seuil d'erreur (`deepCheckMinDrop` = seuil − 4, au minimum 1). Un seuil bas allonge nettement l'analyse, et l'estimation en tient compte.
- L'entraînement utilise le seuil de coup valide de l'analyse (`Coach`, et un contexte React pour la couleur des écarts). Les seuils utilisés sont rappelés au-dessus des résultats.

### Estimation de durée

`estimate.ts` : positions sans évaluation Lichess × 100 000 nœuds, plus une part de positions en passe approfondie × 1 000 000 nœuds, divisé par le débit de l'appareil. Une seule partie n'occupe qu'un moteur.

- **Une seule estimation, celle de l'appareil** : « Temps estimé : ≈ 7 min ». Sur téléphone ou tablette, une ligne de plus : « Environ N fois plus rapide sur un ordinateur » (`desktopSpeedup`, comparé à un ordinateur type de 4 moteurs, sur les mêmes parties ; rien si le gain est sous 1,5×). Historique : d'abord les deux durées côte à côte, puis « sur cet ordinateur / ce téléphone » ; simplifié à la demande de l'utilisateur.
- **Type d'appareil** (`lib/device.ts`, `detectDevice`) : les Client Hints quand le navigateur en a (`navigator.userAgentData.mobile` : Chrome, Edge, Android), sinon le user agent. Un Mac tactile est un iPad (les iPad récents se présentent comme des Mac).
- **Moteurs** : le nombre réel de moteurs que l'analyse lancera sur l'appareil (`defaultPoolSize`, selon les cœurs), et non une hypothèse.
- **Vitesse d'un moteur** (`ENGINE_SPEED`) : ordinateur environ 825 000 nœuds/s, tirés de la mesure (environ 198 M de nœuds en 60 s avec 4 moteurs). Vérifié le 2026-10-05 : 21 parties de bullet estimées à environ 2 min, analysées en 128 s. Téléphone environ 250 000 nœuds/s, **hypothèse à mesurer** sur un vrai téléphone.
- Part de positions en passe approfondie : environ 10 % au seuil par défaut (mesuré), plus quand le seuil baisse (tableau approximatif dans `deepShare`).

### Résultats et entraînement

- Table **paginée par 20** (`TablePagination`).
- **Rejouer une seule partie** : un bouton bleu par ligne (le style des boutons principaux, pour le repérer), à côté du nombre d'erreurs, grisé sans erreur. Le bouton global reste.
- « Modifier les filtres » revient aux réglages.

### Protections pendant l'analyse

Rien n'étant enregistré, fermer la modale pendant une recherche ou une analyse **demande confirmation**. Pendant l'analyse, l'écran reste allumé (Screen Wake Lock, si le navigateur le permet) et quitter la page déclenche un avertissement (`useKeepAwake`). La vraie solution, mettre les évaluations en cache, reste une piste (`docs/vision.md`).

### Réglages mémorisés

Dans le `localStorage` (`craftyourchess:review-settings`), avec une lecture tolérante (chaque champ invalide reprend sa valeur par défaut) et versionnée. Déclarés sur la page `/legal`, et effacés par « Supprimer mes données locales ».

---

## 2026-10-05 : l'analyse quitte la modale pour une page à onglets

La modale enchaînait réglages, récapitulatif, progression, résultats et entraînement : le parcours devenait confus après les réglages. L'analyse a maintenant sa **page**, `/analysis?lichess=…&chesscom=…`, sur le squelette du profil. Remplace les parties « Déroulé » et « Protections pendant l'analyse » de l'entrée précédente, qui décrivaient la modale.

- **En-tête** : celui du joueur, inchangé et à la même place. Le nom ramène au profil. À droite : « Analyser ma dernière partie » et « Rejouer mes erreurs (N) », à la place de « Analyse approfondie ». Dessous, le titre « Analyse approfondie », puis les onglets.
- **Onglets** (routes `src/routes/analysis/`) :
  - **Filtres et options** (`/analysis`), toujours présent. « Trouver les parties » affiche le récapitulatif sous les réglages, avec « Lancer l'analyse ». Modifier un réglage fait disparaître le récapitulatif : il faut relancer la recherche, pour ne pas analyser autre chose que ce qui est affiché.
  - **Analyse** (`/analysis/run`), dès qu'une analyse existe : la progression, puis les résultats (pagination, rejeu par partie, chrono).
  - **Entraînement** (`/analysis/training`), dès qu'un entraînement est lancé. On passe des résultats à l'entraînement et inversement sans perdre la session : `TrainingView` est rendu par la mise en page, masqué hors de son onglet. « Quitter » ferme la session (l'onglet disparaît) et ramène aux résultats.
- **Bouton rapide** (profil ou page d'analyse) : même page, directement sur l'onglet Analyse, avec les filtres « dernière partie, seuils par défaut », visibles dans l'onglet Filtres mais **non mémorisés**. Depuis le profil, il passe par `?start=last`, retiré de l'adresse aussitôt l'analyse démarrée (un rechargement ne la relance pas). L'état « en cours » est posé dès le premier rendu : les effets des onglets passent avant celui de la mise en page, et l'onglet Analyse ne doit jamais croire qu'il n'y a rien.
- **L'analyse continue** quand on revient aux filtres. Recherche, analyse et entraînement sont **indépendants** (`AnalysisSessionProvider`, `session.tsx`, avec un `AbortController` chacun) : on peut chercher d'autres parties pendant qu'une analyse tourne.
- **« Revenir aux filtres de l'analyse en cours »** apparaît quand les réglages diffèrent de ceux de l'analyse en cours (`sameSettings`).
- **Confirmations** (modales `ConfirmDialog` / `useConfirm`) : remplacer l'analyse en cours (ce qui arrête aussi son entraînement), arrêter l'entraînement en cours pour en lancer un autre, quitter la page pendant une analyse ou un entraînement (`useBlocker` de TanStack Router ; changer d'onglet n'est jamais bloqué ; fermer ou recharger l'onglet déclenche l'avertissement natif).
- **Accès direct** à `/analysis/run` ou `/analysis/training` sans rien en mémoire (rechargement, lien partagé) : retour à l'onglet Filtres.
- Le chrono utilise les heures de début et de fin stockées dans la session : il ne repart pas de zéro quand on change d'onglet.

---

## 2026-10-05 : parties non classées, formulaire réorganisé, clics sur l'échiquier

### Parties classées et non classées

**Révise « l'historique liste les mêmes parties que la revue »** : à la demande de l'utilisateur, les parties **non classées** reviennent, dans l'historique comme dans l'analyse (bouton rapide compris). Seules les variantes restent exclues.

- Règle commune : `isStandardGame` (remplace `isRatedStandardGame`), c'est-à-dire échecs standard, classés ou non.
- Nouveau filtre de l'analyse : **Type de partie**, « Classées » et « Non classées », les deux actifs par défaut (`selection.ratings`). Lichess le filtre lui-même (`rated=true/false`, omis pour les deux) ; Chess.com est filtré ici.
- L'historique affiche de nouveau « Amicale » dans la colonne Elo pour les parties non classées. Les parties contre l'ordinateur (Lichess) ont pour adversaire « Stockfish niveau N » au lieu de « ? ».

### Formulaire

- Plateformes, cadences et type de partie : des **pastilles** activables, toutes actives par défaut (les plateformes étaient des cases à cocher).
- Ordre des rangées : plateformes / cadences / type de partie, puis couleur / résultat / longueur minimale, puis **Parties**, puis les seuils.
- **Parties** : « Dernières parties » et « Période » côte à côte, **toujours visibles**. L'option inactive garde ses dernières valeurs, atténuée, et s'active dès qu'on l'utilise. « Dernières parties » : un champ numérique et des raccourcis 3 / 5 / 10 / 50 / 100. Un curseur a été essayé puis retiré : sur des comptes de dizaines de milliers de parties, il ne permettait pas de régler finement. La période gagne le raccourci **Aujourd'hui** (depuis minuit, heure locale).
- **« Revenir aux filtres de l'analyse en cours »** est toujours affiché, désactivé tant que les réglages n'ont pas changé.
- Le bouton rapide n'apparaît plus sur la page d'analyse : l'en-tête n'y garde que « Rejouer mes erreurs (N) ». Le nom du joueur est un lien vers le profil partout, y compris sur le profil.

### Bug : les clics sur l'échiquier d'entraînement tombaient à côté

chessground garde en cache la position du plateau à l'écran, et ne la rafraîchit qu'au redimensionnement de la fenêtre ou au défilement. Sur la page d'analyse, l'échiquier était mesuré sous la table des résultats, puis remontait quand l'onglet changeait : les clics étaient calculés 242 px trop bas. Corrigé à deux niveaux :

- l'entraînement est rendu **avant** le contenu de l'onglet, pour que l'échiquier ne bouge plus ;
- `Board` **oublie la position en cache à chaque appui** (`state.dom.bounds.clear()`) et se redessine quand sa taille change (`ResizeObserver`, pour un échiquier créé dans un onglet masqué).

Le message « Couldn't start Stockfish » signalé n'a pas été reproduit après cette correction (coups joués et verdicts obtenus dans tous les enchaînements testés). Les échecs du moteur pendant l'entraînement sont désormais écrits dans la console, pour diagnostiquer s'il revient. Aussi : quitter l'entraînement ramène bien aux résultats (la redirection « pas d'entraînement » de l'onglet passait avant la navigation).

---

## 2026-10-05 : filtres en sections dépliables, recherche automatique

**Révise le formulaire de l'entrée précédente et le déroulé « Trouver les parties »** de l'analyse approfondie.

- **Trois sections dépliables** (`<details>` natif, sans dépendance), chacune résumée sur une ligne quand elle est fermée :
  - **Plage de recherche**, ouverte par défaut : « Dernières parties » ou « Période » ;
  - **Parties**, fermée : plateformes, type de partie, cadences, couleur, résultat, longueur minimale. Résumé : ce que les filtres excluent, sinon « Toutes les parties » ;
  - **Entraînement**, fermée : les seuils d'erreur et de coup valide.
- **Maximum de parties pour la période** (`scope.max`), derrière une case « Limiter à [50] parties », **décochée par défaut** : décochée, pas de limite (plutôt que de taper 9999) ; le dernier nombre reste affiché, atténué. Les plus récentes passent en premier, ce qu'indique une info-bulle. Lichess pagine alors à rebours comme pour « Dernières parties », Chess.com s'arrête au mois qui atteint le maximum.
- **Plus de bouton « Trouver les parties »** : la recherche est rapide, l'onglet Filtres la relance **400 ms après chaque modification** (la précédente est annulée). Elle attend que l'analyse en cours ait fini de récupérer ses parties : une seule requête Lichess à la fois.
- Seuls les **filtres de parties** périment la recherche (`sameSelection`) : les seuils ne changent que l'estimation de durée, et l'analyse prend les seuils affichés au lancement.
- Les réglages sont **mémorisés à chaque analyse lancée** depuis l'onglet Filtres (et non plus à chaque recherche, devenue automatique). Le bouton rapide ne les touche pas.
- Explications secondaires derrière une **icône d'info** (info-bulle `InfoTip`) : maximum de la période, longueur minimale, repères de Lichess (à côté du titre « Erreur »). Le bouton « Valeurs par défaut » des seuils est retiré.
- **« Revenir aux filtres de l'analyse en cours » disparaît** au profit d'un bouton par section, à droite de son en-tête : **« Revenir à l'analyse en cours »** (`sameScope`, `sameFilters`, `sameCriteria`). Il ne remet que sa section dans l'état de l'analyse en cours. Absent tant qu'aucune analyse n'existe, désactivé si la section n'a pas changé. Il est dans le `<summary>`, enveloppé d'un élément qui annule le clic : sinon, un clic sur le bouton désactivé ouvrirait ou fermerait la section.
- Section Entraînement : bouton **« Valeurs par défaut »** dans son en-tête (10 % / 5 %), à côté de « Revenir à l'analyse en cours ». Les repères de Lichess figurent aussi sous le curseur « Coup valide ».
- Rappel de « Dernières parties » : **toutes les parties** des comptes (`gameTotal`), quels que soient la cadence, le type ou la plateforme. Lichess donne le total exact (`count`) ; Chess.com ne publie que le bilan de ses parties classées, ses parties amicales n'y sont donc pas. Une info-bulle (`InfoTip`, composant partagé) le signale, ici comme sur la vue d'ensemble du profil (« Parties jouées », « Bilan global »). L'analyse, elle, lit les archives mensuelles de Chess.com, qui contiennent aussi les parties amicales.
- « Lancer l'analyse » passe en haut à droite de l'encadré « Parties trouvées ». Le titre « Analyse approfondie » et le rappel des seuils au-dessus des résultats sont retirés.
- **Estimation** : elle déduisait déjà les positions évaluées par Lichess ; la phrase « les parties déjà analysées par Lichess vont plus vite » laissait croire le contraire. Elle est remplacée par « Dont N parties déjà analysées par Lichess : leurs évaluations sont reprises ». Le calcul simule désormais la répartition des parties entre les moteurs (`makespan`, comme `EnginePool.run`), puis la passe approfondie après la rapide : 5 parties sur 4 moteurs prennent deux tours. Une mesure (10 parties Chess.com, PC 20 cœurs) : ≈ 50 s estimées, 58 s réelles ; la vitesse du moteur n'a pas été recalibrée.
- Le bouton « Quitter » de l'entraînement est retiré : les onglets suffisent pour en sortir, et le bilan de fin ramène toujours aux résultats.

---

## 2026-10-06 : analyse et mise en veille du téléphone

Un téléphone **gèle** la page (et ses Web Workers, donc Stockfish) dès que l'écran s'éteint ou que l'app passe en arrière-plan : l'analyse se met en pause et reprend au retour. Calculer en arrière-plan est impossible en web (une PWA n'a pas de calcul en tâche de fond, le service worker est coupé au bout de quelques secondes) ; seule une app native le permettrait.

- **Écran gardé allumé** pendant l'analyse (Screen Wake Lock, `useKeepAwake`, déjà en place) : la mise en veille automatique n'interrompt plus l'analyse. Elle ne peut rien contre une veille demandée (bouton d'alimentation) ni un changement d'appli, et le navigateur peut la refuser (économiseur de batterie). D'où une phrase pendant l'analyse : « Garde l'appli ouverte, écran allumé : l'analyse se met en pause en arrière-plan ou écran éteint ». Affichée sur écran tactile seulement (2026-10-23) : sur ordinateur, un onglet en arrière-plan continue de calculer.
- **Temps actif** (`src/lib/activeTime.ts`) pour le chrono et pour la vitesse qui sert au temps restant : le temps passé page masquée ne compte que si l'analyse a avancé pendant ce temps (au moins 2 positions évaluées). Sur téléphone, une pause n'allonge plus le chrono et ne fait plus exploser l'estimation ; sur PC, un onglet en arrière-plan continue de calculer et ce temps compte. Le seuil de 2 évite qu'un résultat déjà en route au moment du gel ne transforme toute la pause en travail.
- Piste suivante : enregistrer les évaluations au fil de l'eau (Dexie) pour reprendre une analyse si le système ferme la page au lieu de la geler.

---

## 2026-10-06 : échiquier d'entraînement agrandi, pensé aussi pour le mobile

- **Ordinateur** (à partir de 768 px de large) : l'échiquier prend la hauteur visible sous son bord supérieur, la page étant remontée en haut, avec 24 px de marge en bas. Il reste **aligné sur la colonne de l'en-tête** : largeur de la colonne moins le panneau de 20rem, qui garde sa taille. Il est **plafonné à 720 px**, car au-delà il devenait envahissant, et ne descend jamais sous 320 px (`useBoardSize`). Un premier essai sans plafond, débordant de la colonne, montait à 842 px en 1920 × 1080. Le panneau est **centré verticalement** par rapport à l'échiquier.
- **Retour à l'échiquier** : l'échiquier revient en entier à l'écran à l'arrivée sur l'onglet, quel que soit l'état de la position, y compris avec le compte rendu d'un coup affiché. C'est le cas avec le bouton « Rejouer », le rejeu d'une partie ou un clic sur l'onglet. Il revient aussi chaque fois qu'il attend de nouveau un coup : erreur suivante, « Réessayer », « Explorer ». Sur mobile, l'échiquier est placé en haut de l'écran, avec le compte rendu juste dessous ; sur ordinateur, la page remonte en haut. Les onglets et les navigations vers l'entraînement **gardent la position de défilement** (`resetScroll: false`) : changer d'onglet ne fait plus sauter la page en haut, et la restauration du défilement de TanStack Router ne défait plus ce placement. Sur mobile, le bloc fait au moins la hauteur de l'écran, pour que la page puisse toujours défiler jusque-là.
- **Coordonnées** (`src/index.css`) : celles de chessground ont une taille fixe et des décalages en pixels. Elles sont maintenant placées **à l'intérieur des cases**, comme sur Lichess : les chiffres en haut à droite de la colonne de droite, là où le thème brown attend ses couleurs alternées, et les lettres en bas à droite de la rangée du bas. Leur taille suit celle de l'échiquier (`container-type: inline-size`, `clamp(8px, 2.4cqw, 15px)`).
- **Mobile** : les phrases d'explication (« Trouvez mieux que le coup de votre partie », « Ce coup cède trop… », « C'est le coup du moteur ») sont masquées. Titres, coups et évaluations restent visibles.

---

## 2026-10-07 : entraînements en onglets, avec un écran d'options

**Révise « rejouer ses erreurs »** : toutes les erreurs mélangées au hasard, un seul entraînement à la fois.

- **« Nouvel entraînement »** remplace « Rejouer mes erreurs (N) » dans l'en-tête. Il ouvre un **onglet fermable**, `/analysis/training/$number`, qui présente d'abord les **options** puis, une fois l'entraînement lancé, l'échiquier, sans retour aux options.
- **Titres** : le premier onglet, tant qu'il est seul, s'appelle « Entraînement » ; dès qu'il y en a plusieurs, « Entraînement 1, 2, 3… ». Les numéros sont fixes et jamais réutilisés tant qu'un entraînement reste ouvert : fermer le 2 ne renomme pas le 3, et le suivant est le 4. Une fois tous les onglets fermés, la numérotation repart de 1.
- **Ordre de jeu** (`order.ts`, testé) :
  - Par défaut, les parties sont tirées au hasard et jouées une à une, chacune dans l'ordre de ses coups (nouveau champ `Mistake.ply`).
  - « Entremêler les parties » intercale les positions de plusieurs parties, chacune gardant son ordre. La fusion est aléatoire, au prorata des positions restantes, pour que chaque entrelacement soit également probable.
  - « Mélanger les positions de chaque partie » (seconde option affichée, après « Entremêler les parties ») ignore l'ordre des coups.
  - Les deux cochées reproduisent l'ancien mélange total.
- **Autres options** : « Limiter à [N] parties », décochée par défaut (les N premières parties de l'ordre de jeu, donc tirées au hasard), et « Perte minimale », du seuil d'erreur de l'analyse (toutes les erreurs, par défaut) jusqu'à 30 %, avec les repères de Lichess. Un récapitulatif suit les options en direct.
- **Options mémorisées** au lancement (`craftyourchess:training-settings`, déclarée sur `/legal`, effacée avec les autres données locales), avec un bouton « Valeurs par défaut ». La perte minimale n'est jamais ramenée sous le seuil de l'analyse en cours.
- **Rejeu d'une partie** depuis les résultats : un nouvel onglet numéroté, directement sur l'échiquier, avec les options par défaut.
- **Un seul échiquier dans la page** : seul l'entraînement affiché a son échiquier, reconstruit depuis l'état de l'entraînement quand on revient sur son onglet. Les pointes de flèche de chessground sont des marqueurs SVG aux identifiants globaux (`arrowhead-g`…) : avec plusieurs échiquiers, ils renvoyaient à ceux d'un échiquier masqué, et les flèches des entraînements suivants s'affichaient mal.
- **Un moteur à la fois** : seul l'entraînement affiché fait tourner Stockfish. Masqué, son moteur est arrêté, mais sa progression reste. Au retour, la recherche du meilleur coup ou la vérification d'un coup interrompue reprend : elles passent par des effets qui dépendent de l'onglet affiché, et non plus par le gestionnaire du coup.
- **Nouvelle analyse** : les entraînements lancés restent ouverts, avec leurs propres erreurs, et leur onglet est atténué, avec une horloge (« Erreurs d'une analyse précédente » au survol). Les onglets encore sur leurs options sont fermés, puisqu'ils dépendaient de l'analyse remplacée.
- **Fermer** un onglet ne demande confirmation que pour un entraînement en cours : ni sur ses options, ni une fois toutes ses positions jouées. Fermer l'onglet affiché mène à l'entraînement voisin, sinon aux résultats. Quitter la page n'est bloqué que si une analyse tourne ou si un entraînement lancé n'est pas fini.
- **Écran de fin** : « Recommencer » relance le même entraînement dans son onglet, avec les mêmes options et un nouveau tirage ; « Voir les résultats » mène à l'onglet Analyse.
- La barre d'onglets défile horizontalement quand elle déborde, par exemple avec plusieurs entraînements sur mobile.
- **Récapitulatif des filtres pendant une recherche** : l'encadré « Parties trouvées » reste en place, avec un indicateur de chargement à la place du nombre de parties, et « Lancer l'analyse » est désactivé jusqu'au résultat.
- **Entrée dans un champ** lance l'étape suivante. Dans les filtres, elle lance l'analyse : tout de suite si les parties sont connues, sinon dès qu'elles le sont (la recherche part sans attendre le délai), sauf si un filtre change entre-temps. Dans les options d'entraînement, elle lance l'entraînement.

---

## 2026-10-18 : thèmes des erreurs

Chaque erreur reçoit des **thèmes**, qui sont des étiquettes et non des catégories : un mat raté en finale de tours en a trois. Ils se calculent **sans passe de moteur supplémentaire**, à partir de la position avant l'erreur, des évaluations avant et après (du point de vue du joueur) et de la pendule (`features/review/themes.ts`, testé).

| Thème                                                    | Règle                                                                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ouverture                                                | Coup n° N ou avant, N réglable de 1 à 20 dans les options d'entraînement (12 par défaut, et toujours 12 dans les résultats)                                                          |
| Garder l'avantage                                        | Au moins 63 % de chances de gain avant le coup (environ +1,5)                                                                                                                        |
| Résilience                                               | Au plus 37 % (environ −1,5). Limite : une fois la partie très compromise, une gaffe de plus change peu les chances de gain, donc ces positions comptent rarement comme des erreurs.  |
| Finale                                                   | Au plus 6 pièces hors rois et pions, les deux camps réunis (règle de Lichess ; « plus de dame » excluait les finales de dames et comptait les milieux de jeu sans dames)             |
| Finales de pions, de tours, de pièces mineures, de dames | Seulement ce type de pièces en plus des rois et des pions (regroupées pour l'instant)                                                                                                |
| Trouver les mats                                         | Le joueur avait un mat forcé, de n'importe quelle longueur, et ne l'a plus après son coup. Les mats sont enregistrés comme ±10 000, sans leur longueur.                              |
| Éviter les mats                                          | Après le coup, l'adversaire a un mat forcé, ce qui n'était pas le cas avant                                                                                                          |
| Zeitnot                                                  | Moins de 10 % du temps de la partie à la pendule avant le coup. Le temps de la partie est le temps initial plus 40 incréments, l'estimation de Lichess. Rien pour la correspondance. |

- **Pendules** : l'export Lichess demande `clocks=true` (pendule du joueur après chaque coup, en centisecondes) ; pour Chess.com, elles sont lues dans les commentaires `[%clk …]` des PGN. Une partie dont un coup n'a pas de pendule n'en a pour aucun coup (`ReviewGame.clock`, puis `Mistake.clock`).
- **Options d'entraînement** : une pastille par thème, avec une info-bulle qui en explique la règle et les limites.
  - Les pastilles se combinent en **« ET »** : seules les erreurs qui ont tous les thèmes cochés sont gardées. Aucune cochée : toutes.
  - Le nombre d'une pastille non cochée est celui qui resterait en la cochant aussi. Une pastille cochée affiche le nombre gardé.
  - Une pastille qui ne laisserait rien est désactivée.
  - Les thèmes cochés et le coup limite de l'ouverture sont mémorisés avec les autres options.
  - **Options des thèmes** : une section entre « Thèmes » et « Ordre », qui n'apparaît que si un thème coché a des réglages. Pour l'instant, seul « Ouverture » en a un : le coup limite.
- **Résultats de l'analyse** : « Erreurs par thème » en **barres horizontales**, un seul niveau de couleur, triées par nombre, avec le nombre et la part des erreurs. Un camembert a été écarté : les thèmes se chevauchent, et ses parts dépasseraient 100 %.
- Écartés pour l'instant : les motifs tactiques (fourchette, clouage…), qui demandent d'analyser les variantes ; « rater une prise », « rater un échec », « reprendre », qui demandent de garder le meilleur coup.

---

## 2026-10-18 : menu des paramètres, apparence des échiquiers

- Une **roue dentée** en haut à droite remplace les boutons EN / FR. Elle ouvre un menu avec trois rubriques :
  - **Langue** (English / Français ; la page se recharge, c'est le modèle de Paraglide) ;
  - **Style** en un clic : « Lichess » (échiquier marron, pièces cburnett, le défaut) ou « Chess.com » (échiquier vert, pièces Merida, les plus ressemblantes) ;
  - le détail **Échiquier** (marron, bleu, vert, violet, gris) et **Pièces** (cburnett, Merida, Chessnut, MPChess ; RhosGFX, essayé, a été retiré).
- Le sélecteur ajouté un temps sous le panneau d'entraînement est retiré.
- **Pièces** : jeux libres de la collection de Lichess, téléchargés dans `public/piece/<jeu>/`. Les jeux sous CC BY-NC-SA (Staunty, Maestro, Cardinal…), incompatibles avec la GPL, sont écartés. Les licences sont dans `public/piece/LICENSES.md`, et les crédits sur `/legal`. Les pièces de Chess.com (« Neo ») sont propriétaires, et dessiner un jeu qui leur ressemble aurait été risqué : le style Chess.com utilise Merida (GPL), un dessin classique indépendant, jugé le plus ressemblant.
- **Couleurs** : les cases sont dessinées en CSS (`repeating-conic-gradient`, une tuile de 2 × 2 cases) à partir de deux variables par couleur (`components/board/boardStyles.css`). Le dernier coup est surligné en jaune et les coordonnées sont assorties. Le marron et cburnett restent ceux de chessground. Le vert reprend l'esprit des échiquiers de tournoi en vinyle, avec des valeurs volontairement différentes de celles de Chess.com.
- Le choix est mémorisé (`craftyourchess:board-style`, déclarée sur `/legal`, effacée avec les autres données locales) et partagé par tous les échiquiers de la page (`components/board/boardStyle.ts`).

---

## 2026-10-18 : page de contact et retours

- **`/contact`** : à propos du projet et de son auteur (Ganjaskhan), appel à tous les retours, remerciement mis en avant (cœur), formulaire dans une colonne de droite sur grand écran (en dessous sur mobile), et adresse e-mail en solution de repli.
- **Accès partout** :
  - « Un avis ? » dans l'en-tête, à côté de la roue des paramètres (icône seule sur mobile) ;
  - « Contact et retours » dans le pied de page ;
  - une ligne discrète à la fin d'un entraînement et sous les résultats d'analyse, là où l'on a un avis ;
  - le contact de la page `/legal`, qui renvoyait aux issues GitHub.
- **Formulaire sans serveur** : **Web3Forms** reçoit le message et le fait suivre par e-mail. Il a été préféré à Formspree pour son palier gratuit plus large et sa clé publique par conception (elle ne permet d'écrire qu'à l'adresse du compte). Ont été écartés : le mailto seul (beaucoup abandonnent faute de logiciel de mail, et l'adresse est exposée au spam), les formulaires Google ou Tally intégrés (traceurs et marque d'un tiers), et les issues GitHub (compte requis).
  - Champs : type de retour en pastilles (idée ou fonctionnalité, ressenti, bug, autre chose ; la liste d'exemples de la page suit le même ordre), message, e-mail facultatif, et une case pour joindre des infos techniques (page, navigateur, langue, taille d'écran), **cochée automatiquement pour un bug** et décochée pour les autres types (l'utilisateur peut toujours la changer). Un champ piège invisible arrête les robots.
  - Un échec garde le message et propose l'adresse e-mail.
  - Service tiers **déclaré sur `/legal`** ; rien n'est envoyé sans action de l'utilisateur.
- **Clé Web3Forms** (`VITE_WEB3FORMS_KEY`, voir `.env.example`) : dans l'environnement du service Render et dans le `.env` local. Sans clé :
  - le développement fait semblant d'envoyer (journalisé dans la console) ;
  - un build de production refuse et renvoie vers l'adresse e-mail ;
  - l'adresse de contact est **craftyourchess@gmail.com** (`CONTACT_EMAIL` dans `lib/project.ts`), celle du compte Web3Forms.

## 2026-10-20 : ChessMe devient CraftYourChess

- Nom affiché partout : en-tête, titre, manifeste PWA, textes, page `/legal`, sujet des e-mails Web3Forms. Identifiants en minuscules : `craftyourchess` (paquet, préfixe des clés `localStorage`).
- **Clés `localStorage` renommées** (`chessme:*` → `craftyourchess:*`) : `migrateLegacyKeys()` (`lib/localData.ts`), appelée au démarrage, recopie une fois les anciennes valeurs pour ne perdre aucun réglage. À retirer quand plus personne n'a l'ancienne version. `PARAGLIDE_LOCALE` n'avait pas de préfixe et ne change pas.
- Hors du code : dépôt GitHub, service Render (et son URL), compte Web3Forms, adresse de contact : renommés ou remplacés à la main (voir ci-dessous).
- **Nouvelle adresse** : un nouveau service Render `craftyourchess` (https://craftyourchess-2rcp.onrender.com/) remplace `chessme-k8py.onrender.com`, qui redirige vers lui le temps de la transition. Le stockage local étant propre à chaque origine, les visiteurs repartent d'un site vierge et réinstallent la PWA : acceptable pour un prototype. Écarté : garder l'ancienne URL, qui porte l'ancien nom.
- **Adresse de contact** : craftyourchess@gmail.com, désormais celle du compte Web3Forms.

## 2026-10-20 : domaine craftyourchess.com

- **Domaine à soi** : https://craftyourchess.com/. L'adresse ne dépend plus de l'hébergeur, et c'est la dernière fois que l'origine change (le stockage local et la PWA installée y sont liés).
- **Cloudflare Registrar** : prix coûtant sans hausse au renouvellement, WHOIS masqué gratuitement, DNS rapide et redirection e-mail gratuite (pour un futur `contact@craftyourchess.com`). Écartés : Porkbun (bon aussi, l'alternative si l'on quitte Cloudflare), OVHcloud (interface lourde), Namecheap (renouvellement plus cher), GoDaddy et Gandi (chers).
- **DNS** : deux `CNAME` (`@` et `www`) vers `craftyourchess-2rcp.onrender.com`, en **DNS only** (sans le proxy de Cloudflare) : Render émet et renouvelle lui-même le certificat. `www` redirige vers la racine.
- Le domaine est déclaré dans `render.yaml` (`domains`). La CI et le déploiement ne changent pas : un push sur `main` redéploie une fois la CI verte.
- L'adresse `onrender.com` reste active le temps de la transition : la désactiver (`renderSubdomainPolicy`) renverrait une 404 au lieu de rediriger.

## 2026-10-22 : thème « L'Établi »

Le thème copié de Lichess était propre mais un peu froid, et l'app ressemblait à une page de Lichess. Plusieurs identités ont été explorées avec Claude Design ; deux ont été appliquées pour comparer, chacune sur sa branche : « L'Atelier » (`theme/atelier`) et « L'Établi » (`theme/etabli`, celle-ci). Spécification et captures : `design/theme-etabli/`, résumé dans `docs/design.md`.

- **Tokens** dans `src/theme/etabli.css` (`--cyc-*`), branchés sur ceux de shadcn. Les anciens noms (`good`, `bad`, `brag`, `zebra`, `font-clear`, `font-dim`) sont devenus ceux du thème (`win`, `loss`, `title`, `field`, `text-strong`, `muted-foreground`).
- **Polices** : Noto Sans et Noto Sans Mono (variables, SIL OFL), fichiers woff2 dans `src/theme/fonts/`, servis par Vite sous un nom haché. Le paquet `@fontsource-variable/noto-sans` n'est plus utile. Crédits sur `/legal`.
- **Retouches après essai** (même jour) : les carrés `Li` / `Cc` de la spécification sont remplacés par les pastilles colorées d'avant ; plus de filet or au-dessus de l'en-tête ; logo (40 px) et nom un peu plus grands ; champs et boutons de 36 px, lignes de tableau de 38 px ; libellés en capitales de 12 px, comme avant, au lieu du mono en bas de casse ; boutons fantômes et raccourcis d'analyse en gris neutre au lieu de l'or ; lien « Code source » du pied de page en gris, comme les autres ; texte de la page contact en 16 px, formulaire en 15 px.
- **Un seul bouton principal par écran** : « Analyse approfondie » passe en bouton secondaire à côté de « Analyser la dernière partie ».
- **L'échiquier ne change pas** (choix de l'utilisateur) : couleurs, pièces, flèches et réglages restent ceux d'avant, malgré le plateau sable et bronze et les pièces mpchess proposés par le thème.
- **Le nom dans l'en-tête suit le choix de l'utilisateur**, pas la spécification : Noto Sans, « Craft » et « Chess » en gras `#dddddd`, « Your » en maigre, dans le vert `win` de la spécification (d'abord en `#bf811d`).
- **Nouveau logo** : un artisan qui taille un pion doré, fourni par l'utilisateur en image (`public/logo.png`, coins arrondis transparents), remplace le fou à la longue-vue, de l'en-tête jusqu'à l'icône d'onglet. Voir `docs/design.md`.
- Pas repris de la maquette, faute de fonctionnalité correspondante : barre de navigation en bas sur téléphone, courbe d'évolution sur 12 mois, bouton « Plus tard » du bandeau de version, raccourcis clavier (`.kbd`).

## 2026-10-22 : référencement

Le site n'apparaissait pas dans les moteurs de recherche, et un lien partagé s'affichait sans aperçu.

- **`robots.txt`** (tout est autorisé) et **`sitemap.xml`** (accueil, contact, mentions légales). Avant, `/sitemap.xml` renvoyait l'app avec un code 200, à cause de la règle de réécriture de Render.
- **Titre et description** qui parlent du produit dans `index.html`, plus une description structurée (JSON-LD `WebApplication`).
- **Aperçus de lien** (Open Graph, carte Twitter) : titre, description et logo. Les réseaux sociaux et messageries n'exécutent pas le JavaScript, d'où ces balises en dur dans `index.html`.
- **Un titre par page** et un **lien canonique** qui suit l'adresse (`usePageMeta`). Les pages de joueur et d'analyse et la page 404 portent `noindex` : une infinité d'adresses, une par pseudo, sans intérêt pour la recherche. On utilise `noindex` plutôt qu'une interdiction dans `robots.txt`, qui empêcherait les robots de voir cette balise.
- `theme-color` et couleurs du manifeste alignées sur le fond du thème (`#121110`).
- Pas fait, à rediscuter : pré-générer le HTML des pages publiques au build, des adresses en `/fr/` pour indexer le français. Google Search Console (vérification du domaine par un enregistrement DNS) reste à configurer par l'utilisateur.

## 2026-10-22 : Elo de l'adversaire au lieu de la longueur minimale

Le filtre « longueur minimale » de l'analyse approfondie servait peu. Il est remplacé par une **fourchette d'Elo de l'adversaire** (`opponentRating` dans `selection.ts`).

- **Désactivée par défaut** (tous les adversaires) ; une case à cocher l'active, avec un minimum et un maximum (0 à 4 000 par défaut, par pas de 50). Comme pour le maximum d'une période, les bornes restent affichées, grisées, quand le filtre est coupé, et en taper une l'active.
- **Seulement avec les parties classées** : le filtre n'est proposé, et appliqué, que si « Classées » est coché, et il ne trie que les parties classées. Les parties non classées cochées sont toujours conservées : pour les écarter, il suffit de décocher « Non classées ».
- Une partie classée contre un adversaire **sans Elo connu** est écartée quand le filtre est actif.
- Bornes invalides (minimum au-dessus du maximum, hors de 0 à 4 000, champ vide) : message dédié, pas de recherche.
- Comme le résultat, ce filtre n'est vérifié que par l'app : avec Lichess, on remonte les parties page par page jusqu'à en avoir assez.
- Réglages enregistrés : l'ancien `minMoves` est simplement ignoré, sans changer de version.

## 2026-10-22 : parcours plus courts vers l'entraînement

Constat (en comparant avec Chess Rewind) : un nouveau visiteur ne voyait pas vite la valeur de l'outil, et l'usage régulier tient sans doute plus à de courtes analyses (1 à 5 parties) qu'à de grands regroupements. On ajoute donc des raccourcis jusqu'à l'entraînement.

- **Accueil** : la promesse (« Your games are your best puzzles. ») et trois étapes (trouver son compte, analyser, rejouer ses erreurs) au-dessus du formulaire. Deux boutons : « Find profile » (principal) et « Analyze last game », qui saute la page profil. Les recherches récentes ont le même raccourci. Le champ ne prend le focus que sur ordinateur (pointeur fin) : sur téléphone, le clavier recouvrait la page.
- **Analyser une partie précise** depuis l'onglet Parties : `/analysis/run?game=…`, comme `start=last`. La référence (`gameRef.ts`) est `lichess:<id>` (un appel à `/game/export/{id}`) ou `chesscom:<AAAA-MM>:<uuid>` : Chess.com ne sert les parties que par archive mensuelle, celle du mois de fin de partie en UTC.
- **Après une analyse**, un encadré propose l'entraînement rapide (options par défaut, lancé tout de suite) ou l'onglet d'options.
- Raccourcis du nombre de parties : 3 / 5 / 10 / 50 / 100.
- Une recherche est aussi enregistrée dans les recherches récentes depuis la page d'analyse, puisqu'on peut maintenant y arriver sans passer par le profil.
- L'onglet Parties perd la colonne Elo (trop d'informations) et, avec elle, le calcul des variations d'Elo Chess.com. Sur téléphone, les tableaux de parties masquent l'adversaire puis la date, et réduisent la plateforme à sa pastille.
- Mis de côté : un joueur de démo, et la répétition espacée des erreurs (qui suppose de les enregistrer).

## 2026-10-22 : sections en accordéon, limite de positions

- Les sections des filtres d'analyse et des options d'entraînement partagent un composant (`components/Expandable.tsx`) : un accordéon Radix, une seule section ouverte à la fois, avec un court glissement pour que le changement se voie. Le repliement natif (`<details>`) ne s'anime pas de façon fiable dans tous les navigateurs. En-têtes sur fond `field`, résumé des choix toujours visible, bouton « Reset to default » dans chaque section.
- Options d'entraînement : une section « Themes », une section « Advanced » (ordre, limites, perte minimale).
- Nouvelle option **limiter à N positions** (par défaut décochée, 10) : les N premières dans l'ordre de jeu, après la limite de parties. Enregistrée avec les autres options d'entraînement, même clé de stockage.

## 2026-10-22 : l'analyse devient des onglets du profil

La page `/analysis` doublait le profil (même en-tête, mêmes comptes) et obligeait à aller et venir entre deux pages. Elle disparaît : ses onglets rejoignent ceux du profil.

- Onglets du profil : **Aperçu**, **Parties**, **Analyse** (les filtres et options), **Résultats** (dès qu'une analyse existe), puis un onglet fermable par entraînement. Adresses : `/player`, `/player/history`, `/player/analysis`, `/player/results`, `/player/training/N`.
- Les onglets **Lichess** et **Chess.com** sont supprimés : l'aperçu garde l'essentiel (Elo actuels, bilans, parties par cadence) et les liens vers les deux sites.
- La session d'analyse (`AnalysisSessionProvider`) est portée par la mise en page du profil : on peut consulter l'aperçu ou les parties pendant qu'une analyse tourne. Quitter le profil, ou passer à d'autres comptes, pendant une analyse ou un entraînement en cours demande confirmation.
- Une revue rapide se demande par lien (`?start=last` ou `?game=…`), à l'arrivée comme depuis la page : la session la lance (en demandant avant de remplacer une analyse existante) puis retire la demande de l'adresse.
- En-tête du profil : « Analyze last game » et « Advanced analysis » (qui ouvre l'onglet Analyse). Le bouton « New training » de l'ancienne page est retiré : l'encadré sous les résultats et les boutons « Train » suffisent.
- Les anciennes adresses `/analysis…` redirigent vers les onglets.

## 2026-10-23 : exercice « Évaluer la position »

Un second exercice d'entraînement, en option : dire comment se présente la position de l'erreur avant (ou au lieu de) rejouer son coup. Sans rien changer pour qui garde les options par défaut.

- Options d'entraînement, section **Exercices** (entre Thèmes et Avancé) : « Évaluer la position » et « Rejouer son coup », l'un, l'autre ou les deux, jamais aucun (désactiver le dernier réactive l'autre). Par défaut, seulement « Rejouer son coup ». Enregistré avec les autres options (`exercises`).
- Cinq réponses, du côté des Blancs comme d'habitude aux échecs : égalité de −0,3 à +0,3, avantage jusqu'à ±2,0, gain à partir de ±2,0 ; un mat est un gain. Les boutons de la couleur du joueur sont dans la colonne de gauche. L'échiquier ne se joue pas pendant l'évaluation.
- **La bonne réponse vient du moteur de l'entraînement** (la même évaluation que celle affichée ensuite pour trouver un coup), pas de l'analyse : les deux peuvent différer de quelques dixièmes, et l'app se contredirait. Si le moteur n'a pas fini, le verdict attend.
- **Marge près des frontières** : les moteurs varient de quelques dixièmes d'une recherche à l'autre. À ±0,15 de ±0,3 et à ±0,3 de ±2,0, les deux réponses autour de la frontière comptent. Une marge de 0,3 partout aurait vidé « Égalité » (à 0,00, trois réponses auraient été justes). Le verdict montre l'évaluation du moteur à deux décimales (`assessment.ts`).
- Avec les deux exercices : « Partie 1 : évaluation » puis « Partie 2 : trouver un coup valide », un seul bouton entre les deux. En partie 2, l'évaluation de la position est affichée d'emblée, puisque le joueur vient de la voir.
- Le bilan ajoute « Positions bien évaluées : X / Y » ; avec l'évaluation seule, seulement cette ligne.

## 2026-10-23 : graphique d'évaluation et analyse approfondie d'une partie

Les résultats d'analyse doivent faire comprendre ce qui s'est passé dans une partie.

- **Lignes dépliables** dans la table des résultats : une seule ouverte à la fois, avec un glissement ; elle ouvre un panneau pleine largeur (`GamesTable`, option `expandable`). Sur téléphone, ce panneau reprend aussi les colonnes masquées (date, plateforme, adversaire). Les rayures de la table passent alors en classes posées ligne à ligne, les lignes de panneau n'étant pas des entrées.
- **Graphique d'évaluation** (`EvalChart`, SVG fait main plutôt qu'ECharts : léger, aux couleurs des tokens) dans le style de Lichess : avantage des Blancs en clair vers le haut, des Noirs en sombre vers le bas, courbe or, sur une échelle de chances de gain (un +8 n'écrase pas le reste). Erreurs du joueur en points rouges pleins, de l'adversaire en anneaux gris ; légende sous le graphique.
- **Survol tolérant** : le coup le plus proche horizontalement répond, où que soit le pointeur. L'info-bulle donne le coup, l'évaluation, l'écart pour celui qui a joué, et l'échiquier après le coup ; un clic la fige, avec un lien vers l'analyse Lichess. Sur téléphone, un toucher fige le coup le plus proche (le doigt peut glisser) et le détail s'affiche au-dessus du graphique (le doigt cache ce qui est dessous ; changé le 2026-10-23).
- **Phases** (`phases.ts`) selon la règle de Lichess (Divider de scalachess, sans son critère de « mixité ») : milieu de partie à 10 pièces ou moins hors rois et pions, ou une dernière rangée avec moins de 4 de ses pièces ; finale à 6 ou moins, comme le thème « Finale ».
- L'analyse **garde l'évaluation de chaque position** (et si elle est fiable : passe approfondie, analyse Lichess ou partie finie) au lieu de ne garder que les erreurs, et repère aussi les erreurs de l'adversaire avec les mêmes règles (`judge`).
- **Approfondir une partie** : les coups calmes n'ont eu qu'un examen rapide (100 000 nœuds) et une tactique ratée peut y passer inaperçue. Le bouton évalue toutes ces positions à 1 M de nœuds, avec tous les moteurs ; la courbe s'affine en direct et les erreurs de la partie sont rejugées (nombre, entraînements lancés ensuite). Fermer la partie arrête ; ce qui est calculé reste. « Approfondir toutes les parties », discret au-dessus de la table, les enchaîne. En mémoire seulement, lié à l'analyse en cours : une nouvelle analyse repart de zéro (à rediscuter).

## 2026-10-23 : import manuel de parties (PGN)

Pouvoir utiliser toute l'app (analyse, graphique, entraînement) avec des parties apportées en PGN, sans compte en ligne.

- **Compte ou import, jamais les deux.** Un import est un profil à part, sur les mêmes adresses (`/player?import=true`) : onglets Parties, Analyse, Résultats, Entraînements, sans Aperçu (redirigé vers Parties). L'analyse prend ses parties dans une « bibliothèque » (`review/library.ts`) : les comptes (le code d'avant, inchangé) ou les parties importées (filtrées en mémoire).
- **Accueil** : sous les étapes, la colonne se divise en deux : recherche de compte à gauche, import à droite (dépôt d'un fichier ou bouton « Choisir un fichier », puis un PGN à coller). Sur écran tactile, seulement le PGN à coller. 20 Mo au plus.
- **Fenêtre d'import** : parties lues et écartées (illisibles, variantes, inachevées, en double), informations manquantes qui changent l'expérience (date, cadence, Elo), « Lequel est toi ? » (noms par nombre de parties, plusieurs possibles, le plus fréquent coché d'office), puis pour chaque partie sans ces noms : Blancs, Noirs ou Écarter (par défaut).
- **Rien n'est gardé**, comme pour les comptes : un nouvel import remplace le lot, un rechargement ramène à l'accueil (`import/store.ts`, en mémoire).
- Origine « Importée » (`GameSource`), lien vers la partie seulement si le PGN en donne un (Site de Lichess, Link de Chess.com), catégorie « Inconnue » sans cadence (cadence classée comme Lichess sinon), parties sans date datées de 1970 dans l'ordre du fichier (affichées « — », écartées par les filtres de période). Les horloges `[%clk]` et évaluations `[%eval]` du PGN sont reprises. Les entraînements regroupent désormais les erreurs par partie selon leur identifiant (plus selon le lien).
- Filtres d'une analyse d'import : ni plateforme ni « classées / amicales » (un PGN le dit rarement), « Inconnue » parmi les cadences ; ils ne sont pas enregistrés (ce sont ceux des comptes).

## 2026-10-23 : cache des analyses dans le navigateur (conception)

Relancer une analyse sur des parties déjà vues doit être instantané, et chaque calcul de Stockfish doit profiter aux suivants. Première version locale, sans backend. Conception détaillée : [analysis-cache.md](analysis-cache.md). Implémenté le même jour.

- **Cache par position, pas par partie** : une évaluation par FEN normalisée (sans les compteurs) et par moteur, réutilisée par toutes les parties qui passent par là (ouvertures de répertoire, transpositions, approfondissement). Plus lourd qu'un tableau d'évaluations par partie (≈ 15 à 20 Ko par partie au lieu de moins de 0,5 Ko), mais la place n'est pas la contrainte : des dizaines de milliers de parties même sur téléphone.
- **On garde les évaluations, pas le jugement** : les erreurs sont recalculées avec les critères du moment, donc changer de critères reste instantané.
- **Réutilisation** : même moteur et au moins autant de nœuds que demandé. Les budgets étant en nœuds, une évaluation vaut la même chose sur tous les appareils. Une seule entrée par position et par moteur, la plus profonde.
- **Versions** : chaque évaluation garde son moteur (`ENGINE_ID`) et ses nœuds, chaque partie la version de l'analyse (`ANALYSIS_VERSION`). De quoi proposer plus tard de mettre à jour les analyses passées, en se servant des anciennes évaluations pour ne recalculer que l'essentiel.
- **Identité des parties** : un hash des coups et de la position de départ, plus la liste des références (`lichess:…`, `chesscom:…`, `pgn:…`) pour garder le lien avec la partie d'origine.
- **C'est un cache, pas une sauvegarde** : plafond en nombre d'entrées, éviction des plus anciennement utilisées, `navigator.storage.persist()` demandé, et l'analyse continue sans cache sur une erreur de quota. Le cache survit aux mises à jour de l'app (IndexedDB est lié au domaine), pas à un effacement par le navigateur (Safari sur iPhone, après 7 jours sans visite, sauf PWA installée).
- Base Dexie `craftyourchess`, déclarée sur `/legal` et effacée par `clearLocalData()`.
- Écartés : un cache par partie (plus simple et plus compact, mais rien n'est partagé entre parties) ; garder les erreurs calculées (invalidées au moindre changement de critères) ; garder les évaluations de Lichess (redonnées à chaque récupération, et d'un autre moteur).
- Mise en œuvre : `lib/db.ts` (base Dexie), `features/review/cache.ts`, branché dans `analyzeGames` et `deepenGame`. Une analyse entièrement en cache ne démarre aucun moteur ; si seules des évaluations profondes manquent, seule la passe profonde tourne. Les étapes affichent « N positions · M déjà analysées ». Les réglages (roue dentée) montrent ce qui est gardé et permettent de le vider. Approfondir une partie n'est donc plus perdu à la prochaine analyse (le « à rediscuter » du 2026-10-23).
- L'estimation de durée avant de lancer tient compte du cache (corrigé le même jour).

## 2026-10-23 : parties des comptes dans le navigateur (conception)

Avec le cache d'analyses, réanalyser des parties déjà vues est instantané côté moteur, mais il faut encore les télécharger : environ 20 s pour 500 parties Lichess (20 parties par seconde sans token). Conception détaillée : [game-store.md](game-store.md). Implémenté le même jour pour la recherche de l'analyse.

- **Un magasin qui grandit au fil des recherches**, plutôt que l'import complet imaginé au départ (2026-10-04) : une carrière de 10 000 parties demanderait environ 8 minutes sur Lichess avant la première analyse.
- **Couverture connue exactement** : Lichess, des périodes par cadence (l'API filtre par cadence, et ne télécharger que celles demandées compte) ; Chess.com, les mois lus, un mois passé étant définitif une fois lu plus de 24 h après sa fin. La couleur et classée/amicale restent filtrées sur place.
- **Périodes arrêtées avant leur requête** (3 h, 60 jours pour la correspondance) : l'API ne donne que les parties terminées et filtre sur la date de début. La recherche suivante redemande ce bout ; en pratique, deux petites requêtes.
- **Parties brutes** stockées telles que les API les donnent, avec leur résumé vu du compte (`GameSummary`) pour filtrer sans lire les coups ; les coups ne sont lus que pour les parties retenues.
- **Arrêt sans perte** : écriture au fil de l'eau ; l'export allant du plus récent au plus ancien, la période couverte descend jusqu'à la dernière partie reçue (pas besoin de `sort=dateAsc`).
- **Éviction par compte entier**, le moins récemment cherché, au-delà d'environ 150 000 parties ou sur une erreur de quota.
- **Règle changée** à l'implémentation : les parties des comptes passent dans Dexie ; les autres données distantes (profil, statistiques) restent dans TanStack Query.
- Écartés : un import complet obligatoire (trop long) ; une couverture unique toutes cadences confondues (une recherche de blitz téléchargerait tout le bullet) ; des périodes aussi par couleur et classée/amicale (trop de périodes pour un gain d'au plus deux fois moins de parties) ; stocker les parties normalisées (la normalisation dépend du pseudo et évolue).
- Mesuré dans le navigateur : 500 parties Lichess déjà vues retrouvées en 0,6 s (deux requêtes : 3 h des cadences en direct, 60 jours de correspondance), au lieu d'environ 20 s.
- Repli : si le magasin échoue, la recherche repart sans lui, comme avant. Pas encore de file unique pour toutes les requêtes Lichess de l'app ; l'onglet Parties télécharge encore ses pages lui-même.

## 2026-10-23 : analyse de fond des comptes principaux

Le joueur peut choisir ses comptes principaux (Lichess, Chess.com) dans les réglages : l'app récupère et analyse alors elle-même ses N dernières parties, sur n'importe quelle page. Conception : [background-analysis.md](background-analysis.md). Implémenté le même jour.

- **N dernières parties toutes plateformes confondues**, au choix 50, 200, 500 ou 1000 ; 500 par défaut sur ordinateur, 50 sur téléphone, avec l'estimation du calcul affichée. Toute une carrière (environ 80 h de calcul pour 10 000 parties) n'a pas de sens par défaut.
- **Choisir ses comptes vaut consentement** ; un indicateur dans l'en-tête montre l'avancement, avec pause.
- **Le joueur passe toujours avant** : analyse, approfondissement, entraînement (tant que son moteur existe) ou recherche de parties mettent le fond en pause ; il abandonne aussitôt et repart après, sans rien perdre grâce au cache et au magasin.
- **Onglet caché** : on continue sur ordinateur (le téléphone gèle l'onglet de toute façon). **Plusieurs onglets** : un seul fait le travail (Web Locks).
- Une partie plus ancienne cherchée à la main est gardée, jamais suivie automatiquement. Les comptes principaux ne sont jamais évincés du magasin.
- Écartés : analyser toute la carrière ; N par plateforme (un vieux compte abandonné ferait analyser de vieilles parties) ; partager les moteurs pendant un entraînement (plus complexe pour un gain faible).
- Vérifié dans le navigateur : pause pendant un entraînement et reprise environ 4 s après sa fermeture ; un seul onglet travaille ; une activité dans un autre onglet met le fond en pause en moins de 2 s.
- **Correctif le jour même** : un onglet caché, gelé par Chrome, gardait le verrou et bloquait tous les autres onglets (« en cours dans un autre onglet », sans avancement). Désormais l'onglet qui travaille donne signe de vie avec son avancement, et un onglet affiché reprend le travail d'un onglet caché ou muet depuis 15 s. Le démarrage des moteurs s'interrompt aussi sans attendre.
- **Ajouts** : option « Analyse approfondie » (cochée par défaut), chaque position à 1 M de nœuds une fois toutes les parties analysées ; bouton « Synchroniser » ; vider les parties enregistrées laisse garder les joueurs cochés (comptes principaux cochés d'office).

## 2026-10-23 : plafonds de stockage par appareil, recyclage

Le but : ne jamais sentir de limite, mais recycler doucement le plus ancien quand il le faut, que les données viennent de l'analyse de fond ou des analyses du joueur.

- **Plafonds** (`lib/storageLimits.ts`), comptés en entrées : ordinateur 100 000 parties, 2 millions de positions, 50 000 parties analysées (≈ 800 Mo en tout) ; téléphone 15 000 parties, 300 000 positions, 8 000 parties analysées (≈ 120 Mo).
- **Recyclage** jusqu'à 90 % du plafond : positions et parties analysées les moins récemment utilisées ; pour les parties, d'abord les comptes les moins récemment cherchés (jamais les comptes principaux), puis les parties les plus anciennes, comptes principaux compris, en raccourcissant leurs périodes connues pour qu'elles restent justes.
- **Choix sur téléphone** : 10, 25, 50 ou 150 dernières parties suivies, 50 par défaut (50, 200, 500 ou 1000 sur ordinateur, 500 par défaut).

## 2026-10-23 : « Entraîner » pour les parties déjà analysées

Dans l'onglet Parties (comptes et import), une partie déjà analysée (entrée du cache d'analyses avec la version et le moteur actuels, retrouvée par sa référence `gameRef`) affiche « Entraîner » au lieu d'« Analyser ». Le lien (`?game=…&train=true`) relance l'analyse de la partie, instantanée grâce au cache, puis ouvre directement son entraînement. Sans erreur, on reste sur les résultats. La liste se met à jour au fil de l'analyse de fond.

## 2026-10-24 : notifications (toasts)

Une notification en bas de l'écran confirme ce qui vient d'être fait ailleurs que là où le joueur regarde, d'abord quand des comptes principaux sont définis (bouton du profil ou « Synchroniser » des réglages).

- Écrit à la main (`lib/toast.ts`, `components/Toaster.tsx`, une cinquantaine de lignes) plutôt que Sonner : pas de dépendance pour un besoin si simple. Grande, sur fond doré et texte sombre (couleurs du bouton principal), un titre court puis les comptes (« Lichess : X - Chess.com : Y » côte à côte sur grand écran, un par ligne sur téléphone, jamais coupés au milieu d'un nom ; tailles réduites sur téléphone). Apparaît en grandissant (90 % → 100 %, 300 ms, décélération douce) et s'efface en rétrécissant (150 ms) ; immobile si le système demande moins d'animations. Au-dessus de la barre de gestes des téléphones. Annoncée aux lecteurs d'écran (`aria-live`), disparaît après 4 s ou d'un clic.
- Les infobulles partagées (`ui/tooltip.tsx`) prennent aussi l'aspect des popovers au lieu d'un encadré clair inversé.

## 2026-10-24 : réglages allégés

Le menu des réglages devenait long et dense. Il reste plat (sans cartes), avec des sections plus lisibles : une icône devant chaque titre et un trait discret entre elles.

- **Comptes principaux** réduits à l'essentiel : les comptes en lecture seule (pastille de la plateforme et pseudo), un curseur « Dernières parties synchronisées », la case « Analyse approfondie » avec une infobulle. Tout s'applique aussitôt : plus de champs, ni de boutons « Synchroniser » et « Retirer ». Les comptes se définissent depuis un profil.
- **Données enregistrées** retirée : le détail (parties, analyses, vider) reviendra au clic sur l'indicateur de synchronisation.
- Les comptes principaux s'affichent avec les seules pastilles des plateformes, un même pseudo sur les deux sites sur une ligne. Une croix discrète au bout de la ligne arrête de les suivre, après confirmation (ce qui est enregistré reste) ; sans compte, « Aucun ».
- Le nombre de parties suivies se règle de 50 en 50 (de 5 en 5 sur téléphone, pour garder 25), les anciennes options restant des repères cliquables sous le curseur. La section « Style » devient « Style d'échiquier ».

## 2026-10-24 : les comptes principaux deviennent des favoris

Un seul compte principal par plateforme ne permettait de suivre qu'un joueur. On met désormais en favori autant de joueurs qu'on veut, dont l'app garde les dernières parties analysées en tâche de fond.

- **Un favori est un joueur** : un compte Lichess, un compte Chess.com, ou les deux (les comptes d'un profil). Ajouter complète le favori qui partage déjà un de ces comptes sans conflit de plateforme, sinon en crée un nouveau.
- **Étoile** après le nom du joueur, grise ou dorée et pleine, qui ajoute ou retire ; toujours confirmé (fenêtre avec icône étoile), notification ensuite. Retirer peut supprimer les parties enregistrées du joueur.
- **Réglages, section « Favoris »** : un favori par ligne avec sa croix (après confirmation), le curseur du nombre de parties **par joueur**, l'analyse approfondie.
- **Fond** : la boucle synchronise chaque favori à la suite, puis analyse toutes leurs parties sans doublon (une partie entre deux favoris compte une fois). Les comptes des favoris ne sont jamais évincés en entier du magasin.
- **Migration** : les comptes principaux enregistrés deviennent le premier favori, une fois (`craftyourchess:main-profile` → `craftyourchess:favorites`).
- **Correctif** trouvé au passage : « Supprimer mes données locales » pendant une analyse de fond laissait la base se recréer aussitôt. Les favoris en mémoire sont maintenant oubliés (événement `LOCAL_DATA_CLEARED`), et la base refuse de se rouvrir avant le rechargement de la page.

## 2026-10-24 : des options par favori

Le nombre de parties suivies et l'analyse approfondie étaient communs à tous les favoris. Chaque favori a désormais les siens : on peut suivre ses propres comptes en profondeur et un joueur fort sur ses 50 dernières parties.

- **Un favori = une série d'options** : un joueur aux deux comptes les partage, un joueur à un seul compte a les siennes. Un nouveau favori part des valeurs par défaut de l'appareil, réglables dès la fenêtre d'ajout.
- **Réglages en accordéon** : un favori déplié à la fois, le dernier ajouté déplié à l'ouverture, un résumé des options sur chaque ligne.
- **Partie commune à deux favoris** : analysée si l'un la veut, approfondie si l'un a l'option. La progression de l'approfondissement ne compte que les parties à approfondir.
- **Migration** : les anciennes options communes sont recopiées sur chaque favori.
- **Limite assumée** : le travail total n'est plus borné par un seul nombre (5 favoris à 1000 parties = 5000 parties). La limite de stockage de l'appareil s'applique toujours ; au-delà, de vieilles analyses sont recyclées et refaites. À surveiller.

## 2026-10-24 : indicateur de fond réduit à une icône, détail par favori

Le compteur « 120 / 500 » prenait trop de place dans l'en-tête, et un total commun ne disait pas où en était chaque favori depuis qu'ils ont leurs propres options.

- **En-tête** : une icône seule (en cours, à jour, en pause, erreur). La loupe de recherche disparaît sur téléphone : l'en-tête débordait, et l'accueil a la recherche.
- **Panneau** : une barre par favori et son nombre de parties suivies, rien d'autre que le bouton Pause, sauf une ligne quand il faut expliquer pourquoi rien n'avance.
- **Progression par favori** : le runner la calcule à chaque lot (`PlayerProgress` dans l'état et le battement de cœur entre onglets). Les parties déjà approfondies sont cherchées avant l'analyse (l'analyse n'approfondit rien), pour que la barre soit juste dès le début.

## 2026-10-24 : plus de chrono sous l'analyse

Le chrono discret (temps écoulé pendant l'analyse, puis durée totale sous les résultats) est retiré : il n'aidait pas l'utilisateur. L'estimation avant de lancer et la progression suffisent. `ActiveTime` reste, pour mesurer la vitesse réelle des moteurs.

## 2026-10-25 : barre en deux temps pour l'option approfondie

La barre d'un favori comptait l'analyse rapide et l'approfondissement ensemble (moitié chacun), quand le texte dessous ne compte que le passage en cours : une barre à 70 % face à « 20 / 50 » de l'approfondissement. Désormais, pour un favori avec l'option, la barre a deux moitiés séparées par une encoche (analyse rapide, puis approfondissement plus clair), le texte dit quel passage tourne (« Analyse rapide des parties », « Approfondissement des parties »), et l'infobulle de chaque barre donne les comptes du favori, le texte restant celui de tous les favoris ensemble. Le runner publie des comptes (`games`, `analysed`, `deepened`) au lieu d'une part.

## 2026-10-25 : section « Mémoire » dans les réglages

Un bouton pour vider ce que le navigateur garde des analyses, utile pour faire de la place ou repartir de zéro après un bug, même si la mémoire se recycle déjà seule.

- **Ce qu'il vide** : positions évaluées, parties analysées et parties enregistrées, sauf les parties synchronisées des favoris et leurs analyses. Pas d'option pour vider aussi celles des favoris : elles ont leur propre fonctionnement (retirer le favori, avec la case de suppression).
- **Les positions des favoris** ne sont liées à aucune partie dans la base : on les retrouve en rejouant les analyses des parties des favoris. Quelques secondes au pire, avec le bouton en attente.
- **Seulement la fenêtre des favoris** : pour chaque favori, les analyses de ses N dernières parties (son option, plateformes confondues). Ses analyses plus anciennes partent ; ses parties enregistrées restent toutes, pour ne pas trouer les périodes que le magasin croit complètes.
- **Affichage** : les nombres de positions et de parties analysées, relus toutes les 3 s pendant que les réglages sont ouverts. Le titre dit « Mémoire » plutôt que « cache ».

## 2026-10-25 : bouton « Installer » dans l'en-tête

Installer l'app passait par le menu du navigateur, que peu de gens connaissent. Un bouton « Installer » (icône seule sur téléphone) apparaît dans l'en-tête tant que l'app peut être installée (`lib/install.ts`, `components/InstallButton.tsx`).

- **Navigateurs Chromium** (Chrome, Edge, Brave, Samsung Internet ; Windows, macOS, Linux, Android) : l'app garde l'événement `beforeinstallprompt` et le bouton ouvre la fenêtre d'installation du navigateur. Le navigateur peut attendre un peu d'usage avant de l'envoyer.
- **Safari** (iPhone, iPad, Mac) et **Firefox sur Android** : pas d'événement ; le bouton ouvre un petit guide en deux étapes (Partager → Sur l'écran d'accueil ; Fichier → Ajouter au Dock ; menu ⋮ → Installer).
- **Firefox sur ordinateur** : il n'installe pas d'app web, pas de bouton.
- **Caché** une fois installée (`appinstalled`), dans l'app installée (`display-mode: standalone`, `navigator.standalone` sur iOS), et après une fenêtre d'installation refusée, jusqu'à ce que le navigateur la repropose. Rien n'est stocké, pas de bouton pour le masquer, pas de rappel sur l'accueil (choix de l'utilisateur).
- **En-tête sur téléphone** : logo un peu plus petit et espacements réduits pour que installer, avis, indicateur de fond et réglages tiennent à 360 px.

## 2026-10-25 : approfondissement automatique après une analyse

Une analyse finie enchaîne d'elle-même l'approfondissement de toutes ses parties (comme « Approfondir toutes les parties »), une fois par analyse : « Arrêter » l'arrête pour de bon.

- **Il cède la place** à tout autre usage de Stockfish (un entraînement, dans cet onglet ou un autre, une autre analyse) : il coupe ses moteurs, affiche « en pause pendant que Stockfish sert ailleurs, reprend ensuite », puis reprend 3 s après la fin du dernier, avec les positions qui restent (ce qui est calculé reste). `lib/activity.ts` : `othersActive`, `watchOthers`, `waitForOthers`, qui comptent les activités autres que la sienne, dans l'onglet et via les verrous partagés des autres onglets.
- **Il garde son activité pendant la pause** : l'analyse de fond des favoris continue d'attendre, l'analyse du joueur passe d'abord.
- **Une partie demandée pendant l'approfondissement de toutes** passe en tête, les autres suivent.
