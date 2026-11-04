# Feuille de route

## Fait

- [x] Squelette : Vite, React, TanStack, Tailwind/shadcn, thème sombre Lichess, PWA, CI
- [x] Recherche de joueur et page profil (classements par cadence)
- [x] Profil croisé Lichess + Chess.com : vue d'ensemble combinée, plus un onglet par plateforme
- [x] Configuration du déploiement Render (`render.yaml`)
- [x] Un pseudo par plateforme (comptes aux noms différents), avec recopie rapide
- [x] Interface bilingue anglais / français (langue du navigateur par défaut), choix mémorisé
- [x] Recherches récentes sur l'accueil (3 dernières, cliquables)
- [x] Page d'analyse à onglets (filtres, analyse, entraînement) à la place de la modale
- [x] Analyse approfondie : filtres (plateformes, N dernières ou période, cadences, couleur, résultat, Elo de l'adversaire), seuils réglables, récapitulatif avec estimation, pagination, rejeu par partie
- [x] Analyse des 10 dernières parties avec Stockfish WASM : nombre d'erreurs par partie (sans cache)
- [x] Rejouer ses erreurs sur un échiquier, dans un ordre aléatoire, avec bilan
- [x] Onglet Parties : historique toutes plateformes, paginé, avec l'Elo et sa variation (sans stockage)
- [x] Mises à jour de la PWA installée, licence GPL-3.0, page `/legal` avec effacement des données locales
- [x] Entraînements en onglets, avec un écran d'options
- [x] Thèmes des erreurs : filtre d'entraînement et barres dans les résultats
- [x] Menu des paramètres : langue et apparence des échiquiers
- [x] Page de contact avec un formulaire de retours (Web3Forms)
- [x] Renommage ChessMe → CraftYourChess, domaine https://craftyourchess.com

## V1 : à cadrer

- [ ] Définir les pages et les stats à afficher
- [ ] Import complet des parties (flux NDJSON vers Dexie), avec la progression affichée
- [ ] Synchro incrémentale (`since`) et gestion du 429
- [ ] Courbe Elo (ECharts)
- [x] Cache des évaluations dans le navigateur (Dexie) : une analyse relancée ou interrompue ne repart pas de zéro
- [x] Parties des comptes gardées dans le navigateur, synchro incrémentale ([game-store.md](game-store.md)) pour la recherche de l'analyse
- [x] Analyse de fond des joueurs favoris ([background-analysis.md](background-analysis.md))
- [x] Parties de la période sous le graphique de l'Elo, lues dans le magasin, mises à jour toutes les 15 s pendant qu'on joue (l'onglet Parties retiré)
- [ ] Montrer le résultat de l'analyse de fond sur son propre profil (dernières parties déjà analysées, puis évolution)
- [x] Visionneuse de partie : page de revue avec Stockfish en direct et variantes ([game-review.md](game-review.md))
- [ ] Enregistrer les variantes de la page de revue
- [ ] Étendre l'effacement des données locales (page `/legal`) aux parties importées

## Plus tard

- Mesurer l'analyse sur un vrai téléphone et ajuster l'estimation
- Cache des analyses ([analysis-cache.md](analysis-cache.md)) : bouton « Mettre à jour les analyses passées », coach qui lit le cache, export / import
- Analyse des parties : détailler les erreurs (positions, meilleur coup)
- Entraînement : mémoriser les résultats, revoir en priorité les positions ratées, sélecteur de promotion
- Import des parties Chess.com (archives mensuelles)
- Mémoriser les comptes liés : fait avec les favoris ; reste à s'en servir ailleurs (accueil, raccourcis vers ses favoris)
- Backend, si comptes ou synchro entre appareils
- Environnement de staging sur `staging.craftyourchess.com`, déployé depuis `develop` : second service dans `render.yaml`, CI aussi sur `develop`, en-tête `noindex`, nom de PWA distinct, pas de clé Web3Forms
