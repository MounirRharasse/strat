# Strat — Planning V1 (8 semaines)

_Version 1.0 — avril 2026_

Ce document fixe le plan d'exécution pour livrer la V1 de Strat. Il est opérationnel, pas stratégique. Pour les décisions produit, voir `STRAT_CADRAGE.md`.

**Démarrage** : semaine du 28 avril 2026
**Livraison V1 testable** : semaine du 23 juin 2026 (~8 semaines)
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

**Compétence 1 — Console navigateur (30 min, une fois)**
Ouvrir F12, onglet Console, lire et comprendre un message d'erreur, le copier proprement pour partager.

**Compétence 2 — Navigation code (au fil du dev, 2-3 sessions)**
Savoir localiser un bug : FAB ? route API ? base de données ? UI ? Comprendre la structure du projet Next.js.

**Compétence 3 — SQL basique dans Supabase (20 min, une fois)**
Accéder au SQL Editor, faire un SELECT simple, comprendre un résultat, inspecter une table.

---

## Phase 0 — Semaine 0 : Sécurisation et setup (3-5 jours)

**Objectif** : sécuriser l'existant et poser l'infrastructure de travail avant toute ligne de code nouvelle.

### Tâches

**Sécurité (non-négociable, à faire en priorité)**

- [ ] Régénérer le mot de passe `krousty2026` partout où il est utilisé
- [ ] Régénérer `NEXTAUTH_SECRET` (nouveau random 64+ caractères)
- [ ] Régénérer `CRON_SECRET`
- [ ] Révoquer la clé Popina actuelle, en générer une nouvelle
- [ ] Vérifier que TOUTES les env vars sont dans Vercel et pas dans le code
- [ ] Purger l'historique Git des credentials exposés (BFG Repo Cleaner ou git filter-repo)
- [ ] Force push après purge
- [ ] Vérifier que le repo GitHub est privé
- [ ] Activer 2FA sur GitHub, Supabase, Vercel, Anthropic, Popina

**Setup outil de dev**

- [ ] Installer Claude Code (`npm install -g @anthropic-ai/claude-code`)
- [ ] Configurer avec ton repo local `~/strat`
- [ ] Créer une branche `v1-refactor` sur git
- [ ] Première prise en main : poser une question simple à Claude Code sur le code existant

**Documents de référence**

- [ ] Commiter `STRAT_CADRAGE.md` à la racine du repo
- [ ] Commiter `STRAT_IA.md` à la racine du repo
- [ ] Commiter ce `PLANNING_V1.md` à la racine du repo
- [ ] Relire le cadrage à tête reposée, noter questions/incohérences

**Compétence 1 — Console navigateur**

- [ ] 30 min avec Claude : ouvrir F12 sur strat-b8et.vercel.app, faire une action qui déclenche une erreur, lire le message, comprendre
- [ ] Se créer un réflexe : dès qu'il y a un problème, ouvrir F12 avant de poser la question

### Critère de sortie Phase 0

Tous les items ci-dessus cochés. Credentials sécurisés confirmés. Claude Code fonctionne. Tu sais ouvrir la console navigateur.

---

## Phase 1 — Semaines 1 à 3 : Les fondations (72h total)

**Objectif** : reconstruire le socle multi-tenant proprement. Sans ça, rien ne tient.

### Semaine 1 — Multi-tenant et sources (24h)

**Lundi-Mardi : Migration multi-tenant**

- [ ] Écrire la migration SQL (création table `restaurants` ou extension de `parametres`, ajout `parametre_id` partout)
- [ ] Script de backfill : toutes les données existantes → parametre_id de Mounir
- [ ] Tester en local d'abord (pas en prod)
- [ ] Appliquer en prod via Supabase SQL Editor (**faire un backup avant**)
- [ ] Vérifier que tout marche après migration

**Mercredi : RLS Supabase**

- [ ] Activer RLS sur toutes les tables
- [ ] Policies `SELECT` / `INSERT` / `UPDATE` / `DELETE` avec filter `parametre_id`
- [ ] Tester qu'un utilisateur non connecté ne voit rien
- [ ] Tester qu'un utilisateur connecté ne voit QUE ses données

**Jeudi : Table `sources`**

- [ ] Création table `sources` selon schéma cadrage
- [ ] Seed initial pour Mounir : source Restaurant + source Uber Eats
- [ ] Migration : colonne `uber` de `historique_ca` → table `ventes_par_source`

**Vendredi : Refactor FAB pour sources dynamiques**

- [ ] Le FAB charge les sources via `/api/sources` au lieu de la constante hardcodée
- [ ] Plus de mention "Foxorder" nulle part
- [ ] Test : créer une entrée pour chaque source

**Compétence 2 (en marchant)** : pendant cette semaine, tu apprends à naviguer entre `components/`, `app/api/`, `lib/` et à localiser où vit chaque morceau.

### Semaine 2 — Filtres et timezone (24h)

**Lundi-Mardi : `lib/periods.js`**

- [ ] Installer `date-fns` et `date-fns-tz`
- [ ] Créer la lib centralisée avec les 9 filtres
- [ ] Chaque fonction prend un timezone en paramètre (défaut Europe/Paris)
- [ ] Tests unitaires sur chaque filtre
- [ ] Remplacer tous les `new Date()` et `Date.now()` éparpillés par cette lib

**Mercredi-Jeudi : Refactor UI filtres**

- [ ] Composant `<PeriodFilter />` réutilisable avec les 9 options
- [ ] Affichage du sous-titre discret avec les dates réelles
- [ ] Toggle "Comparer à la période précédente"
- [ ] Logique de comparaison intelligente (même durée écoulée)

**Vendredi : Toggle Restaurant/Plateformes dans Détail CA**

- [ ] Dans `DrillDown.js`, ajouter le state `canal`
- [ ] Toggle au-dessus du graphe
- [ ] Recalcul des valeurs selon canal sélectionné
- [ ] Graphe qui se met à jour

### Semaine 3 — Paramètres et inventaire (24h)

**Lundi-Mercredi : Écran Paramètres complet**

Sections à livrer :
- [ ] Infos générales (nom resto, fuseau horaire)
- [ ] Sources (CRUD : ajouter/modifier/désactiver)
- [ ] Objectifs (CA mensuel, ticket moyen min, food cost cible/max)
- [ ] Jours d'ouverture (toggle lundi→dimanche)
- [ ] Commissions par source
- [ ] Fournisseurs récurrents (CRUD)

**Jeudi : Inventaire simple**

- [ ] Table `inventaires` + route API
- [ ] Écran "Inventaires" avec historique
- [ ] Formulaire de saisie minimaliste (date + valeur + note)
- [ ] Calcul food cost ajusté quand 2 inventaires encadrent une période
- [ ] UI "food cost estimé" vs "food cost exact"

**Vendredi : Polish et tests bout en bout**

- [ ] Test complet : créer un nouveau compte, onboard un resto, saisir des données, voir les KPIs
- [ ] Corriger les bugs UI trouvés
- [ ] Valider que la migration multi-tenant ne casse rien

**Compétence 3 (en fin de semaine 3)** : 20 min sur Supabase SQL Editor, apprendre à faire `SELECT * FROM transactions WHERE ...` pour inspecter.

### Critère de sortie Phase 1

- Le multi-tenant fonctionne (RLS testée)
- Les sources sont dynamiques (fini "uber" hardcodé)
- Les 9 filtres de période marchent avec la bonne timezone
- Le toggle Restaurant/Plateformes est fonctionnel
- L'écran Paramètres permet tout ce que le client doit configurer
- L'inventaire simple marche
- Tu sais ouvrir la console, naviguer le code, faire du SQL basique

---

## Phase 2 — Semaines 4 à 5 : Analyses et données (32h total)

**Objectif** : les 4 vues d'analyse croisée et l'import CSV universel.

### Semaine 4 — Les 4 vues d'Analyses (16h)

**Lundi : Route API d'agrégation**

- [ ] `/api/analyses/fournisseurs?since=X&until=Y` : GROUP BY fournisseur_nom
- [ ] `/api/analyses/personnel?since=X&until=Y` : GROUP BY bénéficiaire (extrait du libellé)
- [ ] `/api/analyses/categories?since=X&until=Y` : GROUP BY sous_categorie
- [ ] `/api/analyses/sources?since=X&until=Y` : GROUP BY source

Toutes ces routes filtrent par `parametre_id` via RLS.

**Mardi : UI tableau custom simple**

- [ ] Composant `<AnalyseTable />` réutilisable
- [ ] Colonnes : Libellé + Montant période + Montant M-1 + Variation % + Moyenne 6 mois
- [ ] Tri par montant décroissant par défaut
- [ ] Clic sur ligne → détail (plus tard, juste la structure)

**Mercredi-Jeudi : Intégration des 4 vues**

- [ ] Page `/analyses` avec onglets : Fournisseurs / Personnel / Catégories / Sources
- [ ] Chaque onglet utilise `<AnalyseTable />` avec sa route API
- [ ] `<PeriodFilter />` en haut pour choisir la période

**Vendredi : Préparation intégration IA**

- [ ] Placeholder icône ✨ sur chaque ligne du tableau (non fonctionnel pour l'instant)
- [ ] Tests avec tes vraies données

### Semaine 5 — Import CSV intelligent (16h)

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

## Phase 3 — Semaines 6 à 8 : IA et finalisation (72h total)

**Objectif** : les 4 features IA + onboarding + préparation lancement.

### Semaine 6 — Infrastructure IA + Feature 1 (24h)

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

**Vendredi : Pédagogie et tests**

- [ ] Aide contextuelle "?" sur chaque indicateur (qu'est-ce que, comment, pourquoi)
- [ ] Test qualité IA : 20 explications générées, check manuel du ton et de la justesse
- [ ] Ajustement prompts si nécessaire

### Semaine 7 — Features IA 2 et 3 (24h)

**Lundi-Mardi : Feature 2 — Inbox intelligente**

- [ ] Moteur de détection en code classique (dérives food cost, anomalies CA, etc.)
- [ ] Cron nocturne qui émet des signaux dans `ia_signaux`
- [ ] Contextualiseur IA qui rédige le message à partir du signal
- [ ] Écran "Notifications" avec les messages pushés

**Mercredi-Vendredi : Feature 3 — Brief du lundi**

- [ ] Cron lundi 7h du matin
- [ ] Sonnet avec function calling pour accéder aux données
- [ ] Structure du brief (constats + vigilance + action + astuce pédagogique)
- [ ] Affichage dans l'inbox + email via Resend (création compte Resend)

### Semaine 8 — Feature IA 4 + Onboarding + Préparation lancement (24h)

**Lundi-Mercredi : Feature 4 — Chat conversationnel**

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
- [ ] Onboarder chacun avec accompagnement personnalisé (2-3h par client)
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

### Ce qui ne doit PAS arriver

- Coder un truc hors cadrage parce que "ce serait cool"
- Sauter la phase de sécurisation (Phase 0) pour gagner du temps
- Vendre à un client avant la fin de la Phase 3
- Copier-coller du code sans comprendre ce qu'il fait
- Déployer en prod un vendredi soir

---

## Ressources recommandées

### Pour les 3 compétences minimales

- **Console navigateur** : la vidéo "Chrome DevTools Crash Course" sur YouTube (30 min)
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

_Document vivant. À mettre à jour chaque vendredi soir avec le bilan de la semaine. Tout dépassement de plus de 20% sur une phase doit déclencher une discussion pour ajuster._
