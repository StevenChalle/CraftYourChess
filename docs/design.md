# Design

## Intention

Thème **« L'Établi »**, conçu avec Claude Design (2026-10-22) pour donner une identité propre à l'app, au lieu de copier le thème sombre de Lichess. Dense et sobre, graphite tiède, l'or du pion pour agir, Noto Sans comme le nom de l'app. Tout est plein et net : barres, onglets, badges argent. La couleur est réservée à l'or.

La spécification complète, avec les captures de référence, est dans [`design/theme-etabli/`](../design/theme-etabli/THEME.md). Les valeurs sont dans [`src/theme/etabli.css`](../src/theme/etabli.css), importé par `src/index.css`.

Règles à respecter sur tout nouvel écran :

- **Aucune couleur codée en dur** : uniquement les utilitaires issus des tokens, ou `var(--cyc-*)`.
- **Une seule couleur d'action, `primary`** (l'or du pion), et **un seul bouton principal par écran** : les autres en `secondary` ou `ghost`.
- **Surfaces par paliers**, sans ombre : `background` (page), `card` (panneaux), `field` (champs, tuiles, lignes paires), `raised` (menus, boutons secondaires, survol). Les bordures des panneaux sont très discrètes ; seuls les contrôles ont un contour net (`border-strong`).
- **Tout est plein** : barres de progression continues, onglet actif souligné d'un trait or continu. Ni segment ni pointillé, sauf une exception voulue : la progression d'un entraînement, une marque or par position.
- **`win`, `loss` et `title` sont des significations**, jamais de la décoration. Une victoire ou une défaite s'accompagne toujours d'un mot ou d'un signe (« Victoire », `+14`), pour les daltoniens. L'argent `title` est réservé aux badges de titre (GM, IM…).
- **Cyan (`highlight`) : une occurrence par écran au plus**, en pratique le bandeau de nouvelle version.
- **Chiffres en Noto Sans Mono** (`.num`) : classements, compteurs, dates en chiffres. Les phrases qui contiennent des nombres (« 412 parties », « Erreur 3 / 12 ») restent en Noto Sans, avec `tabular-nums`.
- **Plateformes** : une pastille discrète (`SourceDot`), bleue pour Lichess, verte pour Chess.com (`bg-lichess`, `bg-chesscom`), reprise aussi dans les barres empilées. Jamais leurs logos.
- **Évaluations** : sur une pastille aux couleurs du camp qu'elles favorisent, blanche quand elles sont positives (ou nulles), noire quand elles sont négatives (`components/evalChip.ts`), partout : étude, entraînement. Les pendules, elles, restent neutres pour ne pas s'y confondre.
- **Libellés** (titres de panneaux, en-têtes de colonnes, sections de formulaire) : `.label-etabli`, capitales espacées de 12 px.
- **Boutons fantômes et raccourcis** (3 / 5 / 10 / 50 / 100, « Aujourd'hui »…) : neutres, en gris clair ; la sélection se marque par un fond `raised` et un contour, pas par l'or.
- **Rayons** : 3 px pour les contrôles (`rounded-sm`), 4 px pour les panneaux (`rounded-lg`). Ombre (`shadow-pop`) sur les menus et dialogues seulement.
- **Fenêtres (dialogues)** : toujours une icône or avant le titre, en 18 px demi-gras (`DialogTitle icon={…}`, `AlertDialogTitle icon={…}`, ou `icon` des options de `useConfirm`, obligatoire). Une description courte seulement si elle apporte quelque chose.
- **Infobulles** (`ui/tooltip.tsx`) : l'aspect des popovers (fond `raised`, fine bordure, `shadow-pop`), sans flèche.
- **Notifications** (`showToast`) : fond or et texte sombre, titre court, quelques éléments en dessous ; apparaissent en grandissant et s'effacent en rétrécissant.
- Polices : **Noto Sans** et **Noto Sans Mono**, SIL OFL, hébergées avec l'app (`src/theme/fonts/`).
- **L'échiquier ne suit pas le thème** (choix de l'utilisateur) : ses couleurs, ses pièces et ses réglages restent ceux de `components/board/` (brun et cburnett par défaut).

## Tokens

| Utilitaire Tailwind                                              | Usage                                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `bg-background`                                                  | fond de page                                                                        |
| `bg-card`                                                        | panneaux, en-tête                                                                   |
| `bg-field` (= `bg-muted`)                                        | champs, tuiles, lignes paires des tableaux                                          |
| `bg-raised` (= `bg-secondary`, `bg-popover`)                     | menus, boutons secondaires, survol                                                  |
| `border-border` / `border-border-strong` (= `border-input`)      | bordures discrètes / contour des contrôles                                          |
| `text-foreground` / `text-muted-foreground` / `text-text-strong` | texte courant / atténué / mis en avant                                              |
| `bg-primary`, `text-primary`                                     | actions, liens, focus                                                               |
| `text-win` / `text-loss` (= `destructive`)                       | victoire, progrès / défaite, erreur                                                 |
| `bg-title`                                                       | badges de titre FIDE et Lichess                                                     |
| `text-highlight`, `bg-highlight`                                 | accent cyan ponctuel                                                                |
| `text-brand`, `text-brand-accent`                                | nom de l'app dans l'en-tête                                                         |
| `chart-1…5`                                                      | séries de graphiques, dans l'ordre bullet, blitz, rapide, classique, correspondance |
| `bg-piece-white` / `bg-piece-black`                              | couleur jouée, dans les tableaux                                                    |

Composants propres au thème, dans `etabli.css` : `.header-etabli` (en-tête), `.panel-etabli` (panneau), `.tile-etabli` + `.tile-value` (tuile de statistique), `.label-etabli` (libellé en capitales), `.num` (chiffres en mono), `.title-badge` (plaque argent), `.tab-etabli` (onglet, actif souligné d'or), `.progress-etabli` (barre de progression pleine, utilisée par `Progress`). Les boutons pleins n'ont pas de liseré.

## Logo

`public/logo.png` (512 px, tiré d'une image de 1024 px, coins arrondis transparents) : un **artisan qui taille un pion doré au ciseau**, des éclats autour, sur un fond sombre `#282421`. Le favicon et les icônes PWA gardent ces coins arrondis ; les icônes Apple et maskable les remplissent du fond du logo, car le système les découpe lui-même. Il illustre le nom : façonner son jeu. C'est une image matricielle, pas un SVG : à redessiner en vectoriel un jour si on veut plus de netteté en petit.

- Écartés : le fou cburnett à la longue-vue (2026-10-05 → 2026-10-22), un cavalier avec une loupe, une ligne d'horizon derrière le fou.
- Les icônes de l'app (favicon.ico, PWA, Apple) en sont générées : `pnpm generate-pwa-assets`, à relancer après toute modification de `logo.png`. Les icônes avec marge (maskable Android, Apple) utilisent le fond du logo (`pwa-assets.config.ts`), jamais du blanc.
- Dans l'en-tête : `pwa-64x64.png` à 40 px, suivi du nom « CraftYourChess » en **Noto Sans** de 24 px : « Craft » et « Chess » en gras `#dddddd` (`text-brand`), « Your » en maigre, dans le vert du thème `win` (`text-brand-accent`).

## Thème clair

Il n'est pas prévu pour l'instant. Le jour où on le voudra, il suffira de redéfinir les variables `--cyc-*` sous un sélecteur (`.light` ou `[data-theme]`), puisque les composants n'utilisent que les tokens.
