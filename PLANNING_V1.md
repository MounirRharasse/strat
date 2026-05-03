# Strat — Planning V1 (8 semaines)

_Version 1.1 — avril 2026_

Ce document fixe le plan d'exécution pour livrer la V1 de Strat. Il est opérationnel, pas stratégique. Pour les décisions produit, voir `STRAT_CADRAGE.md`. Pour les décisions architecturales, voir `STRAT_ARCHITECTURE.md`.

**Démarrage** : semaine du 28 avril 2026
**Livraison V1 testable** : semaine du 23 juin 2026
**Beta avec 2-3 clients** : semaine du 30 juin 2026
**Lancement commercial public (10 clients)** : septembre 2026

---

## État au 03/05/2026

Cette section est un constat factuel d'avancement, **pas une mesure de retard**. Le calendrier théorique (Démarrage / Livraison V1 testable / Beta / Lancement public) reste tel qu'écrit ci-dessus, mais on avance au rythme des sessions de travail réelles.

- **Phase 0 — Sécurisation et setup** : ✅ faite (cohérente avec déclaration plus bas).
- **Phase 1 — Refondation architecturale** : 🔄 partiellement amorcée.
  - **Fait** : `lib/periods.js` (+ `lib/periods.test.js`), `components/PeriodFilter.js`.
  - **Pas fait** : tables `sources` / `ventes_par_source` / `paiements_caisse` (= **Sprint Migration data layer** en cours, voir sous-section dédiée Phase 1) ; centralisation `lib/calculs/` (dossier absent) ; helpers `lib/data/{transactions,ventes,parametres}.js` (`lib/data/` existe avec `analyses-kpis.js` et `constants.js` uniquement) ; suppression `historique_ca.uber` ; `<HorizonFilter />` (composant absent) ; multi-tenant fonctionnel bout en bout (Krousty toujours hardcodé dans `lib/auth.js` et plusieurs routes/scripts).
- **Phase 2 — Analyses et données** : ⏸️ partiellement faite par anticipation.
  - **Fait** : `app/analyses/page.js` niveau 1, `app/api/analyses/`, `app/analyses/sorties/[fournisseur]/`, `lib/analyses/{recherche,sorties}.js`.
  - **Pas fait** : composant `<AnalyseTable />` réutilisable, import CSV intelligent (libs `papaparse`/`chardet` non installées, pas de `app/admin/imports/upload`), version finale des 4 routes `/api/analyses/{fournisseurs,personnel,categories,sources}` (la route `sources` dépend de la migration data layer en cours).
- **Phase 3 — IA et finalisation** : 🔄 majoritairement faite **par anticipation calendaire** (livrée fin avril–début mai 2026 alors que la Phase 3 théorique est S7-S8 = juin 2026).
  - **Fait** : 10 commits du sprint IA (`a9bb685` socle → `dbc729a` UI Chat). Tables `ia_signaux`, `ia_socle`, `ia_memoire` créées. `lib/ai.js`, `lib/ia/` (15+ fichiers), routes `app/api/ia/{anomalie,brief,chat,insight}/`. 4 features livrées : Brief lundi, Insight quotidien, Anomalies "Comprendre", Chat conversationnel.
  - **Pas fait** : Onboarding (Phase 3 S8 prévue, pas amorcée — pas de dossier `app/onboarding`, pas de parcours guidé) ; **Charges récurrentes** (acompte V1 = enrichissement `/previsions` avec saisie 1-clic, complet V1.1 = automatisation cron + détection + onboarding step). Position calendaire pas figée — à programmer plus tard.

**Note de méta-discipline** : « Sprint IA Phase 1 » dans les messages de commit IA (`feat(ia): commit X/10 — sprint IA Phase 1`) désigne un découpage **interne au sprint** (commits 1/10 → 10/10), **pas** la Phase 1 du PLANNING (qui est la refondation architecturale). Collision de vocabulaire à garder en tête.

---

## Contrat de travail

### Engagement de Mounir

1. 40h+/semaine sur Strat, priorité absolue
2. Utilisation de Claude Code (ou Cursor) comme outil principal de dev
3. Apprentissage en marchant : poser des questions, ne pas copier-coller bêtement, tester à chaque étape
4. Acquisition des 3 compétences minimales dans les 2 premières semaines
5. Accepter que la V1 est beta et se positionner en conséquence commercialement

### Engagement de Claude (l'assistant)

1. Fournir des specs précises et du code prêt à exécuter
2. Expliquer les concepts sous-jacents pendant qu'on code
3. Review les livraisons et détecter les problèmes
4. Challenger les décisions qui dévient du cadrage
5. Refuser de faire ce qui est techniquement dangereux

### Les 3 compétences minimales à acquérir

Ces compétences sont non-négociables. Étalées sur les 2 premières semaines, pas de cours en amont.

**Compétence 1 — Console navigateur (une fois)**
Ouvrir F12, onglet Console, lire et comprendre un message d'erreur, le copier proprement pour partager.

**Compétence 2 — Navigation code (au fil du dev)**
Savoir localiser un bug : FAB ? route API ? base de données ? UI ? Comprendre la structure du projet Next.js.

**Compétence 3 — SQL basique dans Supabase (une fois)**
Accéder au SQL Editor, faire un SELECT simple, comprendre un résultat, inspecter une table.

---

## Phase 0 — Sécurisation et setup

**Statut : ✅ Réalisée** (jours 1-2 du sprint, 25-26 avril 2026)

Toutes les tâches de sécurité ont été effectuées :
- Credentials régénérés (NEXTAUTH_SECRET, CRON_SECRET, ADMIN_PASSWORD, clé Popina)
- 2FA activée sur Supabase
- Backups CSV des 8 tables créés
- Claude Code installé et configuré
- `STRAT_CADRAGE.md`, `STRAT_IA.md`, `PLANNING_V1.md` commités à la racine

Sprint multi-tenant déjà entamé en parallèle de la Phase 0 :
- Migration `parametres` étendue (timezone, jours_ouverture, slug)
- Migration `parametre_id NOT NULL` sur 8 tables
- 6 routes API patchées + 2 clients React migrés
- Helper de session `lib/auth.js` créé
- 6 lectures `from('parametres').single()` filtrées par tenant
- Performance Popina parallélisée (30s → 14s sur /previsions)
- `loading.js` ajouté sur /previsions

---

## Phase 1 — Refondation architecturale (Semaines 1 à 4) [REFONDUE v1.1]

**Objectif** : poser les fondations propres pour qu'un nouveau client puisse être accueilli sans bricoler. Cette phase remplace l'ancienne Phase 1 v1.0 — restructurée le 26 avril 2026 suite au débat à 3 voix architectural (cf. `STRAT_ARCHITECTURE.md`).

### Semaine 1 — Périodes + Design Sources
**Objectif S1** : livrer la lib `lib/periods.js` et le composant `<PeriodFilter />` opérationnels, et avoir designé proprement le schéma `sources` + `ventes_par_source` (sans le coder).

**Lundi-Mardi : `lib/periods.js` (lib pure)**- Installer `date-fns` et `date-fns-tz`
- Créer la lib avec les 9 filtres comme fonctions pures (timezone en argument, cf. Décision #4)
  - `getAujourdhui({ timezone })`
  - `getHier({ timezone })`
  - `getCetteSemaine({ timezone })`
  - `getSemaineDerniere({ timezone })`
  - `getCeMois({ timezone })`
  - `getMoisDernier({ timezone })`
  - `getDerniers30Jours({ timezone })`
  - `getCetteAnnee({ timezone })`
  - `getPeriodePersonnalisee({ since, until, timezone })`
- Implémenter `periodePrecedenteAEgaleDuree(periode)` pour les comparaisons
- Tests Vitest sur les bordures :
  - DST mars/octobre (changement d'heure)
  - 1er janvier à minuit France
  - Années bissextiles
  - Périodes vides (pas d'activité)
- **Bug DST cron à fixer en parallèle** : remplacer `(getUTCHours() + 2) % 24` par calcul timezone propre

**Mercredi : Composant `<PeriodFilter />` (3 profils)**- Composant React avec prop `profil` ('pilotage' | 'journal' | 'comptable')
- 3 sets de filtres affichés selon profil (cf. `STRAT_CADRAGE.md` §13)
- Intégration de la lib `lib/periods.js`
- Affichage du sous-titre discret avec dates réelles ("21 - 24 avr · 4 jours")
- Toggle "Comparer à la période précédente"
- `<HorizonFilter />` séparé pour Prévisions (Fin de semaine, Fin de mois, Fin d'année)

**Jeudi-Vendredi : Design Sources EN PARALLÈLE**- Schéma SQL des tables `sources`, `ventes_par_source` et `paiements_caisse` sur papier
- Validation avec Claude Code et Claude conversationnel
- Migration SQL écrite (mais **pas exécutée** en S1)
- Backfill et plan de cutover : voir sous-section **Sprint Migration data layer** ci-dessous (alignée sur `STRAT_ARCHITECTURE.md` §Décision #5).
- **Pas de code applicatif Sources cette semaine**

**Bilan vendredi** : décider si on continue parallèle en S2-3 ou si on prolonge S1 sur Périodes uniquement (cf. garde-fou Décision #3).

**Compétence 2 (en marchant)** : navigation code pendant la S1.

### Semaines 2-3 — Code Sources + Calculs

**Objectif S2-3** : trois tables cibles opérationnelles (`sources`, `ventes_par_source`, `paiements_caisse`), `historique_ca` déprécié, calculs métier centralisés dans `lib/calculs/`.

La mise en œuvre opérationnelle de la migration vers ces tables — sources amont, frontière temporelle, idempotence, critère de convergence, devenir de `entrees`, séquence de cutover — est détaillée dans la sous-section **Sprint Migration data layer** ci-dessous, et le pourquoi-comment dans `STRAT_ARCHITECTURE.md` §Décision #5. Cette sous-section PLANNING expose le quoi-quand ; le détail architectural n'est pas dupliqué ici.

### Sprint Migration data layer (en cours, mai 2026)

Ce sprint exécute la Décision #1 (schéma cible 3 tables) et la Décision #5 (stratégie d'exécution option β) de `STRAT_ARCHITECTURE.md` v1.1. Il remplace l'approche dual-write `historique_ca` ↔ `ventes_par_source` envisagée dans PLANNING_V1 v1.1, désormais abandonnée pour cause de sémantique `historique_ca.ca_brut` instable (cf. §Décision #5).

Sources amont retenues :
- **18/04/2024 → 15/01/2025 inclus** : Excel KS2 personnel Mounir (onglets `Data_CA_N-2`, `Data_CA_N-1`).
- **16/01/2025 → aujourd'hui** : API Popina (`getAllReports`).

Découpage en 7 étapes. Pas de calendrier figé — on avance au rythme des sessions.

- [ ] **Étape 1 — Migration SQL idempotente** : créer `sources`, `ventes_par_source`, `paiements_caisse` + RLS par `parametre_id` + seed Krousty (`Restaurant`, `Uber Eats`). Sans backfill encore. Validation manuelle obligatoire avant push.
- [ ] **Étape 2 — Backfill KS2** : import depuis Excel KS2 vers `ventes_par_source` (sources `popina` + `uber_eats`) et `paiements_caisse` sur la période 18/04/2024 → 15/01/2025. Fusion `tpa → cb`. Validation préalable via le CSV pré-import généré par `scripts/generate-ks2-pre-import-csv.mjs`.
- [ ] **Étape 3 — Backfill API Popina** : import depuis `getAllReports` vers `ventes_par_source` + `paiements_caisse` sur la période 16/01/2025 → aujourd'hui. Idempotence `ON CONFLICT (parametre_id, date, source_id) DO UPDATE`.
- [ ] **Étape 4 — Activation dual-write côté cron** : le cron `app/api/cron/nightly/route.js` écrit chaque nuit dans `ventes_par_source` + `paiements_caisse` ET continue d'écrire dans `historique_ca` legacy en parallèle. Fenêtre de dual-write à durée non figée — déterminée selon avancement et résultat des critères de convergence.
- [ ] **Étape 5 — Migration des lectures** : refacto progressive des consommateurs (`app/dashboard/`, `app/pl/`, `app/journal/`, `app/api/analyses/`, `app/api/historique/`, `lib/data/`, `lib/calculs/`, `lib/ia/`) pour qu'ils consomment `ventes_par_source` + `paiements_caisse` au lieu de `historique_ca`.
- [ ] **Étape 6 — Cutover** : suppression de l'écriture dans `historique_ca` côté cron, audit visuel avant/après sur 5-10 dates échantillon. Communication à Mounir du saut visuel attendu (passage sémantique pourrie `historique_ca` → sémantique propre `ventes_par_source`).
- [ ] **Étape 7 — Phase C ultérieure** : `DROP TABLE entrees` et `DROP TABLE historique_ca`. Séquence stricte pour `entrees` : (1) backfill des 17 lignes Uber actuelles vers `ventes_par_source`, (2) migration FAB pour qu'il écrive dans `ventes_par_source`, (3) drop. Cf. §Décision #5 pour le détail.

Critère de convergence (validation Étape 4 → Étape 6) à 3 niveaux, défini dans `STRAT_ARCHITECTURE.md` §Décision #5 :
- **Test d'intégration** : `ventes_par_source` vs API Popina sur le mois courant (à l'euro près sur les jours pleins).
- **Test sémantique externe** : `ventes_par_source` vs exports Popina mensuels manuels (`jalia_export_accounting_8610_*.xlsx`) sur 2-3 mois récents.
- **Audit visuel post-cutover** : 5-10 dates échantillon (1 par mois sur 6 mois).

Anti-pattern explicite : **ne pas alimenter `ventes_par_source` depuis `historique_ca`**. Les sources amont (API Popina, KS2) sont la seule entrée valide. Cf. §Décision #5 pour le pourquoi.

### Garde-fou S2-3 — Ordre intelligent Calculs/Sources

Pour éviter le double-refactor, l'ordre des extractions de calculs doit être :

**Phase A (peut commencer en parallèle de Sources)** :
- `calculerFoodCost` (depuis transactions, indépendant de Sources)
- `calculerEBE` (depuis transactions, indépendant de Sources)
- `calculerCharges par catégorie` (depuis transactions, indépendant de Sources)
- `calculerTicketMoyen` (peut attendre Sources OU être codé en utilisant l'ancienne API)

**Phase B (APRÈS la migration Sources)** :
- `calculerCA` brut/HT (consomme `ventes_par_source`)
- `calculerCAParCanal` (consomme `ventes_par_source`)
- `calculerCommissions` (consomme `ventes_par_source` + `parametres`)

Cette séquence évite de réécrire les calculs CA deux fois.

**Code Calculs (priorité 2)**

En parallèle de Sources sur S2-3 :
- Créer `lib/calculs/ca.js` (fonctions pures : calculerCA, calculerCAParCanal, etc.)
- Créer `lib/calculs/depenses.js` (calculerCharges, calculerFoodCost, etc.)
- Créer `lib/calculs/pl.js` (calculerEBE, calculerMarges, etc.)
- Créer `lib/calculs/commissions.js`
- Extraire les calculs depuis `pl/page.js` (le plus complet) vers les fonctions pures
- Faire converger les 4 lieux dupliqués sur la même fonction
- Tests Vitest obligatoires sur chaque fonction de calcul

**Compétence 3 (en fin de semaine 3)** : sur Supabase SQL Editor, apprendre à faire `SELECT * FROM transactions WHERE ...` pour inspecter.

### Semaine 4 — Récupération données
**Objectif S4** : centraliser tous les helpers Supabase dans `lib/data/`. Plus aucune page ne fait de SELECT direct.

- Créer `lib/data/transactions.js` (`getTransactions(parametre_id, since, until, options)`, etc.)
- Créer `lib/data/ventes.js` (`getVentesParJour`, `getVentesParSource`)
- Créer `lib/data/parametres.js` (`getParametresFor`, `getTimezoneFor`)
- Migration page par page pour utiliser ces helpers
- Refactor de `lib/popina.js` pour ne garder que les helpers data (sortir `getDailyKPIs` qui mélange data et calcul, vers `lib/calculs/`)
- Test bout en bout : un nouveau client peut être créé, onboardé, voir ses KPIs

### Critère de sortie Phase 1

Format checklist honnête : `[x]` = fait, `[ ]` = à faire. Cf. §État au 03/05/2026 pour le détail d'avancement.

- [x] `lib/periods.js` couvre les 9 filtres avec timezone, tests verts
- [ ] `<PeriodFilter />` fonctionne avec 3 profils, intégré sur 5 pages (composant créé, intégration à vérifier)
- [ ] `<HorizonFilter />` intégré sur Prévisions
- [ ] Tables `sources` + `ventes_par_source` + `paiements_caisse` opérationnelles, `historique_ca.uber` supprimé
- [ ] Calculs métier centralisés dans `lib/calculs/`, plus de duplication 4×
- [ ] Helpers `lib/data/` utilisés par toutes les pages
- [ ] L'app est entièrement multi-tenant fonctionnelle (un nouveau client peut être ajouté sans toucher au code)
- [ ] Bug Uber Historique (`/api/analyses:84`) résolu par construction (pas de duplication possible)
- [ ] Bug DST cron fixé (`app/api/cron/nightly/route.js:34` utilise toujours `(getUTCHours() + 2) % 24`)
- [ ] Vocabulaire UI proscrit éliminé (MTD, YTD, 1S, 1M, 6M, 1A)

---

## Phase 2 — Semaines 5 à 6 : Analyses et données
**Objectif** : les 4 vues d'analyse croisée et l'import CSV universel.

### Semaine 5 — Les 4 vues d'Analyses
**Lundi : Route API d'agrégation**

- [ ] `/api/analyses/fournisseurs?since=X&until=Y` : GROUP BY fournisseur_nom
- [ ] `/api/analyses/personnel?since=X&until=Y` : GROUP BY bénéficiaire (extrait du libellé)
- [ ] `/api/analyses/categories?since=X&until=Y` : GROUP BY sous_categorie
- [ ] `/api/analyses/sources?since=X&until=Y` : GROUP BY source

Toutes ces routes filtrent par `parametre_id` via RLS et utilisent `lib/data/` (livré en S4).

**Mardi : UI tableau custom simple**

- [ ] Composant `<AnalyseTable />` réutilisable
- [ ] Colonnes : Libellé + Montant période + Montant M-1 + Variation % + Moyenne 6 mois
- [ ] Tri par montant décroissant par défaut
- [ ] Clic sur ligne → détail (plus tard, juste la structure)

**Mercredi-Jeudi : Intégration des 4 vues**

- [ ] Page `/analyses` avec onglets : Fournisseurs / Personnel / Catégories / Sources
- [ ] Chaque onglet utilise `<AnalyseTable />` avec sa route API
- [ ] `<PeriodFilter profil="pilotage" />` en haut pour choisir la période

**Vendredi : Préparation intégration IA**

- [ ] Placeholder icône ✨ sur chaque ligne du tableau (non fonctionnel pour l'instant)
- [ ] Tests avec tes vraies données

### Semaine 6 — Import CSV intelligent
**Lundi-Mardi : Couche 1 — Parser universel**

- [ ] Installation des libs nécessaires (`papaparse`, `chardet`, `xlsx`)
- [ ] Fonction qui prend un fichier, détecte l'encodage, le séparateur
- [ ] Retourne un tableau normalisé avec types inférés par colonne

**Mercredi : Couche 2 — Mapper**

- [ ] Analyse des colonnes détectées
- [ ] Suggestions de mapping par nom ("Date" → date, "Montant TTC" → montant_ttc)
- [ ] Sauvegarde du mapping dans `import_mappings`

**Jeudi : Couche 3 — Importer validé**

- [ ] Page d'upload avec preview des 10 premières lignes interprétées
- [ ] Lignes en erreur en rouge avec raison
- [ ] Bouton "Importer" qui écrit en base avec rollback si erreur

**Vendredi : Tests et pédagogie**

- [ ] Test avec ton fichier `comptes.xlsx` de relevé bancaire
- [ ] Test avec un export Popina
- [ ] Aide contextuelle : "Comment exporter mon fichier ?" par type de caisse

### Critère de sortie Phase 2

- Les 4 vues d'Analyses fonctionnent et affichent les bonnes données
- Tu peux importer un fichier CSV ou XLSX et l'onboarder en base
- Les comparaisons période M / M-1 / moyenne 6 mois sont correctes
- Pas de crash sur les cas limites (données manquantes, périodes sans activité)

---

## Phase 3 — Semaines 7 à 8 : IA et finalisation

**Objectif** : les 4 features IA + onboarding + préparation lancement.

### Semaine 7 — Infrastructure IA + Features 1-2
**Lundi : Setup infra IA**

- [ ] Tables `ia_signaux`, `ia_explications_cache`, `ia_usage`, `ia_memoire` (voir STRAT_IA.md)
- [ ] Compte Anthropic + API key dans env vars Vercel
- [ ] Middleware `lib/ai.js` avec fonction `callClaude()` (gestion erreurs, tracking usage, retries)

**Mardi-Mercredi : Feature 1 — Explications de chiffres**

- [ ] Route `/api/ia/explication`
- [ ] Fonctions `buildContext()` et `buildPrompt()` par indicateur
- [ ] Cache 24h dans `ia_explications_cache`
- [ ] Icône ✨ fonctionnelle sur les indicateurs principaux

**Jeudi : Intégration Analyses**

- [ ] Icône ✨ sur chaque ligne des tableaux d'analyses
- [ ] Explication spécifique par ligne (ex : "Transgourmet +48% ce mois...")

**Vendredi : Feature 2 — Inbox intelligente**

- [ ] Moteur de détection en code classique (dérives food cost, anomalies CA, etc.)
- [ ] Cron nocturne qui émet des signaux dans `ia_signaux`
- [ ] Contextualiseur IA qui rédige le message à partir du signal
- [ ] Écran "Notifications" avec les messages pushés

### Semaine 8 — Features IA 3-4 + Onboarding
**Lundi-Mardi : Feature 3 — Brief du lundi**

- [ ] Cron lundi 7h du matin
- [ ] Sonnet avec function calling pour accéder aux données
- [ ] Structure du brief (constats + vigilance + action + astuce pédagogique)
- [ ] Affichage dans l'inbox + email via Resend

**Mercredi : Feature 4 — Chat conversationnel**

- [ ] Interface chat simple (pas besoin de WebSocket, simple POST/response)
- [ ] Sonnet avec function calling pour récupérer les données
- [ ] Mémoire conversationnelle (dernières questions/réponses)
- [ ] Rate limiting (30 messages/jour par client)

**Jeudi : Onboarding**

- [ ] Parcours guidé pour un nouveau restaurant
- [ ] Étape 1 : infos générales (nom, timezone)
- [ ] Étape 2 : déclarer sources (Restaurant + plateformes)
- [ ] Étape 3 : objectifs (CA mensuel, ticket moyen, food cost)
- [ ] Étape 4 : jours d'ouverture
- [ ] Étape 5 : premier import de données (CSV ou connecteur Popina)
- [ ] Éducation à chaque étape ("voici pourquoi on te demande ça")

**Charges récurrentes (NOUVEAU v1.3 — cf. STRAT_CADRAGE.md §6.5)**

Acompte V1 (~4h, indépendant de l'onboarding, peut être livré avant) :

- [ ] Endpoint `POST /api/charges-recurrentes/saisir` avec idempotence par (parametre_id, categorie_pl, mois)
- [ ] Refonte `/previsions` : 3 états par échéance (à saisir / déjà saisie / variable à confirmer) + bouton master « Saisir toutes les échéances restantes »
- [ ] Helper `lib/calculs/charges-mensuelles.js` (détection « déjà saisie ce mois »)
- [ ] Test manuel Mounir + ajustements

Complet V1.1 (~17h, sprint dédié post-V1) :

- [ ] Migration SQL : tables `charges_types` (catalogue partagé restauration FR), `charges_recurrentes` (paramétrage par tenant), `charges_suggestions` (file de propositions)
- [ ] Seed `charges_types` : ~15 charges typiques restauration FR avec mapping `categorie_pl` opiniâtre
- [ ] Détecteur de patterns sur historique transactions (algo : fournisseur+catégorie+jour±5j+montant±15% sur 6+ mois ; cluster jour-du-mois fin/début/milieu/fixe)
- [ ] Cron mensuel multi-tenant `/api/cron/charges-recurrentes-mensuel`
- [ ] UI suggestions post-onboarding (bandeau dashboard + page dédiée)
- [ ] UI maintenance `/parametres/charges-recurrentes`
- [ ] Onboarding step dédié (étape 2.5 du parcours, après infos générales)
- [ ] Tests vitest (détecteur + cron + cas limites)

Anti-pattern à éviter : auto-INSERT silencieux sans paramétrage préalable du gérant. Cohérent avec garde-fou « gérant décide » (cf. `STRAT_CADRAGE.md` §6.5).

**Vendredi : Polish, tests end-to-end, préparation**

- [ ] Test complet : nouvel utilisateur → inscription → onboarding → utilisation 1 jour
- [ ] Corriger les bugs trouvés
- [ ] Check responsive mobile
- [ ] Préparer le pitch de vente pour les 2-3 premiers clients beta

### Critère de sortie Phase 3

- Les 4 features IA fonctionnent et donnent des résultats qualitatifs
- Un nouveau restaurateur peut s'inscrire et être opérationnel en 10 min
- Le produit supporte 3-5 clients simultanés sans problème de performance
- Tu as écrit ton pitch de vente

---

## Semaine 9+ : Beta avec 2-3 clients

**Pas plus de 3 clients sur les 4 premières semaines.** On stabilise d'abord.

### Approche

- [ ] Identifier 3 restaurateurs dans ton réseau proche (connaissance personnelle)
- [ ] Les rencontrer individuellement (pas en groupe)
- [ ] Présenter Strat comme beta avec tarif préférentiel à vie
- [ ] Onboarder chacun avec accompagnement personnalisé
- [ ] Debrief hebdo avec eux (qu'est-ce qui marche, qu'est-ce qui bloque)
- [ ] Corriger les bugs remontés en priorité absolue
- [ ] Un canal de support direct (WhatsApp ou téléphone) pour eux

### Ne pas passer à 10 clients tant que

- Les 3 premiers n'ont pas tous leurs données à jour dans Strat
- Les 3 premiers ne sont pas satisfaits et prêts à te recommander
- Tu n'as pas résolu tous les bugs P0 et P1 remontés

Probable période d'atteinte : août 2026.

### Lancement public (10 clients)

Probable : septembre 2026.

---

## Règles de pilotage du projet

### Daily

- Chaque jour de dev, tu commences par relire la section en cours de ce planning
- Tu coches les items au fur et à mesure (dans le fichier versionné sur git)
- Tu commits à chaque fin de tâche avec un message clair

### Weekly

- Chaque vendredi soir, bilan de la semaine :
  - Quelles tâches ont été faites ?
  - Lesquelles ont pris plus de temps que prévu ? Pourquoi ?
  - Quels blocages rencontrés ?
  - Est-ce qu'on est dans les clous ou on doit ajuster ?

### Quand ça coince

Si une tâche prend 2x plus de temps que prévu :
1. Arrêter et poser le problème clairement
2. Partager le contexte complet (code, erreur, ce qu'on a essayé)
3. Rechercher ensemble avant de bricoler

Si une semaine entière est décalée :
1. Ce n'est pas un drame mais c'est un signal
2. Identifier pourquoi (sous-estimation ? apprentissage ? outil ?)
3. Ajuster le reste du planning si besoin

### Bilan obligatoire en fin de Semaine 1 (NOUVEAU v1.1)

Décider si le parallélisme "Périodes + design Sources" tient ou si on doit revenir à un séquentiel pur (cf. `STRAT_ARCHITECTURE.md` Décision #3, garde-fous).

### Ce qui ne doit PAS arriver

- Coder un truc hors cadrage parce que "ce serait cool"
- Sauter la phase de sécurisation (Phase 0) pour gagner du temps — ✅ déjà faite
- Vendre à un client avant la fin de la Phase 3
- Copier-coller du code sans comprendre ce qu'il fait
- Déployer en prod un vendredi soir
- **Coder Sources avant que son design ait été validé** (Phase 1 S1) [NOUVEAU v1.1]
- **Mélanger code Périodes et code Sources** sur les mêmes commits (séparation des sujets) [NOUVEAU v1.1]

---

## Ressources recommandées

### Pour les 3 compétences minimales

- **Console navigateur** : la vidéo "Chrome DevTools Crash Course" sur YouTube
- **Next.js App Router** : le tutoriel officiel `https://nextjs.org/learn` (section App Router seulement)
- **Supabase SQL** : la doc officielle `https://supabase.com/docs/guides/database/overview`

### Pour Claude Code

- Documentation officielle : `https://docs.claude.com/claude-code`
- Commandes utiles au début : `/help`, `/init`, demander d'expliquer le code existant

### Pour les prompts

Quand tu demandes quelque chose à Claude Code ou à moi dans ce chat, toujours fournir :
1. Le contexte : sur quelle tâche du planning tu es
2. Le but : qu'est-ce que tu veux obtenir
3. Ce que tu as déjà essayé
4. Le code concerné (coller, pas décrire)
5. L'erreur exacte (coller, pas décrire)

---

## Historique

- **v1.0 (avril 2026)** : planning V1 initial sur 8 semaines (Phase 0 sécu + Phase 1 fondations + Phase 2 analyses + Phase 3 IA)
- **v1.1 (26 avril 2026)** : Phase 1 entièrement refondue suite au débat architectural du 26 avril (cf. `STRAT_ARCHITECTURE.md`). Nouvelle séquence : S1 Périodes + design Sources, S2-3 Code Sources + Calculs, S4 Récup données. Phase 0 marquée comme réalisée. Bilan obligatoire en fin de S1 ajouté. 2 nouveaux anti-patterns ajoutés.
- **v1.2 (3 mai 2026)** : alignement avec `STRAT_ARCHITECTURE.md` v1.1. Section « État au 03/05/2026 » ajoutée (constat factuel de l'avancement, pas de mesure de retard). Sprint Migration data layer introduit en sous-section de Phase 1, avec découpage en 7 étapes. Section migration Sources L113-150 v1.1 réécrite pour cohérence avec §Décision #5 (sources amont API Popina + KS2, frontière au 15/01/2025, critère convergence 3 niveaux, `paiements_caisse` intégré). 2 puces obsolètes du « Design Sources EN PARALLÈLE » de la Semaine 1 remplacées par un renvoi à la sous-section Sprint. Ambiguïté ✅ préventifs corrigée en `[ ]`/`[x]` explicites dans Critère de sortie Phase 1. Calendrier théorique conservé tel quel — on avance au rythme des sessions.
- **v1.3 (3 mai 2026)** : ajout section « Charges récurrentes » dans Phase 3 S8 avec découpage acompte V1 (`/previsions` 1-clic, ~4h) et complet V1.1 (tables + cron + onboarding multi-tenant, ~17h). Enrichissement de la ligne « Pas fait » Phase 3 dans §État pour expliciter cette feature manquante. Cf. `STRAT_CADRAGE.md` §6.5 pour le cadrage produit, `IRRITANTS_UX_V1.md` §B5 et §F16 pour les irritants tracés.

---

_Document vivant. À mettre à jour chaque vendredi soir avec le bilan de la semaine. Tout dépassement de plus de 20% sur une phase doit déclencher une discussion pour ajuster._
