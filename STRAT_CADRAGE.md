# Strat — Document de cadrage produit

_Version 1.7 — avril 2026_

Ce document fixe les décisions structurantes de Strat. Il sert de référence pour arbitrer les choix produit et techniques. En cas de doute sur une feature, un refactor ou une demande client, relire ce document **avant** de coder.

Documents liés :
- `STRAT_ARCHITECTURE.md` — décisions architecturales structurantes (NOUVEAU v1.7)
- `STRAT_IA.md` — stratégie IA détaillée
- `STRAT_IA_FEATURE1_PLAN.md` — plan d'implémentation Feature IA n°1
- `IRRITANTS_UX_V1.md` — capture des retours utilisateurs (NOUVEAU v1.7)

**Hiérarchie en cas de conflit** : `STRAT_CADRAGE.md` > `STRAT_ARCHITECTURE.md` > code (le produit dirige la technique).

---

## 1. Vision

Strat est un SaaS B2B pour restaurateurs indépendants. Il ne se contente pas d'afficher des chiffres : il **apprend au gérant à piloter son resto comme un professionnel**.

La promesse : en 2 minutes par jour, le gérant sait où il en est, ce qu'il doit faire, et progresse dans sa maîtrise du métier.

**Positionnement** : Strat est le coach digital du restaurateur indépendant. Pas un dashboard. Pas un reporting tool. Un outil qui éduque, conseille et fait grandir.

---

## 2. Les 3 piliers produit de Strat

Strat est construit autour de 3 piliers transversaux qui se renforcent mutuellement. Toute feature doit servir au moins un pilier — idéalement plusieurs.

### Pilier 1 — Strat pilote
Donner au gérant une vision claire et actionnable de son business au quotidien. Indicateurs, analyses, filtres, KPIs.

### Pilier 2 — Strat éduque
Faire progresser le gérant dans sa maîtrise du métier. Lui apprendre les bonnes pratiques, l'inciter à les adopter, expliquer les concepts comptables et métier.

**Manifestations concrètes** :
- Chaque indicateur est expliqué (qu'est-ce que c'est, comment il se calcule, pourquoi c'est important)
- Les bonnes pratiques sont activement proposées, pas cachées dans la doc
- Les fonctionnalités "avancées" (ex: inventaire) sont accompagnées de pédagogie
- Les objectifs et benchmarks aident à se situer et progresser
- Les notifications et briefs ont une dimension pédagogique ("astuce de la semaine")

**Principes** :
- Éduquer sans culpabiliser (l'outil n'est jamais moralisateur)
- Progressivité (on ne demande pas tout d'un coup à un débutant)
- Pertinence (on enseigne ce qui impacte vraiment le business, pas la théorie)

### Pilier 3 — Strat conseille
Mobiliser l'IA pour apporter un avis expert au gérant. Expliquer, alerter, recommander. Voir STRAT_IA.md.

---

## 3. Client type (persona)

- Restaurant indépendant, snack/fast-food/casual/pizzeria en France
- 1 à 3 points de vente
- CA entre 300 k€ et 2 M€
- Piloté par le gérant lui-même
- Utilisant Excel, un carnet, ou rien aujourd'hui
- **N'a pas forcément les bonnes pratiques de pilotage (Strat les lui apprend)**
- Maturité digitale variable

Hors cible V1 : chaînes 5+ points de vente, gastronomie étoilée, hors France, autres commerces.

---

## 4. Modèle data : pooled multi-tenant

Base Supabase unique, isolation par `parametre_id` + RLS. Modèle "base par client" rejeté.

**Architecture des sources de revenus (NOUVEAU v1.7)** : la décision archi #1 du 26 avril 2026 (cf. `STRAT_ARCHITECTURE.md`) introduit :
- Table `sources` (paramétrable par tenant) : Restaurant, Uber Eats, Deliveroo, etc.
- Table `ventes_par_source` (source de vérité unique) qui remplace `historique_ca.uber` et `entrees.source='uber_eats'`
- Suppression de `historique_ca` après migration

---

## 5. Architecture Canal / Paiement

**Axe 1 — Canal de vente** : Restaurant (1 source) ou Plateforme (N sources).
**Axe 2 — Mode de paiement** : Espèces, CB, TR, Autres (Restaurant uniquement).

Pas de distinction comptoir vs borne (reporté V2+).

---

## 6. Ce que le client paramètre

Sources, catégories custom, objectifs, jours d'ouverture, fournisseurs récurrents, fuseau horaire, commissions par source. Valeurs par défaut raisonnables pour resto snack FR.

---

## 6.5 Charges récurrentes (V1+)

Les charges fixes mensuelles d'un restaurant — loyer, redevance, expert-comptable, URSSAF, TVA à reverser, commissions plateformes, abonnements (caisse, internet, assurance, sécurité, musique, etc.) — sont **paramétrables par tenant** (montants, jours, fournisseurs) mais le mapping `nom de charge → catégorie P&L` reste **opiniâtre** (cf. §7 plan comptable FR figé).

**Trois profils de charges** distingués :
- **Fixe** (montant identique chaque mois) : ex. abonnement Free, Vérisure, SACEM. INSERT auto possible.
- **Variable récurrente** (montant change selon une formule ou contexte) : ex. URSSAF (% des paies), TVA (% du CA HT), commissions plateformes (% des ventes), loyer à paliers. Brouillon auto, validation gérant.
- **Sporadique** : achats fournisseurs (Metro, Transgourmet, etc.). Saisie manuelle, pas dans le scope charges récurrentes.

**V1 acompte** (mai 2026) : la page `/previsions` enrichie d'un bouton « Saisir » 1-clic par échéance, idempotent (pas de doublon si saisie déjà existante ce mois). Réduit la friction sans nécessiter de nouveau modèle data. Les `parametres.jour_loyer/jour_redevance/jour_honoraires/jour_urssaf/jour_declaration_tva` existants servent de base.

**V1.1** : automatisation complète via tables `charges_types` (catalogue partagé restauration FR seedé une fois) + `charges_recurrentes` (paramétrage par tenant) + `charges_suggestions` (file de propositions à valider) + cron mensuel multi-tenant `/api/cron/charges-recurrentes-mensuel`. L'onboarding (Phase 3 S8 PLANNING) intègre une étape dédiée avec catalogue pré-coché par type de restaurant. La page `/previsions` devient une vue de validation des INSERTs auto + suggestions.

**Garde-fou** : aucune génération automatique de transaction sans paramétrage explicite préalable du gérant. La détection auto (post-onboarding) propose, le gérant valide. Cohérent avec `STRAT_IA.md` §6 « L'IA recommande, le gérant décide » — appliqué aussi à la comptabilité automatisée déterministe.

**Cas particulier mono-tenant Krousty** : la masse salariale (catégorie `frais_personnel`) est traitée comme **agrégat catégoriel** plutôt que par fournisseur individuel, parce que la pratique de saisie a évolué (jusqu'à février 2026 : 1 ligne `Salaires` agrégée ; depuis mars 2026 : 16 lignes nominatives par employé). Le générateur de brouillon mensuel se base sur `SUM(frais_personnel) + SUM(autres_charges WHERE fournisseur IN (...gérants))` sur les 3 derniers mois (cf. IRRITANTS §F15). À documenter pour les futurs tenants : le détecteur multi-tenant doit gérer cette variation de pratique.

### 6.5.1 Glossaire terminologique (Lot 11 V1.1)

Termes officiels Strat — à respecter dans UI, doc, code et conversations IA :

- **Charge récurrente** — transaction attendue à intervalle régulier (mensuel/trimestriel/semestriel/annuel). Couvre les profils fixe et variable_recurrente. Stockée dans `charges_recurrentes`.
- **Charge fixe** — sous-type de charge récurrente où le montant est identique chaque période (ex: loyer à 2288 €/mois). Champ `profil = 'fixe'`.
- **Charge variable récurrente** — sous-type de charge récurrente où le montant est calculé ou estimé chaque période (ex: URSSAF = salaires × 42%, TVA = collectée − déductible). Champ `profil = 'variable_recurrente'`.
- **One-shot** — transaction non récurrente (achat ponctuel, sortie, dépannage). Non générée par le cron mensuel. Champ `profil = 'one_shot'` (présent pour permettre le filtrage UI mais hors scope auto-suggestion).
- **Suggestion** — proposition générée par le cron mensuel pour une charge récurrente, en attente de validation par le gérant. Stockée dans `charges_suggestions`. Validation = INSERT transaction réelle.
- **Candidat** — récurrence détectée par l'IA dans les transactions historiques (Lot 5 Layer 1 statistique + Lot 6 Layer 2 LLM Haiku enrichissement libellés), non encore convertie en charge récurrente. Stockée dans `recurrence_candidates`.

**À NE PAS confondre** :
- "Charge récurrente" (notion produit V1.1) ≠ "Frais fixes" UI du P&L (sous-section visuelle qui regroupe 6 catégories : `loyers_charges, honoraires, redevance_marque, prestations_operationnelles, frais_divers, autres_charges`).
- `lib/seuil-rentabilite.js:CATEGORIES_NON_CONSO` (12 catégories = tout sauf `consommations`, utilisé pour le seuil de rentabilité 30j) ≠ "Frais fixes" UI (6 catégories). L'ancien nom `CATEGORIES_CHARGES_FIXES` est gardé en alias rétro-compat mais à retirer V1.2.

---

## 7. Ce qui reste opiniâtre

Plan comptable FR (14 catégories), TVA FR (0, 5.5, 10, 20), modes de paiement, logique KPIs, modèle transactions (TTC→HT/TVA), français V1.

---

## 8. Charte terminologique

### Proscrits
Foxorder, TPA, MTD, YTD, Drill-down, KPI (UI), Dashboard (UI), Connecteur (UI), Caisse+Foxorder, Panier moyen, 1S/1M/6M/1A.

### Officiel

| Terme | Usage |
|---|---|
| Accueil | Page d'entrée |
| CA Restaurant / CA Plateformes | Ventilation canal |
| Ticket moyen | Montant moyen/commande |
| Food cost (coût matières) | Avec sous-titre |
| Seuil de rentabilité | Conservé |
| Détail | Remplace Drill-down |
| Analyses | Vues croisées |
| Indicateurs | Remplace KPIs (UI) |
| Inventaire | Saisie ponctuelle valeur stock |
| Aujourd'hui / Hier / Cette semaine / Ce mois / Cette année | Filtres calendaires |
| 30 derniers jours | Filtre glissant |

---

## 9. Stratégie de connexion des caisses

CSV universel + connecteurs natifs sur demande. V1 = Popina + CSV. Règle 3+ prospects pour nouveau connecteur.

---

## 10. Stratégie d'import CSV

Mapping intelligent : détection auto, suggestions, validation, mémorisation, templates. Architecture 3 couches (parser, mapper, importer).

---

## 11. Stratégie IA (voir STRAT_IA.md)

Positionnement "directeur financier dans la poche".

### 4 features V1
1. Explications de chiffres (priorité 1)
2. Inbox intelligente
3. Brief du lundi (avec dimension éducative : "astuce de la semaine")
4. Assistant conversationnel

### Architecture 4 couches : Détection / Contextualiseur (Haiku) / Raisonneur (Sonnet) / Mémoire

### Garde-fous non-négociables
"Je ne sais pas" possible, pas de chiffres inventés, confiance graduée, domaines exclus, seuils de données minimaux, pas de manipulation, traçabilité.

---

## 12. Analyses croisées

Sans vues croisées, retour forcé à Excel. Socle produit, pas option.

### 4 vues V1
Fournisseurs, Personnel, Catégories, Sources de revenus.

### Livraison progressive
- **V1** : tableaux simples, comparaison M / M-1 / moyenne 6 mois
- **V1.1** : graphes + export CSV
- **V1.2+** : export Excel, filtres avancés

### Combinaison IA
Icône ✨ sur chaque ligne → explication IA contextuelle.

---

## 13. Filtres de période et timezone

### 9 filtres V1

| Filtre | Période |
|---|---|
| Aujourd'hui | Journée en cours |
| Hier | Hier complet |
| Cette semaine | Lundi → maintenant (Week-to-Date) |
| Semaine dernière | Lundi → dimanche complets |
| Ce mois | 1er → maintenant (Month-to-Date) |
| Mois dernier | 1er → dernier jour complets |
| 30 derniers jours | Glissant |
| Cette année | 1er janvier → maintenant |
| Personnalisé | Sélecteur libre |

### Règles UX
Période réelle affichée en sous-titre discret ("21 - 24 avr · 4 jours"). Toggle comparaison optionnel. Logique de comparaison intelligente (même durée écoulée).

### Profils de filtres par page (NOUVEAU v1.7)

Suite au débat architectural du 26 avril 2026 (cf. `STRAT_ARCHITECTURE.md` Décision #2), les 9 filtres ne sont **pas tous affichés sur toutes les pages**. 3 profils sont définis selon la logique métier de la page :

| Profil | Pages | Filtres affichés |
|---|---|---|
| **pilotage** | Mon Business, Mix ventes, Analyses | 8 filtres (tous sauf Aujourd'hui) |
| **journal** | Journal | les 9 filtres |
| **comptable** | P&L | 7 filtres (tous sauf Aujourd'hui et Hier) |

**Cas particulier — Prévisions** : composant séparé `<HorizonFilter />` avec horizons futurs (Fin de semaine, Fin de mois, Fin d'année). Hors scope `<PeriodFilter />`.

**Discipline** : pas de configuration libre par page. Une nouvelle page doit s'inscrire dans un profil existant ou justifier la création d'un 4e (avec mise à jour de `STRAT_ARCHITECTURE.md`).

### Timezone
Toujours en fuseau du restaurant (défaut Europe/Paris, paramétrable). Lib centrale `lib/periods.js` avec `date-fns-tz`. **Décision #4 du 26 avril 2026** : timezone passée en argument explicite (lib pure, pas de wrapper).

---

## 14. Inventaire simple

### Contexte

Le food cost exact nécessite une variation de stock. Mais les gérants snack indés ne font pas d'inventaire aujourd'hui. **Strat doit les éduquer à cette pratique, sans les contraindre.**

### Approche : minimale et pédagogique

Pas de module d'inventaire détaillé par référence (usine à gaz, abandonnée dans le monde réel). À la place, une saisie simple : une valeur totale de stock à une date donnée.

### Table `inventaires`

```sql
create table inventaires (
  id uuid primary key default gen_random_uuid(),
  parametre_id uuid not null references parametres(id) on delete cascade,
  date date not null,
  valeur_totale numeric(10,2) not null,
  note text,
  created_at timestamptz default now(),
  unique(parametre_id, date)
);
```

### UI

**Bouton "Enregistrer un inventaire"** dans un écran dédié (Paramètres > Inventaires, ou une section dédiée dans Analyses). Formulaire minimaliste :
- Date de l'inventaire (défaut aujourd'hui)
- Valeur totale du stock (€)
- Note optionnelle

**Historique** visible : liste des inventaires précédents + évolution de la valeur stock.

### Logique food cost

**Par défaut** : `food_cost_estime = Achats matières / CA HT` (approximation actuelle).

**Quand deux inventaires encadrent une période** : `food_cost_exact = (Stock_debut + Achats - Stock_fin) / CA_HT` pour la période entre les deux inventaires.

**Affichage UI** :
- Sans inventaire : "Food cost estimé · basé sur tes achats" + lien "En savoir plus"
- Avec inventaires : "Food cost exact · basé sur inventaires du X et du Y"

### Dimension éducative (Pilier 2)

**Onboarding** : "Ton food cost est une estimation à partir de tes achats. Pour un chiffre exact, fais un inventaire de temps en temps. On t'explique quand et comment."

**Aide contextuelle** (bouton "?" à côté de food cost) :
- Qu'est-ce que le food cost ? Pourquoi c'est important ?
- Estimé vs exact : quelle différence concrète ?
- Comment faire un inventaire en 20 minutes ?
- Quelle fréquence est optimale (mensuelle minimum, hebdo pour les plus avancés) ?

**Rappel doux** : si aucun inventaire depuis 6+ semaines, notification légère "envisage un inventaire ce week-end". Jamais de culpabilisation.

**IA associée** : l'IA peut proposer des rappels contextuels ("ta marge semble fluctuer, un inventaire t'aiderait à y voir clair").

### Ce qui n'est PAS inclus

- Ventilation du stock par catégorie (viande, épicerie, boissons, emballages)
- Saisie par référence/produit
- Valorisation automatique au prix d'achat
- Alertes de rupture
- Gestion d'inventaire en temps réel

Tout ça est volontairement exclu. Si des clients demandent plus tard, on réévalue. En attendant, la feature minimale sert déjà à éduquer et à améliorer le calcul.

### Estimation dev
~3-4 heures total (table + API + UI + logique food cost + aide).

---

## 15. Scope V1

### Modèle économique
Premium unique à ~59€/mois, pas de Standard. Objectif : 10 premiers clients. Toutes les features accessibles aux clients V1.

### Features V1

**Core produit**
- Auth et multi-tenant
- Saisie dépenses/entrées via FAB (sources dynamiques)
- Journal des transactions
- Accueil avec indicateurs
- Détail CA avec toggle Tout/Restaurant/Plateformes
- Détails fréquentation, ticket moyen, food cost, seuil
- Écran Paramètres complet
- Onboarding nouveau restaurant (avec dimension pédagogique)
- Backoffice admin

**Data ingestion**
- Import CSV avec mapping intelligent
- Connecteur Popina natif

**Filtres (section 13)** — 9 filtres, comparaisons, timezone, **3 profils par page (NOUVEAU v1.7)**

**Analyses (section 12)** — 4 vues en tableau

**Inventaire simple (section 14)** — saisie minimale + food cost ajusté + pédagogie

**IA (section 11)** — 4 features

**Architecture (NOUVEAU v1.7)** — refactor structurant en 4 couches (Périodes, Sources, Calculs, Récup données). Cf. `STRAT_ARCHITECTURE.md`.

**Éducation transversale (pilier 2)** : présente dans toutes les features
- Aide contextuelle sur chaque indicateur (qu'est-ce que, comment, pourquoi)
- Brief du lundi avec "astuce de la semaine"
- Onboarding pédagogique (pas juste formulaire de config)
- Objectifs et benchmarks explicatifs

### Reporté après V1

**V1.1** : graphes sur analyses, export CSV, comparaisons IA améliorées

**V1.2+** : export Excel, filtres avancés, périodes custom

**V2** : connecteurs natifs autres que Popina, Popina multi-compte, users multiples, sub-canaux, export comptable, notifications push, import bancaire, IA prévisions/vocal/visuel/mémoire, tier Standard, périodes métier resto, inventaire détaillé par catégorie (si demande confirmée)

---

## 16. Règles "hardcodé vs paramétrable"

Test : **"Si deux clients sont en désaccord, est-ce que l'un a tort ?"**
- Oui → hardcodé
- Non → paramétrable

---

## 17. Anti-patterns

- Hardcoder une plateforme par nom
- Colonne par plateforme dans `historique_ca`
- Valeur métier sans fallback paramètres
- Requête Supabase sans filtre `parametre_id`
- Terme Mounir dans l'UI (Foxorder, TPA, Krousty)
- Mélanger canal et mode de paiement
- Feature "parce que Mounir en a besoin"
- Connecteur natif sans 3 prospects
- Questions techniques à l'utilisateur
- IA qui invente des chiffres
- IA sur domaines exclus
- IA sans "je ne sais pas"
- Mélanger détection (code) et rédaction (IA)
- Pas de vues d'analyse croisée
- Sur-concevoir V1 avant validation marché
- Filtres mélangeant glissant et calendaire
- Calculs de dates en UTC
- Comparaisons de périodes tailles différentes sans avertir
- **Exposer une feature avancée sans pédagogie** (ex: inventaire sans explication du pourquoi)
- **Culpabiliser l'utilisateur** qui ne suit pas les bonnes pratiques (Strat éduque, ne moralise pas)
- **Coder un module d'inventaire détaillé par référence** (validé hors scope V1 et V2 par défaut)
- **Confondre "ce que Mounir veut pour Krousty" et "ce que Strat doit être"** (relecture cadrage obligatoire)
- **Configurer librement les filtres page par page** (5 conventions différentes émergent — utiliser les 3 profils de `<PeriodFilter />`) [NOUVEAU v1.7]
- **Mélanger PeriodFilter et HorizonFilter** sur une même page (logique passé vs futur) [NOUVEAU v1.7]
- **Garder `historique_ca` en cohabitation avec `ventes_par_source`** (Option B rejetée le 26 avril 2026 — reproduit le pattern de bugs Uber Historique) [NOUVEAU v1.7]
- **Wrapper haut niveau systématique sur lib/periods.js** (la lib reste pure, le caller résout la timezone explicitement) [NOUVEAU v1.7]

---

## 18. Décisions en attente

- Auth : NextAuth ou migration ?
- Tarification finale : 49, 59, 69, 79 € ?
- Onboarding : self-service ou accompagné ?
- Import historique : manuel, CSV, ou rien ?
- Label source Restaurant : "Restaurant", "Salle", "Sur place" ?
- Liste 10 prochains prospects + caisses
- Email (Brief) : Resend, Postmark, autre ?
- Facturation : mensuel, annuel, les deux ?
- **Placement UI de la feature Inventaire** : Paramètres ? Analyses ? Section dédiée ?
- **Contenu pédagogique** : rédaction interne ou avec aide IA ?

### Tranchées en v1.7

- ~~Lib dates : `date-fns-tz` (reco) ou `luxon` ?~~ → tranché : `date-fns-tz` (cf. `STRAT_ARCHITECTURE.md` Décision #4)

---

## 19. Principes de décision

Ordre d'application pour toute nouvelle feature :

1. **Persona** (section 3) : sert le client type ?
2. **Piliers** (section 2) : sert au moins un des 3 piliers ?
3. **Opinion produit** (sections 5, 7) : respecte l'opiniâtreté ?
4. **Hardcodé/paramétrable** (section 16) : où doit vivre cette valeur ?
5. **Dette multi-tenant** : introduit du hardcoding Mounir ?
6. **Scope V1** : nécessaire ou peut attendre ?
7. **Pilier Éduque** : la feature inclut-elle de la pédagogie si elle est avancée ?
8. **Intégration caisse** : règle 3+ prospects
9. **Feature IA** : respecte garde-fous
10. **Analyse** : nouvelle vue ou vue existante + filtre ?
11. **Filtre période** : logique claire, sans mélange
12. **Timezone** : toujours fuseau du restaurant
13. **Architecture** : alignée avec les 4 décisions de `STRAT_ARCHITECTURE.md` ? [NOUVEAU v1.7]

---

## 20. Historique

- **v1.0** : cadrage initial
- **v1.1** : Canal/Paiement, charte, hardcodé/paramétrable, suppression Foxorder/TPA
- **v1.2** : connecteurs (CSV + natifs sur demande), mapping intelligent
- **v1.3** : stratégie IA (4 features, architecture, garde-fous)
- **v1.4** : analyses croisées (4 vues), Premium unique au lancement
- **v1.5** : filtres de période (9 filtres, comparaisons, timezone)
- **v1.6** : 3 piliers produit (Pilote / Éduque / Conseille), feature Inventaire simple, dimension éducative transversale
- **v1.7 (26 avril 2026)** : décisions architecturales structurantes — création de `STRAT_ARCHITECTURE.md` (suppression `historique_ca`, 3 profils PeriodFilter, ordre roadmap archi, timezone par injection). Création de `IRRITANTS_UX_V1.md`. Mise à jour anti-patterns. Suppression d'une décision en attente (`date-fns-tz` tranchée).

---

_Document vivant. Toute modification structurelle passe par une mise à jour de ce fichier avant implémentation._
