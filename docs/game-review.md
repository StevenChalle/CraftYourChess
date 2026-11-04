# Revue d'une partie (page d'étude)

Une page pour étudier une partie en détail sans quitter l'app : l'échiquier en grand, Stockfish en direct, les variantes, la courbe d'évaluation. Décision résumée dans [decisions.md](decisions.md) (2026-11-05).

## Où, et comment on y arrive

- `/player/review?lichess=…&chesscom=…&review=<gameRef>&ply=<demi-coup>` (ou `?import=true&review=…` pour une partie importée). La page vit dans le profil, pour réutiliser sa session (entraînements, critères d'analyse), sous son en-tête mais **sans ses onglets** (`ProfileTabs` dans `routes/player/route.tsx`).
- Le paramètre s'appelle `review`, pas `game` : `game` lance déjà l'analyse rapide d'une partie (session).
- Points d'entrée (`ReviewLink`) : le bouton **Review** du panneau de la courbe d'évaluation (à la place du lien « Analyze on Lichess »), au coup survolé ; l'icône de chaque ligne des listes de parties (profil, imports, résultats).
- La partie se charge par `library.findOne` (plateforme pour un compte, lot en mémoire pour un import). Une partie importée est perdue au rechargement de la page, comme le lot.

## Ce que montre la page

- **L'échiquier** (`StudyBoard`), le même composant et les mêmes réglages que l'entraînement, à la taille de l'entraînement (`useBoardSize` avec la largeur du panneau), une **barre d'évaluation** à côté (chances de gain, comme Lichess) et la flèche du meilleur coup du moteur. Tous les coups légaux se jouent, des deux camps ; les flèches dessinées au clic droit s'effacent au coup suivant.
- **Le panneau** (`StudyView`) : les joueurs, le résultat, l'ouverture ; le bouton principal (rejouer les erreurs de la partie, ou l'analyser) ; le moteur ; les coups ; les boutons de navigation.
- **Les coups** (`MoveList`) : ceux de la partie deux par deux, avec les erreurs du joueur (rouge), celles de l'adversaire (anneau) et le temps passé ; les variantes en ligne entre les coups de la partie, les sous-variantes entre parenthèses, comme Lichess.
- **La courbe** (`EvalChart` avec `onSelect`) sous l'échiquier : le coup affiché marqué, un clic y va ; le coup survolé montre sa position sur un petit échiquier au-dessus de la courbe.
- **Téléphone** : l'échiquier en haut de l'écran à l'arrivée, les boutons ◀ ▶ en grand, puis des onglets Coups / Moteur (avec l'évaluation dans son titre) / Courbe.

## Navigation et variantes

- L'arbre des coups (`features/study/tree.ts`, immuable) : un nœud par position, identifié par les coups UCI depuis le début. Les coups de la partie sont marqués `inGame`.
- `study.ts` (réducteur) : aller à un nœud, avancer / reculer / début / fin, jouer un coup ou une ligne du moteur, supprimer une variante. On retient la **ligne regardée** (la position la plus loin atteinte) : → la suit tant qu'on reste dans la variante ; revenu sur un coup de la partie (← ou clic), → reprend la partie.
- Clavier : ← → coup par coup, ↑ / Début et ↓ / Fin, espace joue le meilleur coup du moteur, F retourne l'échiquier. Molette sur l'échiquier : un cran, un coup (sans faire défiler la page).
- L'adresse suit le coup de la partie affiché (`ply`), sans remplir l'historique.
- Un coup refusé (échiquier désynchronisé) est ignoré, jamais une erreur ; l'échiquier est remis sur la position après chaque coup.
- Les variantes ne sont **pas enregistrées** : elles disparaissent en quittant la page.
- La promotion se fait en dame (comme dans l'entraînement).

## Le moteur en direct

- `LiveEngine` (`liveEngine.ts`) : un Stockfish, une position à la fois. Changer de position arrête la recherche en cours (`stop`), qui se termine avant la suivante (une position envoyée pendant une recherche plante le moteur WASM). Recherche `go depth` jusqu'à 22 (18 sur téléphone), 3 lignes (MultiPV), résultats à chaque itération complète (`Stockfish.analyse`).
- Le dernier résultat de chaque position est gardé en mémoire : y revenir l'affiche tout de suite, sans relancer une recherche déjà complète.
- Les coups enchaînés vite (touche maintenue) ne cherchent que là où l'on s'arrête (120 ms).
- C'est une **activité du joueur** (`lib/activity.ts`) pendant qu'il cherche : l'analyse de fond attend. Arrêté quand l'onglet du navigateur est caché.
- **Toujours éteint à l'ouverture** de la page, rien n'est retenu : on l'allume quand on en veut (interrupteur on / off). Éteint, plus aucune évaluation : ni le chiffre, ni la barre (qui garde sa place, l'échiquier ne bouge pas), pas même celle de l'analyse.
- Les lignes restent immobiles sous la souris, pour cliquer un coup sans qu'une recherche plus profonde le déplace. Un coup survolé montre la position où il mène sur un petit échiquier sous sa ligne (à la souris seulement : au doigt, le toucher joue le coup).

## Analyse sur la page

- Partie déjà analysée : jugée depuis le cache (`useCachedReviews`) avec les critères de l'onglet Analyse.
- Sinon, un bouton **Analyser la partie** (pas d'analyse automatique : elle prendrait le processeur pendant l'exploration). Le moteur en direct se met en pause pendant l'analyse ou l'approfondissement, puis reprend.
- « Approfondir » quand l'analyse n'est que rapide.
- « Rejouer mes N erreurs » ouvre l'entraînement de la partie (le même lien que « Entraîner » dans les listes).

## Plus tard

- Enregistrer les variantes (par partie, dans le navigateur).
- Choix de la pièce à la promotion, menu sur un coup (supprimer, promouvoir une variante).
- Remplacer aussi le lien Lichess de l'entraînement par la page de revue.
