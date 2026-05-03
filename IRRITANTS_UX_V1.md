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

## Catégorie F — Migration data layer / sémantique data

Catégorie introduite le 3 mai 2026 lors de la session de cadrage Phase A migration data layer. Les 13 items ci-dessous sont liés directement à la migration vers `ventes_par_source` + `paiements_caisse` (cf. `STRAT_ARCHITECTURE.md` v1.1 §Décision #5 et `PLANNING_V1.md` v1.2 §Sprint Migration data layer).

### F1 — Sémantique `ca_brut` legacy figée jusqu'au drop
**Source** : session cadrage Phase A 3 mai 2026
**Description** : la sémantique de `historique_ca.ca_brut` est instable dans le repo (3 chemins d'écriture avec 3 sémantiques différentes, confirmation empirique sur 15 jours consécutifs 01/01-15/01/2025 où 13 jours ont `ca_brut = caisse + uber` et 2 jours ont `ca_brut = caisse seule`). Décision actée : ne PAS chercher à la stabiliser, la table legacy `historique_ca` reste figée jusqu'à son drop en Phase C de la migration.
**Priorité** : V1 (gate)
**Estimation** : aucune — décision de ne pas faire
**Lien archi** : Cf. `STRAT_ARCHITECTURE.md` §Décision #5 (option β actée pour contourner cette instabilité plutôt que la corriger)

### F2 — Bugs sémantique `ca_brut` côté lectures
**Source** : audit Claude Code session cadrage Phase A
**Description** : 6 lieux du code traitent `historique_ca.ca_brut` comme « caisse seule » (`recap-builder.js:87`, `audit-saisies.js:87` et `:446`, `brief-inputs.js:134`, `insight-detection.js:68`, `analyses-kpis.js:92`), 2 lieux le traitent comme « caisse + uber » (`dashboard/page.js:185`, `analyses-kpis.js:95`). Le fichier `analyses-kpis.js` se contredit lui-même entre les lignes 92 et 95. Conséquence : selon l'écran ouvert, les chiffres CA affichés ne sont pas cohérents.
**Priorité** : V1 (à corriger au moment de la migration des lectures, Étape 5 du Sprint Migration data layer — le cutover résoudra le problème par construction)
**Estimation** : intégré au Sprint Migration data layer, pas chiffré séparément
**Lien archi** : connexe à §30 (duplication formule CA HT) mais distinct — §30 traite de la duplication, F2 traite de l'incohérence sémantique de la colonne.

### F3 — Dette TPA Krousty fusion → cb au backfill
**Source** : décision technique D3 session cadrage Phase A
**Description** : `historique_ca.tpa` est l'encaissement borne self-order de Krousty, techniquement du paiement CB et constitue une scorie spécifique mono-tenant. En V2, `tpa` est fusionné dans `paiements_caisse.cb` au backfill (cf. `STRAT_ARCHITECTURE.md` §Décision #1, §Conventions). La distinction TPA/CB est perdue post-cutover. Reconstitution possible via `historique_ca.tpa` legacy jusqu'au drop en Phase C.
**Priorité** : V2 (item dette, pas un bug actif)
**Estimation** : nulle (dette acceptée)
**Lien archi** : `STRAT_ARCHITECTURE.md` §Décision #1 §Conventions

### F4 — NULL `nb_commandes` sur 18/04/2024 → 31/05/2025
**Source** : confirmation Mounir session cadrage Phase A
**Description** : tracking `nb_commandes` (caisse VSP + plateforme Uber) non saisi avant le 01/06/2025. Toutes les sources sont concernées, pas seulement Uber. Les ~273 jours d'import KS2 (18/04/2024 → 15/01/2025) auront `nb_commandes = NULL` dans `ventes_par_source`. Le futur `lib/calculs/` devra gérer ce NULL pour les agrégats panier moyen, évolution YoY du nb tickets, etc. — soit en excluant la période, soit en la signalant dans l'UI.
**Priorité** : V1 (à intégrer dans `lib/calculs/` quand il sera centralisé)
**Estimation** : intégré au design `lib/calculs/`, pas chiffré séparément
**Lien archi** : couche calculs (Phase 1 PLANNING)

### F5 — NULL `montant_ht` sur période d'import KS2
**Source** : structure du fichier KS2 (TTC seul, pas de HT)
**Description** : `ventes_par_source.montant_ht` sera NULL sur toute la période d'import KS2 (18/04/2024 → 15/01/2025). Calcul à la lecture avec TVA 10 % par défaut (restauration sur place / à emporter France). À raffiner si produits multi-taux apparaissent (TVA 5,5 % emporté, 20 % alcool, etc.).
**Priorité** : V2 (matérialiser HT en BDD si multi-taux devient un cas réel)
**Estimation** : nulle V1, chantier à scoper si multi-taux
**Lien archi** : `STRAT_ARCHITECTURE.md` §Décision #5 §Données NULL acceptées

### F6 — NULL commission Uber sur période d'import KS2
**Source** : structure du fichier KS2
**Description** : `ventes_par_source.commission_ttc` et `commission_ht` pour la source Uber Eats sont NULL sur toute la période d'import KS2. KS2 ne tracke pas la commission au jour le jour. Disponible uniquement via API/exports Uber pour la période 16/01/2025+.
**Priorité** : V2
**Estimation** : à raffiner si reconstitution commissions historiques est demandée
**Lien archi** : `STRAT_ARCHITECTURE.md` §Décision #5 §Données NULL acceptées

### F7 — Hypothèse non vérifiée sur la rétention API Popina
**Source** : test rétention session cadrage Phase A (`scripts/test-retention-popina.mjs`)
**Description** : la frontière de rétention API Popina au 14/01/2025 coïncide avec le premier export Excel Popina disponible côté Mounir. Hypothèse : c'est la date d'activation de la caisse Popina chez Krousty, donc une rétention statique. Hypothèse alternative non exclue : c'est une rétention glissante qui pourrait perdre des jours disponibles dans X mois. Aucun moyen de trancher depuis le client API sans documentation Popina explicite. Conséquence si hypothèse fausse : on perd silencieusement des jours de données dans `ventes_par_source` côté ingestion future.
**Priorité** : V1.1 (cron de surveillance mensuelle de la frontière à envisager plus tard, hors scope Phase A étape 1)
**Estimation** : 1 cron léger (5 lignes), à programmer plus tard
**Lien archi** : Sprint Migration data layer (post-cutover)

### F8 — Dette `parametres` : colonnes timestamp redondantes FR/EN
**Source** : inventaire timestamps session cadrage Phase A (`scripts/inventaire-timestamps.mjs`)
**Description** : la table `parametres` est la seule du schéma à avoir des colonnes timestamp redondantes : `created_at` + `date_creation` (français) coexistent, et `updated_at` + `derniere_activite` (français) aussi. AM3 a acté `created_at` (anglais) sur les nouvelles tables, cohérent avec la convention dominante des 13 autres tables. Pour `parametres`, à investiguer en Phase B/C : laquelle est peuplée et laquelle est dépréciée à drop.
**Priorité** : V1.1 (Phase B ou C de la migration)
**Estimation** : ~30 min d'investigation + migration de drop
**Lien archi** : aligné avec la convention nommage de `STRAT_ARCHITECTURE.md` §Décision #1 §Conventions

### F9 — Communication saut visuel attendu au cutover
**Source** : décision actée session cadrage Phase A
**Description** : au moment du cutover (Étape 6 Sprint Migration), le dashboard et le P&L vont basculer de la sémantique pourrie `historique_ca` à la sémantique propre `ventes_par_source`. Les chiffres affichés vont changer brutalement par rapport à la veille. Changement attendu et bénin. Prévoir audit visuel avant/après sur 5-10 dates échantillon + note dans le changelog pour Mounir.
**Priorité** : V1 (à faire au moment du cutover)
**Estimation** : ~1h audit + ~15min changelog
**Lien archi** : `STRAT_ARCHITECTURE.md` §Décision #5 §Cutover saut visuel

### F10 — Cron Popina classifie paiements par `nom.includes()` sur 4 mots-clés
**Source** : audit Claude Code session cadrage Phase A
**Description** : `app/api/cron/nightly/route.js:67-74` classifie les paiements Popina par `nom.includes()` sur 4 mots-clés : `esp`, `carte|credit`, `borne`, `titre|restaurant`. Tout paiement avec un `paymentName` non reconnu (Edenred, Lunchr, Apple Pay, avoir, etc.) tombe dans aucune des 4 colonnes especes/cb/tpa/tr. Donc même un cron parfaitement sain produit des rows où `ca_brut > especes+cb+tpa+tr`. Cet écart est un signal correct du moteur Popina, pas un bug à corriger. À garder en tête au moment où `paiements_caisse` sera alimenté en V2 : les modes de paiement non standard ne sont pas captés.
**Priorité** : V2 (lié à la dette EAV de `paiements_caisse`, cf. `STRAT_ARCHITECTURE.md` §Décision #1 §Conventions)
**Estimation** : à scoper avec la migration EAV
**Lien archi** : `STRAT_ARCHITECTURE.md` §Décision #1 §Conventions (modes paiement opiniâtres)

### F11 — KS2 contient `nb_commandes` VSP+Uber depuis 01/06/2025 — opportunité validation croisée
**Source** : structure du fichier KS2 (colonnes V et W)
**Description** : le fichier KS2 personnel de Mounir tracke `Nb de ticket VSP` (col V) et `Nb de tickets Uber` (col W) à partir du 01/06/2025. Ces données ne sont pas utilisées pour le backfill (la période d'import KS2 s'arrête au 15/01/2025, avant le début du tracking), mais elles peuvent servir d'audit de cohérence avec `ventes_par_source.nb_commandes` post-cutover sur 2025-06-01 → aujourd'hui si besoin.
**Priorité** : V1.1 (audit optionnel post-cutover, pas un bug)
**Estimation** : ~1h script audit + analyse
**Lien archi** : Sprint Migration data layer (post-cutover)

### F12 — Données KS2 ne distinguent pas vide non saisi vs 0 explicite
**Source** : inspection Claude Code session cadrage Phase A
**Description** : dans le fichier KS2, une cellule de paiement vide (string '' ou '-   €' formaté monétaire vide) est techniquement indistinguable d'une saisie à 0 €. Au backfill, ces deux formes sont traitées comme 0. Conséquence pratique faible parce que TPA est de toute façon une scorie sortie en V2, mais sur Espèce/CB/TR une cellule non saisie devient 0 dans `paiements_caisse`. Limitation acceptée en l'état, pas de mécanisme de distinction prévu.
**Priorité** : V2 (pas un bug actif)
**Estimation** : nulle (dette acceptée)
**Lien archi** : Sprint Migration data layer Étape 2 (backfill KS2)

### F13 — Idempotence import KS2 : règle de conduite « modifier dans Excel pas en BDD »
**Source** : décision actée session cadrage Phase A
**Description** : l'import KS2 utilise `ON CONFLICT (parametre_id, date, source_id) DO UPDATE` sur `ventes_par_source` et `paiements_caisse`. Sur la période d'import (18/04/2024 → 15/01/2025), le fichier Excel KS2 est la source de vérité : toute correction passe par modification dans Excel puis import rejoué. Modifier directement en BDD sur cette période fait perdre la modif au prochain run. À mentionner dans un éventuel doc opérationnel d'usage de la BDD.
**Priorité** : V1 (règle de conduite, pas un bug)
**Estimation** : nulle
**Lien archi** : `STRAT_ARCHITECTURE.md` §Décision #5 §Idempotence import KS2

### F14 — STRAT_ARCHITECTURE §Décision #1 §RLS à corriger
**Source** : découvert lors de la Phase A étape 1 du Sprint Migration data layer (3 mai 2026)
**Description** : `STRAT_ARCHITECTURE.md` v1.1 §Décision #1 §RLS dit « RLS activée sur les 3 tables avec policies filtrant par parametre_id du user courant ». En réalité, la convention V1 du repo est « RLS désactivée partout, filtrage côté code via parametre_id, activation prévue V1+ » (cf. commentaire `supabase/migrations/20260428001000_v1_inventaires.sql:38-40`). À la Phase A étape 1, l'option α a été retenue (RLS désactivée alignée V1). Le doc d'archi doit être amendé pour refléter ce report.
**Priorité** : V1 (le doc d'archi ment actuellement, à corriger en cohérence)
**Estimation** : ~5 min (avenant v1.1.1 sur §Décision #1 §RLS + entrée §Historique)
**Lien archi** : `STRAT_ARCHITECTURE.md` §Décision #1 §RLS (à modifier) + cohérence avec activation RLS qui sera traitée dans le futur sprint « bascule backend vers service_role » (V1+)

---

## Synthèse — comment ce document s'articule avec le sprint archi

Sur les 23 irritants recensés ci-dessus :

| Lien avec sprint archi | Nombre | Exemples |
|---|---|---|
| Sera fixé "gratuitement" par sprint archi | 4 | A6, B1, D8, E2 (vocabulaire UI, comparaisons vs Objectif, food cost vs quoi, période passée Journal) |
| Bloqué par sprint archi (Couche 1 sources) | 1 | A2 (CA Uber Eats absent Mix ventes) |
| Indépendant du sprint archi | 18 | A1, A3, A4, A5, A7, B2, B3, B4, C1-C5, D1-D7, E1 |

Cf. **Catégorie F** pour les irritants spécifiquement liés à la migration data layer (sprint archi en cours, cf. `STRAT_ARCHITECTURE.md` §Décision #5).

**Conclusion** : la majorité des irritants peuvent être traités **après** le sprint archi sans dépendance forte. Mais 5 irritants (A2, A6, B1, D8, E2) bénéficient directement de l'archi propre. C'est un bon ROI pour valider que l'investissement archi en vaut la peine.

---

## Méta — comment utiliser ce document

1. **Avant chaque sprint UX** : relire ce document, sélectionner les items à traiter en priorité
2. **Après chaque retour utilisateur** : mettre à jour ce document avec les nouveaux irritants
3. **Ne jamais coder un fix d'irritant sans le marquer ici** : sinon on perd la traçabilité
4. **Faire un bilan mensuel** : combien d'items traités, combien restent ?

---

## 27. Faux positif anomalies fournisseurs bimodaux

- **Découvert** : 30 avril 2026 lors du test brief V1
- **Cas** : fournisseurs avec 2 clusters de montants (ex: Appart City :
  loyer mensuel ~1200€ + frais ponctuels ~50-100€)
- **Symptôme** : detecterAnomaliesMontant calcule la médiane sur tous les
  montants (~660€ dans cet exemple), donc tout montant gros (1100€+) ou
  petit (<200€) ressort comme "anormal"
- **Impact** : 1-2 faux positifs par mois dans le journal et brief
- **Pistes** : clustering, détection bimodalité, pondération par catégorie
- **Priorité** : V1.1 (faible, ton "à vérifier" ne trompe pas le user)

## 29. Saisonnalité scolaire dans baseline drop_ca / spike_ca

- **Découvert** : 1er mai 2026 lors de l'audit commit 5 (vacances de Pâques 2026 : W16-W17)
- **Cas** : `evaluerDropOuSpikeCA` compare le CA d'hier à la moyenne des 4 mêmes DOW précédents. Sur Krousty, W17 a 13 drop_ca consécutifs car la baseline (4 jeudis précédents) inclut majoritairement des jeudis "normaux" hors vacances scolaires.
- **Impact V1** : sans correction, taux d'activation = 100% pendant les semaines de vacances. Cooldown N=2 limite à ~5-7 events sur 17 jours mais ne supprime pas la racine.
- **Pistes V1.1** :
  - Exclure de la baseline les semaines qui chevauchent vacances scolaires de la zone du restaurant
  - Ou pondérer les samples par "ressemblance contextuelle" (jours fériés, vacances)
  - Source vacances : api gouvernement open data calendrier scolaire France
- **Priorité** : V1.1 (cooldown V1 limite l'irritant)

## 28. ANOMALIE_SYSTEM peut mélanger HT et TTC dans les comparaisons

- **Découvert** : 1er mai 2026 lors du test commit 4 (anomalies bouton "Comprendre")
- **Cas** : explication Appart City 26 avril a comparé "1 153,50 € TTC" (aujourd'hui)
  avec "961,25 € HT" du 31 mars, sans préciser la différence HT/TTC. Numériquement
  les 2 valent le même prix réel (961.25 × 1.20 ≈ 1153.50), mais la phrase est
  bancale ("correspond exactement à celui du 31 mars").
- **Impact** : faible. L'utilisateur regarde TTC dans le journal, peu probable
  qu'il remarque. Mais la phrase peut être confuse si lue attentivement.
- **Pistes** :
  - Soit fournir uniquement le TTC dans les inputs (n'envoyer pas montant_ht au modèle)
  - Soit instruct le modèle dans ANOMALIE_SYSTEM : "Compare uniquement les montants TTC entre eux"
- **Priorité** : V1.1 (faible)

## 31. INSIGHT_SYSTEM peut répéter le squelette d'hypothèses sur drop_ca

- **Découvert** : 1er mai 2026 lors du test commit 6 (génération IA insight)
- **Cas** : 4 drop_ca consécutifs W17 (espacés par cooldown N=2) ont chacun
  proposé "fermeture partielle, météo ou événement externe" comme hypothèses.
  Le squelette narratif est identique.
- **Impact** : faible. Le cooldown N=2 limite à 1 drop_ca tous les 3 jours,
  donc la répétition est diluée.
- **Pistes V1.1** :
  - Injecter le jour de la semaine dans des hypothèses spécifiques (lundi
    → "fin de week-end calme", dimanche → "concurrence brunchs")
  - Varier les hypothèses selon la magnitude (faible drop = "creux normal",
    fort drop = "fermeture probable")
- **Priorité** : V1.1 (faible)

## 30. Centraliser le calcul "CA HT avec Uber" dans un helper

- **Découvert** : 1er mai 2026 lors de l'audit drop_ca / food_cost commit 5
- **Cas** : la logique `(ca_ht historique_ca) + (uber historique_ca / TVA_UBER_EATS) + (entrees uber_eats / TVA_UBER_EATS)` est dupliquée 6× après les fix : `analyses-kpis.js` (×2 : branche else + branche exact), `seuil-rentabilite.js`, `food-cost-historique.js`, `insight-detection.js`, `dashboard/page.js`.
- **Symptôme** : tout nouveau calcul caHT a un risque élevé de réintroduire le bug "Uber HT manquant".
- **URGENCE V1.1 PRIORITAIRE** : 4 bugs distincts trouvés sur la même classe lors du sprint IA Phase 1, c'est trop. La centralisation doit être tôt en V1.1.
  - Bug 1 (commit 2) : `ca_brut` (nom de colonne) dans `_buildCAParJour` brief
  - Bug 2 (commit 2) : Uber multi-sources dans `detecterTrousCanal` audit-saisies
  - Bug 3 (commit 5) : food_cost mode estime branche else `analyses-kpis.js` (+ 4 callers)
  - Bug 4 (commit 9) : food_cost mode exact branche interne `analyses-kpis.js`
- **Pistes** : créer `lib/data/ca-helpers.js` exportant `caHTAvecUber({ historique, entreesUber })`. Refacto les 6 endroits.
- **Priorité** : V1.1 (faible — le fix in-place V1 corrige la valeur, le helper sera juste une amélioration de robustesse).
- **Cf. F2** : l'incohérence sémantique côté lecture (`dashboard:185`, `analyses-kpis:92` vs `:95`) est traitée comme item distinct dans la catégorie F.

---

## 32. Sessions antérieures non closes par commit

- **Découvert** : 3 mai 2026, en clôture de la session de cadrage Phase A migration data layer (commit `3fb6017` STRAT_ARCHITECTURE.md v1.1).
- **Cas** : `git status` révèle plusieurs features et scripts non committés issus de sessions précédentes, qui cohabitent avec le travail de la session courante :
  - **Feature `/recap` web** (gérant) : `app/recap/`, `lib/recap-builder.js`, `scripts/recap.mjs`
  - **Feature `/admin/audit` web** (support) : `app/admin/audit/`, `lib/audit-builder.js`, `scripts/audit-data.mjs`, plus la modif liée `app/admin/layout.js` (ajout du lien sidebar)
  - **Scripts archives Phase 2 réconciliation Krousty** (one-shot déjà tournés) : `scripts/phase2-execute.mjs`, `scripts/phase2-diagnostic.mjs`, `scripts/auto-patch-jours-aberrants.mjs`
  - **Scripts audit one-shot Krousty** (diagnostic période avril 2025 → mai 2026) : `audit-4mois-precis.mjs`, `audit-ca-avril.mjs`, `audit-ca-popina-vs-strat.mjs`, `audit-coherence-globale.mjs`, `audit-formule-bug.mjs`, `audit-jours-residuels.mjs`, `audit-uber-4mois.mjs`, `audit-uber-officiel.mjs`
  - **Checks one-shot KS2/jours** : `check-avril-2026-ks2.mjs`, `check-jours-residuels-api.mjs`, `check-ks2-fantomes.mjs`, `explore-ks2.mjs`
- **Impact** : pas de bug fonctionnel — les features tournent en local, les scripts sont rejouables. Mais le repo accumule du travail non historisé, ce qui complique la lecture de l'historique git et le partage entre sessions Claude.
- **Pistes** :
  - Session dédiée "rangement git" pour trier en quelques commits propres : (1) feature `/recap`, (2) feature `/admin/audit`, (3) archives Phase 2 (peut-être dans un dossier `scripts/archives/` pour les sortir du bruit), (4) scripts audit Krousty.
  - Pour les sessions futures : convention de fin de session = au moins un commit local de tout ce qui a été produit, même brouillon.
- **Priorité** : V1.1 — pas urgent (rien ne casse), mais à faire avant que le bruit empêche `git status` de rester lisible.

---

## Historique

- **v1.0 (26 avril 2026)** : capture initiale du document de l'associée + retours Mounir de la session du 26 avril
- **v1.1 (3 mai 2026)** : ajouts post-cadrage initial. §27 à §31 (faux positifs IA, anomalies sémantiques, helper CA HT) ajoutés in-place fin avril/début mai 2026 sans bump de version. §32 (sessions antérieures non closes par commit) ajouté le 3 mai. Catégorie F créée le 3 mai pour regrouper les 13 irritants identifiés lors de la session de cadrage Phase A migration data layer (cf. `STRAT_ARCHITECTURE.md` v1.1 §Décision #5 et `PLANNING_V1.md` v1.2 §Sprint Migration data layer).
