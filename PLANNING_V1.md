# Strat — Planning V1 (8 semaines)

_Version 1.1 — avril 2026_

Ce document fixe le plan d'exécution pour livrer la V1 de Strat. Il est opérationnel, pas stratégique. Pour les décisions produit, voir `STRAT_CADRAGE.md`. Pour les décisions architecturales, voir `STRAT_ARCHITECTURE.md`.

**Démarrage** : semaine du 28 avril 2026
**Livraison V1 testable** : semaine du 23 juin 2026
**Beta avec 2-3 clients** : semaine du 30 juin 2026
**Lancement commercial public (10 clients)** : septembre 2026

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

**Jeudi-Vendredi : Design Sources EN PARALLÈLE**- Schéma SQL des tables `sources` et `ventes_par_source` sur papier
- Validation avec Claude Code et Claude conversationnel
- Migration SQL écrite (mais **pas exécutée** en S1)
- Backfill plan détaillé : comment migrer `historique_ca.uber` + `entrees.source='uber_eats'` vers `ventes_par_source`
- Plan de cutover : ordre de migration des écritures (cron → admin → FAB)
- **Pas de code applicatif Sources cette semaine**

**Bilan vendredi** : décider si on continue parallèle en S2-3 ou si on prolonge S1 sur Périodes uniquement (cf. garde-fou Décision #3).

**Compétence 2 (en marchant)** : navigation code pendant la S1.

### Semaines 2-3 — Code Sources + Calculs
**Objectif S2-3** : table `sources` + `ventes_par_source` opérationnelles, `historique_ca` déprécié, calculs métier centralisés dans `lib/calculs/`.

**Code Sources (priorité 1)**

Semaine 2 :
- Créer table `sources` + seed Krousty (Restaurant + Uber Eats)
- Créer table `ventes_par_source` (vide)
- Backfill idempotent depuis `historique_ca.uber` et `entrees.source='uber_eats'`
- Tests SQL : vérifier que les totaux post-migration matchent les totaux pré-migration

Semaine 3 :
- Adapter le cron pour écrire dans `ventes_par_source`
- Migrer chaque page une par une pour lire depuis `ventes_par_source` :
  - `/dashboard` (Mon Business)
  - `/pl` (P&L)
  - `/previsions`
  - `/api/analyses`
  - `/api/historique`
- Suppression définitive de `historique_ca.uber` puis de la table `historique_ca` à terme
- Adapter `/admin/donnees`, `/admin/imports` pour les nouvelles tables

### Garde-fous opérationnels migration Sources

**Backfill idempotent + dry-run** :
- Avant la vraie migration, exécuter le script de backfill sur une copie de prod (snapshot Supabase)
- Vérifier que les totaux post-backfill matchent les totaux pré-backfill (CA brut Krousty avant = CA Krousty après)
- Le script doit pouvoir être rejoué sans créer de doublons (idempotence vérifiée)

**Stratégie dual-write** :
- Le cron écrit simultanément dans historique_ca (legacy) ET ventes_par_source (nouveau) pendant 3 jours minimum
- Pendant cette période, comparaison automatique des totaux des 2 modèles (alerter si divergence)
- Cutover : suppression de l'écriture dans historique_ca uniquement après 3 jours sans divergence

**Lecture seule sur /admin/donnees pendant la migration** :
- Bandeau "Migration en cours, édition désactivée temporairement"
- Bouton de modification grisé
- Réactivation post-cutover

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

- ✅ `lib/periods.js` couvre les 9 filtres avec timezone, tests verts
- ✅ `<PeriodFilter />` fonctionne avec 3 profils, intégré sur 5 pages
- ✅ `<HorizonFilter />` intégré sur Prévisions
- ✅ Table `sources` + `ventes_par_source` opérationnelles, `historique_ca.uber` supprimé
- ✅ Calculs métier centralisés dans `lib/calculs/`, plus de duplication 4×
- ✅ Helpers `lib/data/` utilisés par toutes les pages
- ✅ L'app est entièrement multi-tenant fonctionnelle (un nouveau client peut être ajouté sans toucher au code)
- ✅ Bug Uber Historique (`/api/analyses:84`) résolu par construction (pas de duplication possible)
- ✅ Bug DST cron fixé
- ✅ Vocabulaire UI proscrit éliminé (MTD, YTD, 1S, 1M, 6M, 1A)

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

---

_Document vivant. À mettre à jour chaque vendredi soir avec le bilan de la semaine. Tout dépassement de plus de 20% sur une phase doit déclencher une discussion pour ajuster._
