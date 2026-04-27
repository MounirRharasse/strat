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

**Décision** : `historique_ca` sera supprimée après migration. Une seule source de vérité : `ventes_par_source`.

**Modèle cible** :

```sql
-- Table sources (paramétrable par tenant)
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id UUID NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,                  -- "Restaurant", "Uber Eats", "Deliveroo"...
  type TEXT NOT NULL,                 -- 'restaurant' | 'plateforme'
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table ventes_par_source (table opérationnelle, source de vérité unique)
CREATE TABLE ventes_par_source (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id UUID NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id),
  date DATE NOT NULL,
  montant_ttc NUMERIC(10,2) NOT NULL,
  nb_commandes INTEGER,
  -- ... autres colonnes selon besoin (TVA, commission, etc.)
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (parametre_id, source_id, date)
);
```

**Toutes les agrégations journalières** (courbes, dashboard, /api/analyses) se feront à la volée par `GROUP BY date` sur `ventes_par_source`.

**Justification** :
- ✅ Une seule source de vérité = pas de bugs de désynchronisation
- ✅ Modèle simple à expliquer à un nouveau dev (30 secondes)
- ✅ Le bug Uber Historique qu'on vient de découvrir est exactement le pattern que la cohabitation `historique_ca` + `ventes_par_source` aurait perpétué
- ✅ Performance OK : un `GROUP BY` sur 1500 lignes = ~50-80ms (mesuré conceptuellement par Claude Code). Seuil problématique vers 10M lignes (V1 = ~180k lignes pour 10 tenants × 1 an, marge x50)

**Coût migration** : 15-20h dev one-shot, ~7-8 fichiers à toucher (4 pages serveur + 2 routes API + cron + 2 admin). Migration disruptive — nécessite dual-write puis cutover.

**Réversibilité** : si problème, A → B (réintroduire un cache `historique_ca`) faisable en ~1 jour.

**Options écartées** :
- **Option B** (cohabitation `historique_ca` + `ventes_par_source` synchronisées par trigger) : rejetée parce que reproduit exactement le pattern de duplication qui a produit le bug Uber Historique. Le gain perf est marginal (~30ms imperceptibles utilisateur) et non mesuré.
- **Option C** (vue Postgres lecture seule) : intéressante mais 80% du coût de migration reste là (les écritures doivent toutes migrer vers `ventes_par_source` quand même), perpétue le schéma legacy, et sa latence dégrade avec le volume.

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

---

_Document vivant. Toute modification structurelle d'une des 4 décisions passe par une mise à jour de ce fichier avant implémentation._
