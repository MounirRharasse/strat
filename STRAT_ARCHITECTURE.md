# Strat — Architecture Cible

_Version 1.0 — 26 avril 2026_

Ce document fige les décisions architecturales structurantes prises lors du débat à 3 voix (Mounir, Claude conversationnel, Claude Code) du 26 avril 2026. Il sert de **référence absolue** pour le code des 4-5 prochaines semaines de refactor.

Documents liés :
- `STRAT_CADRAGE.md` — décisions produit (vision, persona, scope)
- `PLANNING_V1.md` — plan d'exécution séquencé
- `STRAT_IA.md` — stratégie IA (architecture en 4 couches)
- `IRRITANTS_UX_V1.md` — retours utilisateur capturés

**En cas de contradiction** : `STRAT_ARCHITECTURE.md` prime sur le code, mais `STRAT_CADRAGE.md` prime sur `STRAT_ARCHITECTURE.md` (le produit dirige la technique).

---

## 1. Contexte de la décision

Le 26 avril 2026, Strat est en V1 mono-tenant (Krousty Sabaidi Montpellier Castelnau). L'app a été codée autour de l'histoire de Mounir (import legacy de données Krousty + cron Popina + saisie manuelle Uber via FAB). Cette histoire produit une dette structurelle qui empêche d'accueillir un nouveau client proprement.

**Constat utilisateur de Mounir** : "L'app pense pour Mounir, pas pour tout le monde."

**Diagnostic** (cf. audit du 26 avril) :

- **Modèle de données "3 sources Uber"** : `historique_ca.uber` (legacy import) + `entrees.source='uber_eats'` (FAB) + données manquantes pour les jours non saisis. Cohabitation fragile.
- **Calculs métier dupliqués 4×** entre les pages (dashboard, pl, previsions, api/analyses). Bug Uber Historique (`/api/analyses:84`) découvert exactement à cause de cette duplication — une formule diverge sans que personne ne le voie.
- **Aucune `lib/periods.js`** : 100% des calculs de date sont en UTC brut, inline dans chaque page. Pas de gestion timezone, vocabulaire UI proscrit (MTD, YTD, 1S, 1M, 6M, 1A) toujours présent.
- **Aucune centralisation des helpers Supabase** : chaque page fait son `from('table').gte().lte()`.

L'objectif des 4 décisions ci-dessous : poser la fondation d'une app **générique** (10+ clients possibles) sans sur-concevoir pour 1000.

---

## 2. Décisions architecturales

### Décision #1 — Suppression de `historique_ca` au profit de `ventes_par_source`

> **RÉVISÉE v1.1 — 3 mai 2026** : schéma cible enrichi (3 tables, RLS, slug, integration_config, commissions, fusion `tpa`). Stratégie d'exécution figée par la **Décision #5** (option β : dual-write depuis sources amont).

**Décision** : `historique_ca` sera supprimée après migration. Trois tables cibles forment la nouvelle source de vérité : `sources` (catalogue par tenant), `ventes_par_source` (faits journaliers par canal), `paiements_caisse` (ventilation des modes de paiement de la caisse, axe orthogonal au canal cf. `STRAT_CADRAGE.md` §5).

**Modèle cible** :

```sql
-- Catalogue des sources de revenus (paramétrable par tenant)
CREATE TABLE sources (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id       uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  nom                text NOT NULL,                    -- "Restaurant", "Uber Eats"...
  slug               text,                             -- 'popina', 'uber_eats'...
  type               text NOT NULL CHECK (type IN ('caisse','plateforme')),
  actif              boolean NOT NULL DEFAULT true,
  integration_config jsonb,                            -- credentials, mappings, etc.
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parametre_id, nom),
  UNIQUE (parametre_id, slug)
);

-- Faits journaliers : 1 ligne par (jour × source)
CREATE TABLE ventes_par_source (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id    uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  date            date NOT NULL,
  source_id       uuid NOT NULL REFERENCES sources(id),
  montant_ttc     numeric(10,2) NOT NULL,
  montant_ht      numeric(10,2),
  nb_commandes    integer,
  commission_ttc  numeric(10,2),
  commission_ht   numeric(10,2),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parametre_id, date, source_id)
);
CREATE INDEX idx_vps_param_date ON ventes_par_source (parametre_id, date);

-- Ventilation des modes de paiement (Restaurant uniquement, axe orthogonal)
CREATE TABLE paiements_caisse (
  parametre_id  uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  date          date NOT NULL,
  especes       numeric(10,2),
  cb            numeric(10,2),
  tr            numeric(10,2),
  PRIMARY KEY (parametre_id, date)
);
```

**RLS** : activée sur les 3 tables avec policies filtrant par `parametre_id` du user courant (cf. CLAUDE.md §3.1 multi-tenant pooled).

**Conventions** :
- **Modes de paiement opiniâtres** en V1 : 3 colonnes `especes` / `cb` / `tr` dans `paiements_caisse`. Item dette : migrer en EAV (catalogue + table N lignes/jour) si un client réel demande des modes étendus.
- **Convention timestamp** : `created_at` (anglais), cohérent avec `historique_ca` legacy et avec la convention dominante des 13 tables actuelles. Seule exception observée : `parametres.date_creation` qui coexiste avec `parametres.created_at` — à investiguer en Phase B/C.
- **`tpa` Krousty** : la borne self-order (`historique_ca.tpa`) est techniquement du paiement CB et constitue une scorie spécifique mono-tenant qui ne se propage pas en V2. Au backfill historique, `tpa` est fusionné dans `paiements_caisse.cb`. La distinction est perdue post-cutover, reconstituable via `historique_ca` legacy jusqu'au drop en Phase C.

**Toutes les agrégations journalières** (courbes, dashboard, /api/analyses) se feront à la volée par `GROUP BY date` sur `ventes_par_source`, avec jointure `paiements_caisse` pour la ventilation Restaurant.

**Justification** :
- ✅ Une seule source de vérité = pas de bugs de désynchronisation
- ✅ Modèle simple à expliquer à un nouveau dev (30 secondes)
- ✅ Le bug Uber Historique qu'on vient de découvrir est exactement le pattern que la cohabitation `historique_ca` + `ventes_par_source` aurait perpétué
- ✅ Performance OK : un `GROUP BY` sur 1500 lignes = ~50-80ms (mesuré conceptuellement par Claude Code). Seuil problématique vers 10M lignes (V1 = ~180k lignes pour 10 tenants × 1 an, marge x50)
- ✅ Axe canal × axe paiement stockés séparément (conforme `STRAT_CADRAGE.md` §5)

**Coût migration** : 15-20h dev one-shot, ~7-8 fichiers à toucher (4 pages serveur + 2 routes API + cron + 2 admin). Migration disruptive — stratégie d'exécution détaillée en **Décision #5**.

**Réversibilité** : si problème, A → B (réintroduire un cache `historique_ca`) faisable en ~1 jour.

**Options écartées** :
- **Option B** (cohabitation `historique_ca` + `ventes_par_source` synchronisées par trigger) : rejetée parce que reproduit exactement le pattern de duplication qui a produit le bug Uber Historique. Le gain perf est marginal (~30ms imperceptibles utilisateur) et non mesuré.
- **Option C** (vue Postgres lecture seule) : intéressante mais 80% du coût de migration reste là (les écritures doivent toutes migrer vers `ventes_par_source` quand même), perpétue le schéma legacy, et sa latence dégrade avec le volume.
- **Option vue compat + INSTEAD OF triggers** (envisagée mai 2026) : rejetée au profit de la stratégie strangler de la Décision #5, parce que la sémantique de `historique_ca.ca_brut` n'est pas stable dans le repo actuel — la vue compat aurait imposé de figer une sémantique arbitraire qu'on n'a pas les moyens de valider.

---

### Décision #2 — Composant `<PeriodFilter />` à 3 profils

**Décision** : Le composant `<PeriodFilter />` prend une prop `profil` qui détermine les filtres affichés. 3 profils définis, déduits de la matrice page × filtre construite ensemble.

#### Profil "pilotage"
**Pages** : Mon Business, Mix ventes, Analyses
**Filtres affichés** :
- Hier
- Cette semaine
- Semaine dernière
- Ce mois
- Mois dernier
- 30 derniers jours (en BOF — utile mais pas indispensable)
- Cette année
- Personnalisé

**Filtre exclu** : Aujourd'hui (la journée n'est pas finie, les chiffres bougent encore — pas de comparaison possible)

#### Profil "journal"
**Pages** : Journal uniquement
**Filtres affichés** : les 9 (Aujourd'hui, Hier, Cette semaine, Semaine dernière, Ce mois, Mois dernier, 30 derniers jours, Cette année, Personnalisé)
**Justification** : page de consultation libre, l'utilisateur peut vouloir scroller n'importe quelle période passée.

#### Profil "comptable"
**Pages** : P&L uniquement
**Filtres affichés** :
- Cette semaine
- Semaine dernière
- Ce mois
- Mois dernier
- 30 derniers jours
- Cette année
- Personnalisé

**Filtres exclus** : Aujourd'hui et Hier (un P&L sur 24h n'a aucun sens comptable)

#### Cas particulier — Prévisions
**Composant séparé** : `<HorizonFilter />` avec ses propres options :
- Fin de semaine
- Fin de mois
- Fin d'année

**Justification** : Prévisions est une page tournée vers le **futur** (projections), conceptuellement différente des autres pages (qui regardent le passé). Forcer Prévisions dans `<PeriodFilter />` mélangerait 2 concepts.

#### Discipline produit
- Pas de configuration "page par page" libre (qui dégénère vers 5 conventions différentes — situation actuelle observée)
- Pas de prop `filtres={[...]}` arbitraire — uniquement la prop `profil`
- Si une nouvelle page arrive, elle doit s'inscrire dans un profil existant (ou justifier la création d'un 4e)

**Méthode** : matrice page × filtre construite en interrogeant chaque cas. Les profils ont émergé de la logique métier, pas d'une décision a priori.

**Options écartées** :
- **Option A** (configurable au cas par cas) : rejetée parce que reproduit la situation actuelle (5 conventions différentes sur 5 pages). Un faux confort qui dégénère.
- **Option B** (les 9 filtres partout, sans configuration) : rejetée parce que dogmatique — ignore la logique métier (un P&L sur "Hier" est absurde).

---

### Décision #3 — Ordre global de la roadmap archi

**Décision** : Suivre cet ordre :

```
Semaine 1 :
  - CODE Périodes (lib/periods.js + composant <PeriodFilter />)
  - DESIGN Sources en parallèle (schéma SQL, modèle conceptuel, validation)

Semaines 2-3 :
  - CODE Sources (création table sources + ventes_par_source, backfill, migration des écritures)
  - CODE Calculs (extraction depuis pl/page.js vers lib/calculs/)

Semaine 4 :
  - CODE Récupération données (lib/data/transactions.js, /ventes.js, etc.)
```

**Total estimé** : 4 semaines (vs 5 dans la proposition séquentielle pure de Claude Code).

**Justification** :
- Sources est le sujet **central** qui résout le constat "l'app pense pour Mounir". La pousser en S4-5 = retarder 5 semaines la résolution.
- Le **design** Sources (schéma SQL sur papier, validation) ne disrupte rien et peut se faire en parallèle du code Périodes.
- Quand Périodes est fini (S1), Sources est prêt à être codé (S2-3).

**Risque accepté** : dispersion possible entre 2 sujets en S1. Si Mounir sent qu'il se disperse, il peut **stopper le design Sources** et revenir à un séquentiel pur. La décision n'est pas irréversible.

**Garde-fous** :
- En S1, "design" = schéma SQL sur papier + validation, **pas** de code applicatif
- Si Périodes prend plus que prévu en S1, prioriser Périodes (Sources peut décaler en S3-4)
- Bilan obligatoire en fin de S1 pour décider si on continue parallèle ou si on séquentielle

**Options écartées** :
- **Option Claude Code** (Sources en S4-5) : rejetée parce que repousse de 5 semaines la résolution du problème central
- **Option Planning V1 original** (Sources direct en S1, sans Périodes) : rejetée parce que sans Périodes, on ne peut pas faire de comparaisons cohérentes

---

### Décision #4 — Timezone par injection pure

**Décision** : Les fonctions de `lib/periods.js` reçoivent la timezone en argument. Pas de wrapper haut niveau côté serveur.

**Pattern** :

```js
// Lib pure : fonctions sans I/O caché
import { getCetteSemaine, getCeMois, periodePrecedenteAEgaleDuree } from 'lib/periods'

// Usage type dans une page serveur :
const parametre_id = await getParametreIdFromRequest(request)
const { timezone } = await getParametresFor(parametre_id)
const periode = getCetteSemaine({ timezone })
```

**Justification** :
- ✅ Pureté de la lib (testable sans mock)
- ✅ Pas de magie cachée (le caller voit explicitement où la timezone vient)
- ✅ Pas de dépendance lib → DB (un test Vitest peut tester avec n'importe quelle timezone)

**Coût accepté** : 2 calls par page (résoudre timezone + appeler la fonction période) au lieu d'1. Plomberie acceptable pour V1.

**Évolution future** : Si la verbosité devient gênante avec 10+ tenants, on pourra ajouter un helper générique côté serveur :
```js
const periode = await getPeriodForCurrentUser('cette-semaine')
```
Sans casser la lib pure existante.

**Options écartées** :
- **Option A** (lecture DB à chaque appel) : rejetée parce que N requêtes DB par page (1 par filtre)
- **Option C** (Context React + getter serveur) : rejetée parce que 2 mécanismes en parallèle à maintenir
- **Wrapper haut niveau systématique** (proposé par Claude conversationnel) : rejeté parce que double la surface de code (1 fonction pure + 1 wrapper par filtre = 18 fonctions au lieu de 9)

---

### Décision #5 — Stratégie d'exécution de la migration #1 (option β : dual-write depuis sources amont)

> **Ajoutée v1.1 — 3 mai 2026** suite au cadrage Phase A migration data layer.

**Décision** : la nouvelle table `ventes_par_source` est alimentée en dual-write **depuis les sources amont** (API Popina, Excel KS2 pour le backfill historique, Uber pour la suite), **pas depuis `historique_ca`**. La table legacy continue d'être écrite en parallèle pendant la fenêtre de dual-write par le cron existant, jusqu'au cutover des lectures. Stratégie « strangler » : on construit la nouvelle source à côté, on bascule les lectures, on supprime l'ancienne.

**Justification** :
- ✅ La sémantique de `historique_ca.ca_brut` n'est pas stable dans le repo (3 chemins d'écriture avec 3 sémantiques différentes : cron Popina, import CSV admin, scripts archives). Confirmation empirique sur 15 jours consécutifs (01/01 → 15/01/2025) : 13 jours ont `ca_brut = caisse + uber`, 2 jours ont `ca_brut = caisse seule`, sans pattern temporel.
- ✅ Hériter de cette sémantique instable pour `ventes_par_source` reproduirait dans la nouvelle table le bug que la migration cherche précisément à éliminer.
- ✅ Pendant le dual-write, dashboard et P&L lisent encore `historique_ca` et restent dans l'état actuel — déjà considéré comme buggé (cf. `IRRITANTS_UX_V1.md` §30). Le statu quo n'est pas dégradé.
- ✅ Au cutover, les lectures basculent sur `ventes_par_source` (sémantique propre) et les chiffres se réalignent.

**Sources amont par période** :
- **2024-04-18 → 2025-01-15 inclus** : import depuis `KS2.xlsx` (fichier personnel Mounir, onglets `Data_CA_N-2` et `Data_CA_N-1`). Source unique pour cette période.
- **2025-01-16 → aujourd'hui** : import depuis l'API Popina (`getAllReports`). Source unique pour cette période.

**Justification de la frontière au 15/01/2025** :
- Rétention effective de l'API Popina vérifiée par recherche dichotomique (cf. `scripts/test-retention-popina.mjs` et `scripts/test-retention-popina-frontiere.mjs`) : démarre au 14/01/2025 (frontière nette à la journée).
- Le 14/01/2025 est incomplet côté API : 484,19 € retournés vs 1 159,35 € de caisse réelle KS2 (~58 % manquant), probablement dû à l'installation de la caisse en cours de journée.
- Le 15/01/2025 est utilisé comme jour tampon par sécurité.
- Date d'ouverture Krousty confirmée : 2024-04-18.

**Données NULL acceptées sur la période d'import KS2** :
- `montant_ht` : NULL (KS2 stocke en TTC seul). Calcul à la lecture avec TVA 10 % par défaut. Item dette : raffiner si produits multi-taux apparaissent.
- `nb_commandes` : NULL (non tracké avant 01/06/2025).
- `commission_ttc` / `commission_ht` Uber : NULL (non disponibles dans KS2).

**Devenir de la table `entrees`** : suppression en Phase C selon une séquence stricte :
1. Backfill des 17 lignes Uber actuelles (`source='uber_eats'`) dans `ventes_par_source`.
2. Migration du composant FAB pour qu'il écrive directement dans `ventes_par_source`.
3. `DROP TABLE entrees`.

L'ordre 1 → 2 → 3 est strict :
- Migrer FAB avant le backfill des 17 lignes existantes ferait perdre ces saisies utilisateur (FAB n'écrit plus dans `entrees`, et les 17 lignes n'auraient pas encore été copiées dans `ventes_par_source`).
- Dropper `entrees` avant la migration de FAB casserait FAB en prod.

**Idempotence import** : `ON CONFLICT (parametre_id, date, source_id) DO UPDATE` sur `ventes_par_source`. Sur la période d'import KS2, le fichier Excel est la **source de vérité** : toute correction passe par modification dans Excel puis import rejoué, **pas en BDD directement** (sinon écrasée au prochain run).

**Critère de convergence Phase A — révisé** (deux niveaux) :
- **Test d'intégration** : convergence `ventes_par_source` vs API Popina sur le mois courant. Vérifie que la chaîne de transformation (parsing Popina → classification → agrégation par jour → écriture BDD avec RLS) n'a pas introduit de régression. Convergence attendue à l'euro près sur les jours pleins.
- **Test sémantique externe** : convergence `ventes_par_source` vs exports Popina mensuels manuels (`jalia_export_accounting_8610_*.xlsx`, fichiers déjà utilisés par `scripts/auto-patch-jours-aberrants.mjs`) sur 2-3 mois récents. Référence indépendante de l'API utilisée à l'écriture, valide que les chiffres remontés sont conformes à la vérité comptable Popina.
- **Audit visuel post-cutover** : 5-10 dates échantillon (1 par mois sur les 6 derniers mois) pour détecter toute régression macro côté dashboard et P&L.

L'engagement initial (« vérifier convergence dual-write vs `historique_ca` legacy sur 5-10 dates ») est invalide, on ne peut pas converger vers une cible dont la sémantique n'est pas stable. Il est remplacé par les trois critères ci-dessus.

**Cutover — saut visuel attendu** : au moment de la bascule des lectures, dashboard et P&L vont changer brutalement (passage de la sémantique pourrie `historique_ca` à la sémantique propre `ventes_par_source`). Le changement est attendu et bénin. Prévoir un audit visuel avant/après sur les chiffres clés et une note dans le changelog pour Mounir.

**Risque accepté** : pendant la fenêtre de dual-write (cible 2-3 semaines), Mounir continue de voir des chiffres legacy partiellement faux sur dashboard et P&L. Cette dégradation perçue n'en est pas une (statu quo) mais doit être communiquée pour éviter la confusion.

**Options écartées** :
- **Option α** (stabiliser `historique_ca.ca_brut` AVANT Phase A) : rejetée parce qu'elle suppose qu'on peut trancher rétroactivement la sémantique pour les rows historiques où la source amont n'est plus accessible — ce qui revient à inventer des chiffres ou à figer un bug en place dans une table censée disparaître.
- **Option γ** (accepter l'imperfection, faire Phase A depuis `historique_ca` malgré l'instabilité) : rejetée parce que `ventes_par_source` naîtrait avec la dette qu'on cherche à éliminer (cf. Décision #1), et le nettoyage Phase B nécessiterait un re-backfill complet depuis l'API Popina — c'est-à-dire le travail de β reporté de quelques semaines.
- **Option vue compat + INSTEAD OF triggers** : voir Décision #1.

---

## 3. Principe transversal — Tests obligatoires sur les fonctions pures

Toute fonction pure dans `lib/periods/` ou `lib/calculs/` doit être livrée avec ses tests Vitest. Une fonction pure sans tests est équivalente à du code dupliqué : sans contrat vérifiable, la pureté n'apporte pas plus de garanties qu'un copier-coller.

Cas d'application :
- Tous les filtres de `lib/periods.js` (les 9 filtres + `periodePrecedenteAEgaleDuree`)
- Tous les calculs de `lib/calculs/*` (calculerCA, calculerFoodCost, calculerEBE, etc.)
- Bordures critiques à tester systématiquement : DST mars/octobre, années bissextiles, périodes vides, divisions par zéro

Sans ce principe, l'investissement architectural perd sa valeur principale (la non-régression).

---

## 4. Synthèse — comment naviguer ce document

Si tu lis ce document dans 3 mois et que tu hésites sur une décision technique :

1. **D'abord relire les 4 décisions** ci-dessus — elles répondent probablement à 80% des questions
2. **Ensuite relire la justification** (pas juste la décision) — comprendre POURQUOI on a décidé ainsi évite de dévier sur un caprice
3. **Enfin relire les options écartées** — éviter de réinventer une option déjà débattue

Si tu sens qu'une décision ne tient plus (par exemple : perf inattendue, retour utilisateur fort) — **mets à jour ce document** avec une nouvelle version. Ne contourne pas en silence dans le code.

---

## 5. Liens avec les autres documents

### Avec STRAT_CADRAGE.md
- §13 (filtres) — mis à jour en v1.7 pour acter les 3 profils
- §14 (Inventaire) — pas impacté
- §17 (anti-patterns) — enrichi en v1.7 avec 4 nouveaux anti-patterns liés aux décisions ci-dessus

### Avec PLANNING_V1.md
- Phase 1 Semaines 1-4 — entièrement réécrite en v1.1 selon le nouvel ordre archi (S1 Périodes + design Sources, S2-3 Code Sources + Calculs, S4 Récup données)

### Avec STRAT_IA.md
- Architecture IA en 4 couches — entièrement compatible avec ces 4 décisions, vit en parallèle (lib/ai/, ia_signaux, etc.). Aucune contradiction.

### Avec IRRITANTS_UX_V1.md
- A2 (CA Uber Eats absent Mix ventes) — débloqué par la Décision #1 (Sources)
- A6 (vocabulaire UI proscrit) — débloqué par la Décision #2 (PeriodFilter avec lib/periods.js)
- B1 (comparaisons vs LY/Objectif) — débloqué par la Décision #2 + #4 (timezone propre + comparaisons à durée égale via lib/periods.js)
- D8 (food cost "+xx points vs quoi ?") — débloqué par la Décision #2

---

## 6. Historique

- **v1.0 (26 avril 2026)** : capture initiale des 4 décisions architecturales prises pendant la session du 26 avril 2026 (débat à 3 voix Mounir / Claude conversationnel / Claude Code).
- **v1.1 (3 mai 2026)** : enrichissement du schéma cible de la Décision #1 (3 tables, RLS, slug, integration_config, commission, fusion `tpa`) suite au cadrage Phase A migration data layer. Ajout de la Décision #5 fixant la stratégie d'exécution (option β : dual-write depuis sources amont, frontière KS2 / API Popina au 15/01/2025, devenir de `entrees`, critère de convergence révisé).

---

_Document vivant. Toute modification structurelle d'une des 5 décisions passe par une mise à jour de ce fichier avant implémentation._
