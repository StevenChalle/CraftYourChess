# Analyse de fond des joueurs favoris : conception

Le joueur met en favori autant de joueurs qu'il veut (lui-même, des amis, des joueurs à suivre) : l'app récupère et analyse elle-même leurs N dernières parties, sur n'importe quelle page, tant que Stockfish ne sert pas à autre chose. Leurs analyses et leurs entraînements deviennent alors instantanés. Décision résumée dans [decisions.md](decisions.md) (2026-10-23, favoris le 2026-10-24).

État : implémenté (`features/background/`, `lib/activity.ts`). S'appuie sur le [magasin des parties](game-store.md) et le [cache des analyses](analysis-cache.md).

## Ce que le joueur choisit

- **Les favoris** : une liste de joueurs. Un joueur est un compte Lichess, un compte Chess.com, ou les deux : les comptes affichés sur un profil (`favorites.ts`).
- **Depuis un profil** : une étoile après le nom du joueur, grise s'il n'est pas en favori (« Ajouter aux favoris »), dorée et pleine s'il l'est (« Retirer des favoris »). Toujours confirmé par une fenêtre (icône étoile, comptes concernés). Ajouter montre aussi les options du favori (nombre de parties, analyse approfondie), aux valeurs par défaut de l'appareil, ou à celles du favori qu'il complète. Ajouter complète un favori qui partage déjà un de ces comptes sans en avoir un autre sur la même plateforme (le même joueur, vu d'abord d'une seule plateforme), sinon crée un nouveau favori ; une notification le confirme. Retirer un joueur aux deux comptes propose une case par compte (cochées) pour n'en retirer qu'un ; une autre case (décochée) supprime aussi les parties enregistrées des comptes retirés, jamais celles des autres comptes ; les évaluations du cache restent, communes à tous.
- **Réglages, section « Favoris »** : un favori par ligne (chevron, pastilles des plateformes, pseudo, ou les deux pseudos s'ils diffèrent, résumé de ses options : « 500 · approfondie », ou « 500 » sans l'option) . Le nom ouvre son profil ; le reste de la ligne déplie ses options ; un seul déplié à la fois, avec la même glissade que les sections des options d'entraînement ; le dernier favori ajouté est déplié à l'ouverture des réglages, pour qu'on voie que c'est modifiable. Une croix discrète pour le retirer, avec la même fenêtre que depuis un profil (dont la case pour supprimer ses parties) ; sans favori, « Aucun » et où en ajouter.
- **Options propres à chaque favori** : un joueur aux deux comptes a une seule série d'options, un joueur à un seul compte la sienne. Une partie entre deux favoris est analysée si l'un d'eux la veut, approfondie si l'un d'eux a l'option.
- **Combien de parties suivre** (« Dernières parties synchronisées », un curseur appliqué au relâchement) : de 50 à 1000 de 50 en 50 sur ordinateur (500 par défaut), de 10 à 150 de 5 en 5 sur téléphone (50 par défaut). Les valeurs indicatives (50, 200, 500, 1000 ; 10, 25, 50, 150 sur téléphone) sont des repères cliquables. Ce sont **les N dernières de chaque joueur, toutes ses plateformes confondues**.
- **Analyse approfondie** (cochée par défaut) : une fois la première analyse de toutes les parties finie, évaluer chaque position à 1 M de nœuds, pas seulement autour des coups suspects (infobulle dans les réglages). Les positions déjà profondes sont sautées, une position commune à plusieurs parties n'est calculée qu'une fois.
- Les réglages s'appliquent tout de suite, sans bouton. Le panneau des réglages fait 320 px, jamais plus large que l'écran moins 2 rem.
- Enregistré dans le `localStorage` (`craftyourchess:favorites`), déclaré sur `/legal`, effacé par `clearLocalData()`. Les comptes principaux enregistrés avant (`craftyourchess:main-profile`) deviennent le premier favori, une fois.

Sans favori, rien ne tourne : ajouter un joueur vaut consentement.

## Ce que fait l'app

Une boucle, lancée au chargement de n'importe quelle page :

1. **Synchroniser** : les N dernières parties de chaque favori, l'un après l'autre, par le magasin des parties (`findGames` avec le magasin), donc seulement les nouvelles après la première fois. Une partie entre deux favoris ne compte qu'une fois.
2. **Analyser** celles qui ne le sont pas encore, de la plus récente à la plus ancienne, par lots de 5 parties (la barre avance aussi pendant un lot) (`analyzeGames`, mêmes deux passes, critères enregistrés du joueur). Une partie compte comme analysée quand le cache des analyses a son entrée `games` avec la version d'analyse et le moteur actuels : un changement de moteur ou d'`ANALYSIS_VERSION` relance donc naturellement l'analyse des N parties.
3. **Approfondir** (option cochée), seulement une fois toutes les parties analysées une première fois, et jamais dans une passe où des parties d'un favori n'ont pas pu être récupérées (limite de débit, réseau) : la passe suivante les récupère et les analyse d'abord. Le panneau de l'indicateur le rappelle pendant le travail (« L'approfondissement suit la première analyse »), si un favori a l'option : les positions de ces parties encore évaluées rapidement, de la partie la plus récente à la plus ancienne, par lots de 2 parties (`deepenPositions`).
4. **À jour** : attendre, puis recommencer toutes les 10 minutes et quand la page redevient visible (une nouvelle partie jouée entre-temps).

**La fenêtre glisse** : chaque nouvelle partie y entre, la plus ancienne en sort. Elle reste dans le magasin et le cache, mais n'est plus suivie. Les parties gardées s'accumulent donc (500 suivies par joueur, peut-être 3 000 enregistrées après des mois, environ 20 Ko chacune avec ses analyses) ; les plafonds de stockage recyclent les plus anciennes. Une partie plus ancienne que le joueur cherche à la main est gardée comme toute autre, jamais mise à jour automatiquement. Les comptes des favoris ne sont jamais évincés en entier du magasin des parties (seules leurs plus anciennes parties sont recyclées au-delà du plafond).

## Priorité au joueur

Le travail de fond **cède la place** dès que le joueur a besoin de Stockfish ou des plateformes :

- une analyse ou « Approfondir » ;
- un entraînement **affiché et en cours** (de la première position jusqu'au bilan) : il doit répondre tout de suite à chaque coup. Le bilan, un onglet d'entraînement caché ou fermé libèrent Stockfish ; « Recommencer » ou « Rejouer les coups manqués » le reprennent ;
- une recherche de parties (Lichess ou Chess.com), y compris l'onglet Parties.

Mécanique, dans `lib/activity.ts` : chaque usage du joueur s'annonce (`beginActivity`) et se termine. Le travail de fond, lui, ne s'annonce pas : à la première activité, il **abandonne** ce qu'il fait (signal d'arrêt), et repart quelques secondes après la dernière. Rien n'est perdu : les positions évaluées sont dans le cache, les parties reçues dans le magasin. Repartir coûte le démarrage des moteurs (une seconde ou deux).

Les exports Lichess et les archives Chess.com s'annoncent dans leurs clients (`lib/lichess/client.ts`, `lib/chesscom/client.ts`), sauf ceux du travail de fond : la règle « une seule requête Lichess à la fois » tient, puisque le fond lâche sa requête dès qu'une autre commence.

## Plusieurs onglets

- **Un seul onglet fait le travail de fond** : il tient un verrou (`navigator.locks`, `craftyourchess:background`). Les autres attendent qu'il se libère.
- **L'onglet qu'on regarde travaille.** L'onglet qui travaille donne signe de vie toutes les 5 s (`BroadcastChannel`, rien n'est stocké), avec son avancement et s'il est affiché. Un onglet affiché qui attend reprend le verrou (`steal`) si l'onglet qui travaille est caché ou muet depuis 15 s. C'est indispensable : Chrome gèle un onglet caché qui use le processeur, et un onglet gelé garde son verrou sans rien faire (constaté le 2026-10-23, tous les autres onglets attendaient). L'onglet dépossédé s'arrête et se remet à attendre.
- **Les onglets qui attendent montrent l'avancement** de celui qui travaille (« En cours dans un autre onglet : 165 / 500 »).
- Une demande de verrou annulée juste après avoir été faite peut arriver trop tard au navigateur et rester en file : une fois accordée, elle est rendue aussitôt (sinon l'onglet se volerait le verrou à lui-même toutes les 15 s).
- **Les activités du joueur se voient d'un onglet à l'autre** : chacune tient aussi un verrou partagé (`craftyourchess:foreground`), que l'onglet du fond consulte toutes les deux secondes. Un verrou se libère tout seul quand son onglet se ferme.
- Sans `navigator.locks` (navigateurs anciens) : chaque onglet ne voit que ses propres activités.
- Choisir ou retirer ses comptes dans un onglet est suivi par les autres (événement `storage`) : leur travail de fond démarre ou s'arrête aussitôt.

## Ce qu'on voit

Un indicateur dans l'en-tête, à côté de la roue dentée, seulement quand il y a des favoris : **une icône seule**, pour la place (surtout sur téléphone) : en cours (cercle qui tourne, aussi quand un autre onglet travaille), à jour (coche verte), en pause (par le joueur, Stockfish utilisé ailleurs, ou Lichess qui demande d'attendre), erreur (triangle rouge). L'état en clair est dans l'infobulle et pour les lecteurs d'écran.

Au clic : **un favori par ligne** (pastilles, nom qui ouvre son profil, barre, nombre de parties suivies à droite : 500, 100…), dans l'ordre des réglages. La barre dit où en sont ses parties : analyse, puis approfondissement s'il a l'option (la moitié chacun) ; une partie commune à deux favoris compte pour les deux. Tant que ses parties sont en cours de chargement, une lumière glisse sur la barre (fixe si l'utilisateur réduit les animations) ; avant, elle garde la valeur de la passe précédente. Sous les favoris, l'état en une ligne avec la même icône que l'en-tête (« Les 150 parties sont synchronisées et analysées », « Analyse des parties de vos favoris : 12 / 50 », en pause pour un autre usage de l'app, autre onglet, limite Lichess, erreur). Puis le bouton **Pause / Reprendre** (pour la session).

## Les limites

- **Onglet ouvert seulement.** Rien ne tourne app fermée. Un onglet caché est gelé sur téléphone ; sur ordinateur, le travail continue.
- **Le calcul est long** : environ 15 s par partie avec tous les moteurs sur un ordinateur, 3 à 5 fois plus sur téléphone. 500 parties ≈ 2 h la première fois, puis quelques secondes par nouvelle partie.
- **Limite de débit** : sur un 429, la synchro attend 60 s ; l'analyse des parties déjà là continue.

## Tests

- Les activités : début, fin, abandon du fond, reprise après la dernière.
- La boucle (moteurs et plateformes simulés) : ne réanalyse pas une partie à jour, s'arrête dès qu'une activité commence, reprend ensuite, attend après un 429.
- Les réglages : lecture, valeurs par défaut selon l'appareil, effacement.

## Plus tard

- Montrer le résultat du travail de fond : sur son propre profil, les N dernières parties déjà analysées, puis des courbes d'évolution (erreurs par phase et par thème, mois après mois).
- Un nombre de moteurs plus discret pour le fond, au choix.
