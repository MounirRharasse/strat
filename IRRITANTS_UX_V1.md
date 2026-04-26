# Strat — Irritants UX V1

_Document vivant — capturé le 26 avril 2026_

Ce document capture les retours utilisateur recensés pendant la phase de tests V1. Il sert de checklist pour les sprints UX à venir (probablement après le sprint architecture).

**Ne pas confondre** :
- Ce document = irritants UX terrain (à partir de l'usage réel)
- `STRAT_CADRAGE.md` = décisions produit structurelles
- `PLANNING_V1.md` = plan d'exécution séquencé

Quand un irritant remet en cause une décision du cadrage, le mentionner explicitement.

---

## Sources des retours

- **26 avril 2026** : retours de l'associée de Mounir, document `Note_ajustements_appli.docx`
- **26 avril 2026** : retours de Mounir lui-même pendant la session de débat archi (filtres incohérents, lenteur /previsions)

---

## Catégorie A — Bugs et incohérences (à fixer rapidement, hors archi)

### A1 — Journal : filtres non synchronisés avec le chiffre en haut à droite
**Source** : associée
**Description** : quand on clique sur "Entrées" ou "Dépenses", le chiffre récap en haut à droite ne se met pas à jour
**Priorité** : haute (bug fonctionnel, l'utilisateur voit un chiffre faux)
**Estimation** : 30 min - 1h
**Lien archi** : aucun, fix isolé possible

### A2 — Mix ventes / Canaux : CA Uber Eats n'apparaît pas
**Source** : associée
**Description** : sur la page Mix ventes onglet Canaux, le CA Uber Eats est absent
**Priorité** : haute (donnée manquante critique)
**Estimation** : à investiguer (probablement lié au modèle 3 sources Uber)
**Lien archi** : **dépend de la couche 1 (table sources)**. Tant qu'on a 3 sources Uber qui cohabitent (legacy historique_ca + entrees + manquant), ce bug est récurrent.

### A3 — Mix ventes / Produits : code couleur orange non légendé
**Source** : associée
**Description** : la couleur orange devant les Krousty M (et probablement d'autres) n'est pas légendée
**Priorité** : moyenne (UX cassée mais pas bloquant)
**Estimation** : 30 min

### A4 — Prévisions : info dupliquée
**Source** : associée
**Description** : "20 jours écoulés / 30 jours au total" en haut + "Progression du mois" plus bas = même info répétée
**Priorité** : basse (cosmétique)
**Estimation** : 15 min

### A5 — "Foxorder = ubereat ?" — confusion utilisateur
**Source** : associée
**Description** : l'associée se demande si Foxorder = Uber Eats. Le terme "Foxorder" est explicitement proscrit dans la charte (`STRAT_CADRAGE.md` §8) mais il subsiste quelque part dans l'UI.
**Priorité** : moyenne
**Estimation** : 30 min (rechercher où "Foxorder" est utilisé en UI)
**Lien archi** : symptôme du problème "app codée pour Mounir" — Foxorder est l'ancien nom hardcodé.

### A6 — Vocabulaire UI proscrit toujours présent
**Source** : Mounir + associée (implicite)
**Description** : MTD, YTD, 1S, 1M, 6M, 1A présents dans l'UI alors que proscrits par la charte
**Priorité** : moyenne (cosmétique mais incohérent avec le produit)
**Estimation** : sera fixé "gratuitement" par la migration vers `lib/periods.js`
**Lien archi** : **dépend de la couche 3 (lib/periods.js + composant `<PeriodFilter />`)**

### A7 — /previsions lent (~14s) sans feedback visuel
**Source** : Mounir
**Statut** : ✅ partiellement résolu le 26 avril 2026
- Pagination Popina parallélisée (commit `d7605ea`) → 30s à 14s
- `loading.js` ajouté (commit `94d2a82`) → feedback visuel pendant le chargement
**Reste à faire** : audit perf complet pour descendre à <5s

---

## Catégorie B — Features manquantes acceptées dans le cadrage mais pas livrées

### B1 — Comparaisons vs LY / vs Objectif sur les widgets principaux
**Source** : associée
**Description** : sur les widgets CA, Commandes, Panier de l'accueil, afficher une comparaison vs Last Year / vs Objectif
**Lien cadrage** : `STRAT_CADRAGE.md` §13 acte les comparaisons "à durée égale". vs Objectif n'est pas explicite mais est cohérent avec le pilier "Pilote".
**Priorité** : haute (vraie valeur produit)
**Estimation** : 4-8h selon implémentation
**Lien archi** : **dépend de la couche 3 (lib/periods.js)** pour calculer les périodes précédentes correctement.

### B2 — "Reste à faire" (CA restant pour atteindre l'objectif)
**Source** : associée
**Description** : afficher dans le widget CA un "Reste à faire" (objectif - CA actuel)
**Priorité** : haute (très demandé en pilotage resto)
**Estimation** : 1-2h
**Lien archi** : indépendant.

### B3 — Pédagogie food cost (infobulle "Pourquoi ce ratio est provisoire ?")
**Source** : associée (avec proposition de texte précise)
**Description** : icône ⓘ cliquable avec infobulle expliquant pourquoi le food cost affiché est provisoire (pas d'inventaire récent saisi)
**Lien cadrage** : `STRAT_CADRAGE.md` §14 (Inventaire simple) acte cette dimension pédagogique. Texte proposé par l'associée à archiver.
**Priorité** : moyenne
**Estimation** : 2-3h
**Texte fourni par l'associée** :
> "Pourquoi ce ratio est-il provisoire ? Ce ratio est calculé uniquement sur la base des achats saisis à ce jour. Il ne tient pas encore compte de la variation de stock entre le dernier inventaire réalisé et le prochain, qui sera saisi le 1er du mois. Les pertes, le gaspillage ou les écarts non constatés peuvent également faire varier ce chiffre. Le ratio sera définitif une fois l'inventaire enregistré."

### B4 — Inventaire à saisir le 1er du mois
**Source** : associée
**Description** : suggestion de cadence d'inventaire (le 1er du mois)
**Lien cadrage** : `STRAT_CADRAGE.md` §14 (Inventaire simple) acte la feature mais pas la cadence stricte. À débattre.
**Priorité** : moyenne (dépend de la livraison de la feature Inventaire)
**Estimation** : intégrée dans la feature Inventaire (~3-4h selon cadrage)

---

## Catégorie C — Améliorations UX à débattre

### C1 — Filtres sous le graphique (pattern Revolut)
**Source** : associée
**Description** : déplacer les filtres temporels sous les graphiques plutôt qu'au-dessus
**Priorité** : faible (préférence personnelle, à valider)
**Estimation** : 30 min par page si décidé
**Note** : à débattre — la convention actuelle au-dessus est aussi standard

### C2 — Graphique plein écran
**Source** : associée
**Description** : permettre d'agrandir un graphique en mode plein écran
**Priorité** : faible
**Estimation** : 4-8h selon graphique

### C3 — Données au survol / touch sur les courbes
**Source** : associée (référence Revolut > Cryptos > BTC)
**Description** : quand l'utilisateur passe le doigt sur une courbe, afficher les valeurs en infobulle
**Priorité** : moyenne (vraie valeur ergonomique)
**Estimation** : dépend de la lib graphique utilisée (Recharts probablement supporte ça nativement)

### C4 — Titre "KPIs" ou "Stats" + KPIs en colonne
**Source** : associée
**Description** : ajouter un titre au-dessus des KPIs et les afficher 1 par ligne plutôt que 2 par ligne
**Priorité** : faible (préférence d'affichage)
**Estimation** : 1h
**Note** : à débattre — 2 par ligne est plus dense, 1 par ligne plus lisible. Test utilisateur ?

### C5 — Camembert pour répartition encaissement
**Source** : associée
**Description** : remplacer la liste valeur+pourcentage par un camembert avec valeurs en infobulle au survol
**Priorité** : faible
**Estimation** : 2-4h

---

## Catégorie D — Réorganisations de pages

### D1 — Mix ventes : ordre des filtres
**Source** : associée
**Description** : passer de l'ordre actuel (Amplitude, Canaux, Produits) à (Canaux, Produits, Amplitude)
**Priorité** : faible (cosmétique)
**Estimation** : 15 min

### D2 — Prévisions : remonter "Lecture" et "Progression" sous CA projeté
**Source** : associée
**Description** : restructurer la hiérarchie visuelle de la page Prévisions pour mettre le contexte juste sous le chiffre projeté
**Priorité** : moyenne (impacte la lisibilité)
**Estimation** : 1-2h

### D3 — Page Business : éviter les doublons d'info
**Source** : associée
**Description** : "Répartition encaissement" affichée plusieurs fois sur la même page (en valeur, en pourcentage, en widget). Idem "Commissions estimées" présentes à plusieurs endroits.
**Priorité** : moyenne (encombrement visuel)
**Estimation** : 1-2h (plus une décision sur où l'afficher)

### D4 — Échéances : "Total échéances du mois"
**Source** : associée
**Description** : si toutes les échéances ne sont pas affichées (loyer manquant par exemple), écrire juste "Total" plutôt que "Total échéances du mois" qui sous-entend exhaustivité
**Priorité** : faible
**Estimation** : 15 min

### D5 — Détail CA selon mode de paiement : refermer par défaut
**Source** : associée
**Description** : sur la page Mon Business, le détail CA par mode de paiement est ouvert par défaut. À fermer avec une flèche pour développer.
**Priorité** : faible (préférence UX)
**Estimation** : 30 min

### D6 — VAE/VSP en pourcentage
**Source** : associée
**Description** : afficher la part VAE/VSP en pourcentage (en plus de la valeur ?)
**Priorité** : faible
**Estimation** : 30 min

### D7 — Commissions estimées en widget avec courbe
**Source** : associée
**Description** : afficher les commissions estimées dans un widget dédié, avec valeur + pourcentage + courbe d'évolution si commissions non fixes
**Priorité** : moyenne (vraie valeur si les commissions varient)
**Estimation** : 2-4h

### D8 — Food cost : "+xx points vs quoi ?" pas explicite
**Source** : associée
**Description** : la mention "+xx points" sur le food cost ne précise pas vs quoi (objectif ? période précédente ?)
**Priorité** : moyenne (clarté donnée)
**Estimation** : 30 min
**Lien archi** : **dépend de la couche 3** pour les comparaisons à durée égale

---

## Catégorie E — Concepts produit à débattre

### E1 — Navigation : "pas fan fan de l'accès rapide pour P&L et Prévisions"
**Source** : associée
**Description** : l'associée trouve l'accès rapide vers P&L et Prévisions peu intuitif
**Priorité** : à investiguer (besoin de creuser ce qu'elle trouve gênant)
**Estimation** : N/A (décision produit avant code)
**Note** : peut remettre en cause l'architecture de navigation. À discuter en débat produit.

### E2 — Comment consulter les entrées/dépenses sur une période précédente ?
**Source** : associée
**Description** : actuellement, le journal ne permet pas de filtrer sur une période passée précise (par exemple "juin 2025")
**Priorité** : moyenne (use case réel de pilotage)
**Estimation** : dépend du composant `<PeriodFilter />` une fois livré
**Lien archi** : **dépend de la couche 3 (lib/periods.js + filtre Personnalisé)**

---

## Synthèse — comment ce document s'articule avec le sprint archi

Sur les 23 irritants recensés ci-dessus :

| Lien avec sprint archi | Nombre | Exemples |
|---|---|---|
| Sera fixé "gratuitement" par sprint archi | 4 | A6, B1, D8, E2 (vocabulaire UI, comparaisons vs Objectif, food cost vs quoi, période passée Journal) |
| Bloqué par sprint archi (Couche 1 sources) | 1 | A2 (CA Uber Eats absent Mix ventes) |
| Indépendant du sprint archi | 18 | A1, A3, A4, A5, A7, B2, B3, B4, C1-C5, D1-D7, E1 |

**Conclusion** : la majorité des irritants peuvent être traités **après** le sprint archi sans dépendance forte. Mais 5 irritants (A2, A6, B1, D8, E2) bénéficient directement de l'archi propre. C'est un bon ROI pour valider que l'investissement archi en vaut la peine.

---

## Méta — comment utiliser ce document

1. **Avant chaque sprint UX** : relire ce document, sélectionner les items à traiter en priorité
2. **Après chaque retour utilisateur** : mettre à jour ce document avec les nouveaux irritants
3. **Ne jamais coder un fix d'irritant sans le marquer ici** : sinon on perd la traçabilité
4. **Faire un bilan mensuel** : combien d'items traités, combien restent ?

---

## Historique

- **v1.0 (26 avril 2026)** : capture initiale du document de l'associée + retours Mounir de la session du 26 avril
