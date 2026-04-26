# Strat — TODO avant Semaine 1 du sprint archi

_Créé le 26 avril 2026, fin de session débat archi_

Ce fichier capture les **5 critiques pertinentes** émises par Claude Code lors de la relecture des documents (`STRAT_ARCHITECTURE.md`, `STRAT_CADRAGE.md` v1.7, `PLANNING_V1.md` v1.1, `IRRITANTS_UX_V1.md`).

À traiter **avant ou au début de la Semaine 1** (lundi 28 avril 2026 ou la semaine où le sprint archi démarrera).

Une fois traités, **supprimer ce fichier** ou le marquer comme archivé.

---

## 1. Corriger les "sera" → "a été" dans STRAT_ARCHITECTURE.md §4

**Problème** : la section 4 (Liens avec les autres documents) écrit au futur ("§13 sera mis à jour", "§17 sera enrichi", "Phase 1 sera réécrite") alors que ces modifications sont **déjà faites** dans STRAT_CADRAGE.md v1.7 et PLANNING_V1.md v1.1.

**Action** : passer ces 3 phrases au passé composé ("§13 a été mis à jour", etc.).

**Effort** : 5 min

**Priorité** : faible (cosmétique, mais perd en fidélité narrative)

---

## 2. Ajouter le garde-fou "Tests obligatoires" dans STRAT_ARCHITECTURE.md §3

**Problème identifié par Claude Code** : la pureté de `lib/periods/` et `lib/calculs/` ne paie que si elle est exploitée. Sans tests Vitest, on a juste de la duplication factorisée. Aujourd'hui les tests sont mentionnés dans le PLANNING (tâche), pas dans l'ARCHITECTURE (principe).

**Action** : ajouter dans STRAT_ARCHITECTURE.md §3 (Synthèse) ou en nouvelle section dédiée :

> ### Principe — Tests obligatoires sur les fonctions pures
>
> Toute fonction pure dans `lib/periods/` ou `lib/calculs/` doit être livrée avec ses tests Vitest. Une fonction pure sans tests est équivalente à du code dupliqué : sans contrat vérifiable, la pureté n'apporte pas plus de garanties qu'un copier-coller.
>
> Cas d'application :
> - Tous les filtres de `lib/periods.js` (les 9 filtres + `periodePrecedenteAEgaleDuree`)
> - Tous les calculs de `lib/calculs/*` (calculerCA, calculerFoodCost, calculerEBE, etc.)
> - Bordures critiques : DST mars/octobre, années bissextiles, périodes vides, divisions par zéro

**Effort** : 10 min

**Priorité** : moyenne (garde-fou structurel, à inscrire avant que l'équipe grossisse)

---

## 3. Ajuster les estimations dans PLANNING_V1.md Phase 1

### 3.1 — Apprentissage `date-fns-tz` chiffré séparément

**Problème** : Mounir n'a jamais utilisé `date-fns-tz`. Concepts UTC vs zoned, format `formatInTimeZone`, gestion DST — minimum 1-2h pour s'imprégner avant de coder. Aujourd'hui dilué dans le bloc 8h "Lundi-Mardi".

**Action** : ajouter dans le PLANNING :

> Lundi matin (avant tout code) : 1-2h pour s'imprégner de `date-fns-tz` (concepts, doc officielle, exemples DST). Le reste du bloc Lundi-Mardi (6-7h) pour coder la lib.

**Effort** : 5 min de mise à jour du planning

### 3.2 — `<PeriodFilter />` rééstimé à 8-10h

**Problème** : 4h pour le composant React, OK. Mais l'intégration sur 5 pages (Mon Business, Mix ventes, Analyses, Journal, P&L) + composant séparé `<HorizonFilter />` pour Prévisions n'est pas chiffrée. Réaliste : 8-10h.

**Action** : reformuler le bloc Mercredi en :

> Mercredi-jeudi matin (8-10h) : composant `<PeriodFilter />` à 3 profils + intégration sur les 5 pages + composant `<HorizonFilter />` pour Prévisions.

**Effort** : 5 min

### 3.3 — Bug DST cron chiffré séparément

**Problème** : mentionné comme corollaire de la lib periods, mais pas chiffré séparément. Toucher au cron en prod implique tests + déploiement coordonné. Réaliste : 2-3h additionnelles.

**Action** : ajouter une ligne explicite dans le PLANNING :

> Jeudi après-midi (2-3h) : fix bug DST cron `(getUTCHours() + 2) % 24` en utilisant `lib/periods.js` ou `date-fns-tz` directement. Tester sur date de changement d'heure (mars/octobre).

**Effort** : 5 min

**Priorité** : moyenne (impacte la charge S1 effective)

---

## 4. Anticiper le double-refactor Calculs/Sources en S2-3 [CRITIQUE LE PLUS IMPORTANT]

**Problème identifié par Claude Code** :

> Si on extrait `calculerCA()` depuis le code actuel pendant que Sources se met en place, la fonction manipulera `historique_ca.uber` + `entrees.source='uber_eats'`. Une fois Sources livré, elle devra être réécrite pour `ventes_par_source`. Double-travail garanti.

**Action** : ajouter dans le PLANNING_V1.md une **règle d'ordre intelligent pour S2-3** :

> ### Garde-fou S2-3 — Ordre intelligent Calculs/Sources
>
> Pour éviter le double-refactor, l'ordre des extractions de calculs doit être :
>
> **Phase A (peut commencer en parallèle de Sources)** :
> - `calculerFoodCost` (depuis transactions, pas Sources)
> - `calculerEBE` (depuis transactions, pas Sources)
> - `calculerCharges par catégorie` (depuis transactions, pas Sources)
> - `calculerTicketMoyen` (peut attendre Sources OU être codé en utilisant l'ancienne API)
>
> **Phase B (APRÈS la migration Sources)** :
> - `calculerCA` brut/HT (consomme `ventes_par_source`)
> - `calculerCAParCanal` (consomme `ventes_par_source`)
> - `calculerCommissions` (consomme `ventes_par_source` + `parametres`)
>
> Cette séquence évite de réécrire les calculs CA deux fois.

**Effort** : 10 min de mise à jour du planning

**Priorité** : **HAUTE** — risque de double-travail concret si non anticipé

---

## 5. Détails cutover dans PLANNING S2-3

**Problèmes identifiés par Claude Code** :

### 5.1 — Backfill idempotent non testé
Le PLANNING dit "Backfill idempotent" mais aucune mention de dry-run ni de test sur copie de prod. Si on rate la migration et qu'on rejoue, doublons garantis.

**Action** : ajouter une étape "dry-run sur copie de prod" avant la vraie migration.

### 5.2 — Cutover du cron pas détaillé
Stratégie dual-write puis cutover mentionnée mais pas cadrée. Question critique : pendant combien de temps le cron écrit-il dans les 2 modèles ? 1 jour ? 1 semaine ?

**Action** : trancher la durée de dual-write (proposition : 3 jours minimum pour vérifier que `ventes_par_source` se remplit correctement et que les agrégats matchent `historique_ca`).

### 5.3 — `/admin/donnees` ouvert pendant la migration
Si Mounir édite `historique_ca` pendant que `ventes_par_source` se remplit, divergences silencieuses.

**Action** : mode "lecture seule" pour `/admin/donnees` pendant la fenêtre de migration (afficher un bandeau "Migration en cours, édition désactivée temporairement").

**Effort** : 15 min de mise à jour du planning pour ajouter ces 3 garde-fous

**Priorité** : moyenne (à traiter pendant le DESIGN Sources en S1, pas dans S2)

---

## Synthèse

| # | Sujet | Priorité | Effort | Quand |
|---|---|---|---|---|
| 1 | Corriger "sera" → "a été" | Faible | 5 min | Lundi matin S1 |
| 2 | Ajouter garde-fou Tests dans ARCHITECTURE | Moyenne | 10 min | Lundi matin S1 |
| 3.1 | Chiffrer apprentissage date-fns-tz | Moyenne | 5 min | Lundi matin S1 |
| 3.2 | `<PeriodFilter />` 8-10h au lieu de 4h | Moyenne | 5 min | Lundi matin S1 |
| 3.3 | Bug DST cron chiffré séparément | Moyenne | 5 min | Lundi matin S1 |
| 4 | **Ordre intelligent Calculs/Sources** | **HAUTE** | 10 min | Lundi matin S1 |
| 5 | Détails cutover (dry-run, durée dual-write, /admin readonly) | Moyenne | 15 min | Pendant DESIGN Sources jeudi-vendredi S1 |

**Total effort à traiter avant ou au début de S1** : ~55 min

---

## Critiques de Claude Code écartées (pour mémoire)

### Inverser le défaut S1 (séquentiel par défaut au lieu de parallèle)

**Sa proposition** : option par défaut séquentielle (Périodes seul), avec "si fin S1 en avance → attaque design Sources".

**Notre décision** : on garde la Décision #3 telle quelle (parallèle dès le début), avec un point de bascule explicite : si après lundi-mardi (lib/periods.js) Mounir sent qu'il a déjà mangé son crédit d'apprentissage, le design Sources peut être mis en pause.

**Justification** : la Décision #3 a été tranchée explicitement après débat. Inverser le défaut serait un revirement non justifié. Le garde-fou existe déjà ("bilan obligatoire vendredi" dans PLANNING).

### Rigidité des 3 profils PeriodFilter (V2 risk)

**Sa proposition** : si une page hybride apparaît, la discipline "justifier la création d'un 4e profil" risque de se faire en silence.

**Notre décision** : pas urgent V1. À surveiller V2 quand on aura plus de pages.

---

_Une fois les 5 actions traitées, supprimer ce fichier ou le déplacer dans un dossier `archive/` au commit qui les ferme._
