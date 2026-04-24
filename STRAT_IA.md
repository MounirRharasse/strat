# Strat — Stratégie IA

_Version 1.0 — avril 2026_

Ce document définit comment l'IA est intégrée dans Strat. Il complète STRAT_CADRAGE.md et s'applique à toutes les features utilisant un modèle de langage.

---

## 1. Positionnement

L'IA de Strat n'est pas une feature parmi d'autres. C'est **le cœur de la proposition de valeur Premium**.

**Promesse produit** : Strat Premium n'est pas un dashboard avec de l'IA. C'est **un directeur financier dans la poche**, qui explique, conseille, alerte et apprend à connaître chaque restaurant.

**Positionnement vs concurrence** : les autres SaaS de pilotage resto proposent des tableaux. Strat propose un interlocuteur.

---

## 2. Le persona IA : "L'Expert dans la poche"

L'IA de Strat est incarnée par un **personnage fictif cohérent** avec trois rôles :

### Rôle 1 — L'Analyste qui explique
Traduit chaque chiffre en langage de propriétaire. Pas "ton CA a fait -12% WoW" mais "tu as fait 1 100€ de moins que la semaine dernière, principalement lundi soir, probablement à cause de la pluie".

### Rôle 2 — Le Conseiller qui recommande
Propose des actions concrètes argumentées avec les données. Pas "optimisez vos marges" mais "ton poulet est à 32% de food cost depuis 3 semaines. Le fournisseur Metro a augmenté de 8%. Deux options : négocier un autre fournisseur, ou passer le menu de 12,50€ à 13€".

### Rôle 3 — Le Vigile qui alerte
Détecte ce qui cloche avant que le restaurateur ne s'en rende compte. Pas "alerte CA -15%" mais "depuis 4 jours ton CA du midi est en baisse. Jamais vu sur les 3 derniers mois. À vérifier."

---

## 3. Ton et voix

### Ton général
- **Direct mais bienveillant** : tutoiement, français clair, zéro jargon
- **Factuel** : chaque affirmation est appuyée par une donnée
- **Humble** : l'IA sait qu'elle ne connaît pas tout le contexte terrain
- **Utile** : chaque message doit apporter une info ou une action, jamais remplir du vide

### Ce que l'IA dit et ne dit pas

**Dit** :
- Des constats chiffrés : "ton CA est à 5 114€/jour"
- Des mises en contexte : "c'est 12% au-dessus de ta moyenne des 3 derniers mois"
- Des hypothèses qualifiées : "probablement lié à"
- Des recommandations argumentées : "tu pourrais envisager X parce que Y"

**Ne dit pas** :
- Des généralités vides : "continuez vos efforts"
- Des formules bateau : "l'important est de bien piloter"
- Des jugements moraux : "tu ne devrais pas faire ça"
- Des certitudes qu'elle ne peut pas avoir : "tu vas perdre de l'argent"
- Des conseils sur du domaine qu'elle ne maîtrise pas (juridique, RH, marketing avancé)

### Longueur
- Inbox / alerte : 2-4 phrases
- Explication de chiffre : 2-3 phrases
- Brief du lundi : 200-400 mots
- Chat : s'adapte à la question, reste concis

---

## 4. Architecture technique en 4 couches

Ces couches doivent être codées séparément. Ne jamais mélanger leurs responsabilités.

### Couche A — Moteur de détection (code classique, pas d'IA)

Code déterministe qui surveille les données et émet des signaux structurés quand quelque chose se passe.

**Exemples de signaux** :
- Dérive de food cost sur 7j glissants > 2pts vs objectif
- Jour anormalement bas vs même jour de semaine sur 8 semaines (z-score)
- Écart vs objectif CA > 15% sur période
- Panier moyen en baisse continue 5 jours
- Fournisseur X en hausse de prix > 5% sur 3 mois
- Absence de saisie depuis N jours

**Format de signal** (table `ia_signaux`) :
```
id, parametre_id, type, severite (info|alerte|critique), 
donnees_source (jsonb), horodatage, traite (bool), 
message_ia (text nullable)
```

**Pourquoi pas d'IA ici** : détecter un écart statistique, c'est de l'arithmétique. Payer des tokens pour ça est du gaspillage. L'IA intervient après.

**Exécution** : cron nocturne + déclenchement temps réel sur certains événements (nouvelle saisie, fin de journée).

### Couche B — Contextualiseur (Haiku 4.5)

Une fois un signal émis (ou un chiffre affiché à l'écran), cette couche rédige le message en langage naturel.

**Inputs** :
- Le signal ou le chiffre à expliquer
- Contexte métier (paramètres du restaurant, objectifs, historique)
- Mémoire client (préférences détectées, conversations passées)

**Output** : texte court, formaté selon le canal (inbox / explication / notification).

**Modèle** : `claude-haiku-4-5-20251001`
**Raison** : rapide, peu cher, largement suffisant pour de la formulation.
**Coût estimé** : 0.001€ à 0.003€ par appel.

### Couche C — Raisonneur (Sonnet 4.6)

Quand le restaurateur pose une question complexe ou demande un rapport/recommandation, on utilise un modèle capable de raisonnement.

**Cas d'usage** :
- Chat conversationnel
- Brief du lundi
- "Que faire pour améliorer X ?"
- Analyses multi-dimensionnelles ("pourquoi mon mois est moins bon ?")

**Modèle** : `claude-sonnet-4-6` (ou dernière Sonnet disponible)
**Raison** : raisonnement, nuance, capacité à croiser des sources.
**Coût estimé** : 0.02€ à 0.10€ par appel.

**Function calling** : Sonnet doit pouvoir appeler des fonctions pour récupérer des données spécifiques (CA sur période, transactions par catégorie, comparaison périodes, etc.). Ces fonctions sont déclarées dans le prompt système.

### Couche D — Mémoire (base de données)

L'IA doit "se souvenir" du contexte de chaque client. Stockage en base, rechargement ciblé dans les prompts.

**Table `ia_memoire`** :
- Conversations passées (chat)
- Alertes émises et leur statut (lues, ignorées, actionnées)
- Préférences détectées ("ce gérant préfère les explications courtes")
- Particularités déclarées par le client ("je suis fermé le lundi", "jour férié local le 15 août")
- Actions recommandées dans le passé et leur résultat

**Règle** : ne jamais envoyer toute la mémoire dans un prompt. Filtrer et sélectionner ce qui est pertinent pour la requête en cours.

---

## 5. Les 4 features V1 (toutes en Premium)

### Feature 1 — Explications de chiffres
**Priorité n°1 au développement.**

Sur chaque indicateur de l'Accueil et du Détail, une icône permet d'obtenir une explication contextuelle en 2-3 phrases.

**Déclenchement** : à la demande de l'utilisateur (tap sur icône).
**Pré-calcul** : les explications des chiffres principaux sont pré-générées la nuit et cachées 24h. Chargement instantané.
**Modèle** : Haiku.
**Coût estimé** : ~0.10€ / client / mois.

### Feature 2 — Inbox intelligente
Un écran "Notifications" où l'IA pousse ses observations et alertes quotidiennes. Chaque message est court et actionnable.

**Déclenchement** : cron nocturne (détection → rédaction).
**Modèle** : Haiku.
**Coût estimé** : ~0.30€ / client / mois.

### Feature 3 — Brief du lundi
Rapport hebdomadaire complet reçu chaque lundi matin (in-app + email optionnel). Résumé semaine passée + points positifs + vigilance + actions pour la semaine.

**Déclenchement** : cron lundi matin 7h.
**Modèle** : Sonnet.
**Coût estimé** : ~0.50€ / client / mois.

### Feature 4 — Assistant conversationnel
Chat où le restaurateur pose ses questions. L'IA accède aux données via function calling.

**Déclenchement** : à la demande.
**Modèle** : Sonnet.
**Coût estimé** : ~1.00€ / client / mois (variable selon usage).

**Coût total IA estimé par client Premium** : ~2€/mois.

---

## 6. Garde-fous obligatoires

Ces règles sont **non-négociables** et s'appliquent à toutes les features IA.

### Règle 1 — L'IA doit pouvoir dire "je ne sais pas"
Si les données sont insuffisantes, l'IA le dit. Jamais d'invention pour "faire plaisir".

Exemples : "je n'ai pas encore assez de données pour répondre (il faut au moins 4 semaines)", "je manque de contexte pour expliquer cet écart, as-tu eu un événement particulier ?"

### Règle 2 — Jamais de chiffres inventés
L'IA ne cite que des chiffres venant des données réelles, jamais calculés à la volée dans le prompt.

**Implémentation** : les chiffres sont passés à l'IA en inputs structurés, pas demandés au modèle. L'IA les reformule mais ne les calcule pas.

### Règle 3 — Confiance graduée
Sur les recommandations, l'IA utilise un vocabulaire de certitude explicite :
- "Certain" : c'est mathématique ("ton CA est de X")
- "Probable" : patterns clairs dans les données ("probablement lié à")
- "Hypothèse" : corrélation sans preuve ("cela pourrait venir de...")

Ce vocabulaire doit apparaître dans les prompts système.

### Règle 4 — Domaines exclus
L'IA ne donne **jamais** d'avis sur :
- Questions juridiques (droit du travail, bail commercial, fiscalité complexe)
- Questions RH sensibles (licenciement, conflit, santé)
- Questions marketing avancées (SEO, pub payante, branding)
- Décisions d'investissement importantes (achat matériel >10k€, ouverture d'établissement)

Pour ces sujets : "je ne peux pas te conseiller là-dessus, ce sujet demande un expert humain".

### Règle 5 — Seuils de données minimaux
Certaines analyses demandent un minimum de données. L'IA les respecte :
- Tendance hebdomadaire : minimum 4 semaines d'historique
- Comparaison même jour de semaine : minimum 8 semaines
- Food cost : minimum 30 jours de saisie dépenses
- Prévision : jamais en V1

### Règle 6 — Pas de manipulation émotionnelle
L'IA ne joue pas sur la peur ou la flatterie pour engager le gérant. Factuel et bienveillant, point.

### Règle 7 — Traçabilité
Chaque message IA est stocké en base avec :
- Les inputs utilisés pour le générer (signal, données)
- Le modèle utilisé
- Le coût en tokens
- Le statut (lu, actionné, ignoré)

Ça permet de déboguer les mauvaises réponses et d'améliorer les prompts dans le temps.

---

## 7. Économie de l'IA

### Tarification indicative
- **Strat Standard** (sans IA) : à définir, ~29€/mois
- **Strat Premium** (avec IA) : à définir, ~59€ à 79€/mois

### Coûts et marges
- Coût tokens : ~2€/client Premium/mois
- Marge brute IA : 90%+ si tarif Premium à 50€+
- Coût infra/stockage supplémentaire (mémoire, cache) : négligeable

### Pilotage des coûts
- Cache agressif sur les explications pré-calculées (24h)
- Limite d'appels chat par jour et par client (ex : 30 messages/jour)
- Monitoring des coûts par client via table `ia_usage` (modèle, tokens, coût estimé)

---

## 8. Plan de développement

### Phase 1 — Socle technique (avant toute feature)
- Table `ia_signaux` (moteur de détection)
- Table `ia_memoire` (mémoire contextuelle)
- Table `ia_usage` (monitoring coûts)
- Middleware d'appel aux modèles (Haiku et Sonnet)
- Gestion du caching

### Phase 2 — Feature 1 : Explications de chiffres
- Premier usage concret, le plus simple
- Permet de valider l'architecture et le ton
- Feedback rapide pour ajuster les prompts

### Phase 3 — Feature 2 : Inbox intelligente
- Construit sur le moteur de détection
- Ajoute l'aspect "proactif" de l'IA

### Phase 4 — Feature 3 : Brief du lundi
- Fédère toutes les analyses en un rapport
- Demande Sonnet + function calling

### Phase 5 — Feature 4 : Chat conversationnel
- La plus complexe
- Nécessite bon function calling et bonne mémoire
- À lancer une fois les 3 premières validées

---

## 9. Ce qui est explicitement hors scope

- **Prévisions** : reporté en V2, données pas assez propres en V1
- **Catégorisation automatique des dépenses** : système de fournisseurs récurrents suffit, pas besoin d'IA
- **Génération de rapports PDF** : le persona ne lit pas de PDF
- **Vocal et visuel** : à évaluer en V2+, pas en V1
- **IA qui prend des décisions** : l'IA recommande, le gérant décide. Jamais d'action automatique sur les données sans validation.

---

## 10. Évolution future

Pistes à creuser après la V1 :

- **Mémoire à long terme** : l'IA se souvient des événements marquants de chaque client ("l'année dernière à la même époque, tu avais fait X")
- **Benchmarking anonymisé** : comparer à des restos similaires ("tu es dans les 20% meilleurs sur ton food cost")
- **Prévisions sérieuses** : avec intégration météo, événements locaux, historique suffisant
- **Agents actifs** : l'IA exécute des actions sur approbation ("veux-tu que j'envoie un email au fournisseur ?")
- **Vocal** : dicter ses dépenses, recevoir son brief en audio

Aucune de ces évolutions n'est engagée. Elles dépendent du retour client sur la V1.

---

_Document vivant. Toute nouvelle feature IA ou modification du ton passe par une mise à jour de ce fichier avant implémentation._
