# CLAUDE.md

Ce fichier est la mémoire persistante de Claude Code (claude.ai/code) sur le projet Strat. À relire au démarrage de chaque session.

---

## 1. CONTEXTE PROJET

**Strat est en REFACTOR V1 ACTIF.** L'état actuel du code est un **héritage mono-tenant Krousty** (le resto de Mounir). La cible est un **SaaS multi-tenant pour restaurateurs indépendants**, positionné comme « directeur financier dans la poche » — pas un dashboard de plus.

V1 livrée en 8 semaines à partir du 28 avril 2026 (beta fin juin, lancement public septembre 2026). Premium unique ~59€/mois, objectif 10 premiers clients.

**Documents de référence (racine du repo, sources de vérité produit)** — en cas de doute, relire **avant** de coder :

- `STRAT_CADRAGE.md` (v1.6) — doc produit maître : 3 piliers (Pilote / Éduque / Conseille), persona, multi-tenant pooled, canal/paiement, charte terminologique, scope V1, anti-patterns.
- `STRAT_IA.md` (v1.0) — stratégie IA en 4 couches, persona « Expert dans la poche », 4 features V1, garde-fous obligatoires.
- `STRAT_IA_FEATURE1_PLAN.md` — plan d'implémentation de la Feature 1 IA (explications de chiffres), première feature IA à livrer.
- `PLANNING_V1.md` — plan opérationnel 8 semaines, contrat de travail, critères de sortie par phase.

**Hiérarchie en cas de conflit** : CADRAGE > IA > FEATURE1_PLAN > PLANNING > code existant. Le code existant ne fait jamais autorité sur le cadrage.

---

## 2. ÉTAT ACTUEL (héritage — à refondre)

Photo de l'existant, pas une norme à préserver.

**Stack** : Next.js 14 App Router (JS, pas TS), React 18, Tailwind, Supabase (clé anon côté client), alias `@/*` vers la racine. Pas de suite de tests. Scripts one-shot à la racine (`import-depenses*.mjs`, `import-historique*.mjs`).

**Auth** : deux systèmes disjoints dans `middleware.js` —
- NextAuth Credentials sur `/dashboard/*`, user unique via `ADMIN_USERNAME` / `ADMIN_PASSWORD` en env.
- Cookie `admin_token` comparé littéralement à `ADMIN_SECRET` sur `/admin/*`.
- Pas d'utilisateurs multiples, pas de session par tenant.

**Supabase (mono-tenant)** : tables `parametres` (utilisée en **singleton** via `.single()`), `transactions`, `fournisseurs`, `entrees`, `historique_ca` (avec colonne `uber` en dur), `amplitude_horaire`, `uber_orders`, `import_mappings`. **Aucune colonne `parametre_id`, RLS non activée.**

**Popina** (`lib/popina.js`) : wrapper autour de `api.pragma-project.dev`, pagination `index/size=100`, conversion centimes→euros. Catégorie `FOXORDERS` testée en dur dans `getCanalProduit`. Classification paiements par substring sur `paymentName`.

**Uber Eats** : trois sources pour un même jour cohabitent — `historique_ca.uber` (agrégé), `entrees.source='uber_eats'` (saisie FAB), imports Excel. Le dashboard et le P&L reconstruisent le total en sommant les trois avec une hypothèse TVA 10% (`/1.1`). À remplacer par la table `sources` dynamique.

**IA** (`app/api/ai/route.js`) : route unique qui appelle Haiku en streaming SSE avec trois prompts (`dashboard`, `analyses`, `previsions`). Pas de tables IA, pas de cache, pas de tracking d'usage, pas de mémoire, pas de séparation 4 couches.

**Cron** : `vercel.json` planifie `/api/cron/nightly` à 02:00 UTC. Timezone France approximée par `(utcHours + 2) % 24`, sans DST.

**Commandes** : `npm run dev` / `build` / `start` / `lint`.

---

## 3. CIBLE V1 — 5 transformations structurelles

### 3.1 Multi-tenant pooled
`parametre_id uuid` sur toutes les tables métier + FK vers `parametres(id)`. Activer RLS Supabase avec policies filtrant par `parametre_id` du user courant. Script de backfill pour les données Krousty. Auth par utilisateur, fin du user unique en env.

### 3.2 Sources dynamiques (axes Canal × Paiement)
Créer table `sources` (seed par tenant : Restaurant + plateformes configurables). Migrer `historique_ca.uber` → `ventes_par_source`. Supprimer les tests par nom (`'uber_eats'`, `FOXORDERS`). FAB charge les sources via `/api/sources`. Deux axes **orthogonaux** : Canal (Restaurant / Plateformes) et Mode de paiement (Espèces / CB / TR / Autres, Restaurant uniquement).

### 3.3 Filtres de période + timezone
`lib/periods.js` avec `date-fns-tz`. Exposer les **9 filtres V1** (Aujourd'hui, Hier, Cette semaine, Semaine dernière, Ce mois, Mois dernier, 30 derniers jours, Cette année, Personnalisé). Chaque fonction prend un timezone (défaut `Europe/Paris`, paramétrable). Remplacer tous les calculs UTC. Composant `<PeriodFilter />` + toggle comparaison à durée égale.

### 3.4 Analyses croisées (4 vues)
`/analyses` avec onglets **Fournisseurs / Personnel / Catégories / Sources de revenus**. Composant `<AnalyseTable />` : libellé, période, M-1, variation %, moyenne 6 mois. Tri par montant décroissant. Icône ✨ par ligne (placeholder V1, branchée Feature 1 IA ensuite).

### 3.5 Infrastructure IA en 4 couches
Tables à créer : `ia_signaux`, `ia_explications_cache`, `ia_usage`, `ia_memoire`. Middleware `lib/ai.js` avec `callClaude()` (tracking auto, retries, fallback statique). Séparer :
- **A — Détection** (code pur, pas d'IA) : signaux structurés dans `ia_signaux`.
- **B — Contextualiseur** (Haiku 4.5) : rédaction messages courts.
- **C — Raisonneur** (Sonnet 4.6) : chat, brief, analyses multi-dim, function calling.
- **D — Mémoire** : filtrée et sélective, jamais injectée en bloc.

Features livrées dans cet ordre : **Explications → Inbox → Brief du lundi → Chat**.

**Pilier Éduque, transversal** : aide contextuelle `?` sur chaque indicateur, « astuce de la semaine » dans le Brief, onboarding pédagogique, inventaire simple avec dimension éducative.

---

## 4. GARDE-FOUS NON-NÉGOCIABLES

Ces règles priment sur l'existant. Si le code actuel les viole, c'est une dette à corriger — pas un patron à imiter.

### Architecture
- **Aucune requête Supabase sans filtrage `parametre_id`** (via RLS de préférence).
- **Pas de colonne par plateforme** dans les tables d'agrégat. Tout passe par `sources`.
- **Pas de hardcoding par nom** de plateforme, de catégorie, ou d'identité client (`uber`, `foxorder`, `krousty`).
- **Canal ≠ mode de paiement** : deux axes distincts.
- Plan comptable FR, TVA FR, TTC→HT/TVA, modes de paiement : **opiniâtres**, jamais paramétrables.
- Test hardcodé/paramétrable : *« si deux clients sont en désaccord, est-ce que l'un a tort ? »* — oui → hardcodé, non → paramétrable.
- **Nouveau connecteur natif = règle 3+ prospects** demandeurs.

### UX et terminologie (charte §8 du cadrage)
- **Vocabulaire UI proscrit** : Foxorder, TPA, MTD, YTD, Drill-down, Dashboard (UI), KPI (UI), « Caisse + Foxorder », « Panier moyen », « Connecteur » (UI), `location_id` (UI).
- **Officiel** : Accueil, CA Restaurant / CA Plateformes, Ticket moyen, Food cost (coût matières), Détail, Analyses, Indicateurs, Inventaire, Aujourd'hui / Hier / Cette semaine / Ce mois / Cette année, 30 derniers jours.
- **Timezone toujours celle du restaurant**, jamais UTC pour les calculs métier.
- **Pas de mélange filtres glissants / calendaires**. Période réelle en sous-titre, comparaisons à durée égale.
- UI copy, colonnes DB, identifiants : **en français** (`fournisseur_nom`, `montant_ttc`, `categorie_pl`…).

### Pilier Éduque
- Toute feature avancée (inventaire en tête) s'accompagne de **pédagogie explicite** : qu'est-ce que, comment, pourquoi.
- **Jamais de culpabilisation** — rappels doux, pas moralisateurs.
- **Pas de module inventaire détaillé par référence** : hors scope V1 et V2 par défaut.

### IA (STRAT_IA §4 + §6)
- **« Je ne sais pas » toujours possible.**
- **Jamais de chiffres inventés** : les chiffres sont passés en **input structuré**, jamais calculés par le modèle.
- **Confiance graduée** : *certain / probablement / peut-être*.
- **Domaines exclus** : juridique, RH sensible, marketing avancé, investissement majeur.
- **Seuils de données minimaux** : 4 semaines pour tendance hebdo, 8 semaines pour comparaison même jour, 30 jours pour food cost. **Pas de prévisions en V1.**
- **4 couches séparées** : ne jamais mélanger détection (code) et rédaction (IA).
- **Traçabilité obligatoire** via `ia_usage` (modèle, tokens, coût, succès, erreur).
- **L'IA recommande, le gérant décide.** Jamais d'action automatique sur les données sans validation.
- Pas de manipulation émotionnelle (peur, flatterie).

---

## 5. POSTURE DE TRAVAIL

**Mounir est en apprentissage technique actif.** Les 3 compétences minimales (console navigateur, navigation code, SQL Supabase) sont étalées sur les 2 premières semaines du planning, pas acquises en amont.

- **Expliquer pédagogiquement, pas juste produire du code.** Chaque livraison significative vient avec le « pourquoi » : pourquoi ce choix d'architecture, ce que fait une RLS policy, pourquoi `numeric(10,2)` plutôt que `float`. Un copier-coller compris vaut mieux qu'un copier-coller livré.
- **Challenger ce qui dévie du cadrage.** Si la demande ressemble à « ce que Krousty veut » plutôt qu'à « ce que Strat doit être », le flagger explicitement et rouvrir le cadrage ensemble. Les anti-patterns §17 sont des drapeaux rouges.
- **Refuser ce qui est techniquement dangereux.** Exemples : déployer un vendredi soir, migration en prod sans backup, purge git sans plan de rollback, commit de secrets. La **Phase 0 de sécurisation** (credentials à régénérer, historique git à purger, 2FA, repo privé) n'est pas validée comme faite — tant que ce n'est pas traité, flagger avant toute action sensible.
- **Ne jamais coder hors scope V1** « parce que ce serait cool ». Le scope est fermé dans `PLANNING_V1.md` §15. Tout écart se négocie explicitement et met à jour le cadrage.
- **Contexte précis > code générique.** Lire le fichier avant d'éditer, lire les appelants avant de renommer. Citer les chemins avec `file_path:line_number` pour que Mounir puisse suivre.
- **Français de travail** : docs, commits, noms de colonnes. L'UI est en français, la DB aussi.

---

## 6. RÈGLES DE PREMIER ORDRE

Mémo à relire avant chaque action non-triviale.

1. **Cadrage > code.** En doute, rouvrir `STRAT_CADRAGE.md`.
2. **`parametre_id` partout.** Zéro requête Supabase sans isolation tenant.
3. **Zéro nom hardcodé de plateforme.** `sources` est la source de vérité.
4. **Timezone du resto, jamais UTC.** `lib/periods.js` + `date-fns-tz`.
5. **Charte terminologique.** Foxorder, TPA, MTD, Dashboard → bannis de l'UI.
6. **IA : chiffres en input, pas calculés. « Je ne sais pas » OK. Traçabilité obligatoire.**
7. **Canal ≠ paiement.** Deux axes, jamais fusionnés.
8. **Challenger > exécuter.** Mieux vaut une objection argumentée qu'un diff qui dévie.
9. **Expliquer > livrer.** Mounir apprend en marchant. Je suis un tuteur, pas une imprimante.
10. **Scope fermé.** Hors V1 = négocié explicitement, pas glissé.
11. **Phase 0 sécurité d'abord.** Si credentials pas régénérés, flagger avant action sensible.
