# Plan d'attaque — Feature 1 : Explications de chiffres

Première feature IA à implémenter après le refactor multi-tenant. Simple en apparence, mais c'est elle qui valide toute l'architecture IA de Strat.

---

## Objectif

Permettre au restaurateur de taper sur une icône ✨ à côté de n'importe quel indicateur (CA, ticket moyen, food cost, etc.) pour obtenir une **explication contextuelle en 2-3 phrases**.

Exemple visuel :
```
CA Restaurant    ✨
5 114 € /jour moy.
```

Tap sur ✨ → pop-up :
> "Ton CA quotidien moyen cette semaine est 5% au-dessus de ton objectif. C'est porté par jeudi (6 200€), probablement lié à la canicule qui a boosté les plats froids."

---

## Prérequis techniques

Avant de coder cette feature, il faut que ces éléments soient en place :

- [x] Refactor multi-tenant terminé (`parametre_id` partout + RLS)
- [x] Table `sources` avec canal Restaurant/Plateformes
- [ ] Table `ia_usage` (tracking coûts)
- [ ] Table `ia_explications_cache` (cache des explications)
- [ ] Middleware d'appel aux modèles Claude
- [ ] Système de tier Premium (pour gater la feature)

Les deux dernières lignes peuvent être codées pendant ce chantier, pas avant.

---

## Architecture de la feature

### Table `ia_explications_cache`

```sql
create table ia_explications_cache (
  id uuid primary key default gen_random_uuid(),
  parametre_id uuid not null references parametres(id) on delete cascade,
  indicateur text not null,        -- 'ca_total', 'ticket_moyen', 'food_cost', etc.
  periode text not null,           -- 'hier', 'semaine', 'mois', etc.
  contexte_hash text not null,     -- hash des inputs pour invalider le cache
  explication text not null,
  modele text not null,            -- 'claude-haiku-4-5-20251001'
  tokens_input integer,
  tokens_output integer,
  cout_estime_eur numeric(10,6),
  created_at timestamptz default now(),
  expires_at timestamptz not null, -- cache valide 24h
  unique(parametre_id, indicateur, periode, contexte_hash)
);

create index on ia_explications_cache (parametre_id, expires_at);
```

### Table `ia_usage` (tracking global)

```sql
create table ia_usage (
  id uuid primary key default gen_random_uuid(),
  parametre_id uuid not null references parametres(id) on delete cascade,
  feature text not null,           -- 'explications', 'inbox', 'brief', 'chat'
  modele text not null,
  tokens_input integer not null,
  tokens_output integer not null,
  cout_estime_eur numeric(10,6) not null,
  duree_ms integer,
  succes boolean default true,
  erreur text,
  created_at timestamptz default now()
);

create index on ia_usage (parametre_id, created_at desc);
create index on ia_usage (feature, created_at desc);
```

### Route API : `/api/ia/explication`

```
POST /api/ia/explication
Body: {
  indicateur: 'ca_total' | 'ticket_moyen' | 'food_cost' | 'seuil' | 'frequentation',
  periode: 'hier' | 'semaine' | 'mois'
}

Response: {
  explication: string,
  genere_le: timestamp,
  cache_hit: boolean
}
```

Logique :
1. Vérifier que le client est Premium. Sinon 403.
2. Vérifier le cache via `contexte_hash`. Si hit valide → retour direct.
3. Sinon :
   a. Charger les données contextuelles (valeurs actuelles + historique + paramètres)
   b. Construire le prompt
   c. Appeler Haiku
   d. Sauvegarder en cache + en `ia_usage`
   e. Retourner l'explication

---

## Construction du prompt

### Prompt système (fixe, réutilisable)

```
Tu es l'assistant financier de Strat, un outil de pilotage pour restaurateurs indépendants français.

Ton rôle dans ce contexte : expliquer un indicateur chiffré au restaurateur en 2-3 phrases maximum.

RÈGLES STRICTES :
- Tutoie le restaurateur
- Français clair, zéro jargon technique ou comptable
- Chaque affirmation chiffrée doit venir des données fournies, jamais inventée
- Si les données sont insuffisantes, dis-le honnêtement
- Utilise un vocabulaire de certitude explicite :
  * "certain" pour les faits mathématiques
  * "probablement" pour les patterns clairs
  * "peut-être" pour les hypothèses
- Pas de généralités vides ("continue tes efforts", "c'est important de...")
- Pas de conseils hors de ton domaine (juridique, RH, marketing avancé)

FORMAT de réponse :
- 2-3 phrases
- Phrase 1 : constat chiffré
- Phrase 2 : mise en contexte (comparaison historique ou vs objectif)
- Phrase 3 (optionnelle) : hypothèse d'explication
```

### Prompt utilisateur (dynamique selon indicateur)

Exemple pour CA Total :

```
Indicateur : CA Total
Période : Cette semaine

Données actuelles :
- CA semaine en cours : 35 798 €
- CA moyen quotidien : 5 114 €
- Nombre de jours : 7

Objectif :
- Objectif CA hebdomadaire : 31 500 €
- Taux d'atteinte : 113%

Historique de référence :
- CA moyen 4 dernières semaines : 33 200 €
- Meilleur jour de la semaine : jeudi (6 200 €)
- Pire jour : lundi (3 950 €)

Contexte restaurant :
- Type : snack/fast-food
- Fermé le : aucun jour
- Événement local connu : canicule sur Montpellier depuis 3 jours

Explique ce CA au restaurateur.
```

### Résultat attendu (exemple)

> "Ton CA de la semaine est à 35 798€, soit 13% au-dessus de ton objectif hebdo. C'est 2 600€ de mieux que la moyenne de tes 4 dernières semaines. Jeudi a particulièrement performé avec 6 200€, probablement porté par la canicule qui a boosté les plats froids."

---

## Indicateurs à supporter en V1

### Indicateurs principaux (implémentation immédiate)

| Indicateur | Clé | Données clés à passer |
|---|---|---|
| CA Total | `ca_total` | CA période, objectif, moyenne historique, meilleur/pire jour |
| CA Restaurant | `ca_restaurant` | Même + breakdown vs plateformes |
| CA Plateformes | `ca_plateformes` | Même + breakdown par plateforme |
| Ticket moyen | `ticket_moyen` | Valeur actuelle, objectif, évolution |
| Fréquentation | `frequentation` | Nb commandes, moyenne historique |
| Food cost | `food_cost` | Valeur %, objectif, évolution, catégories qui dérivent |
| Seuil de rentabilité | `seuil` | Atteint ou non, écart, projection |

### Périodes supportées

- `hier` : données d'hier uniquement
- `semaine` : 7 derniers jours
- `mois` : mois en cours
- `6mois` et `annee` : pour les indicateurs pertinents (pas food cost par exemple)

---

## Garde-fous spécifiques à cette feature

### Garde-fou 1 — Données insuffisantes
Si moins de 14 jours d'historique sur le restaurant, l'explication mentionne explicitement la limite :
> "Je n'ai que 10 jours de données pour le moment, donc je ne peux pas encore te donner de comparaison historique fiable. Ton CA actuel est de X€."

### Garde-fou 2 — Valeur nulle ou absurde
Si la donnée est à 0 ou ressemble à une erreur :
> "Les données sur cet indicateur me semblent incomplètes. Vérifie que ton import du jour a bien fonctionné."

### Garde-fou 3 — Coût maximum par client
Rate limiting : max 50 explications par jour et par client Premium (largement suffisant en usage normal). Au-delà, message : "tu as atteint ta limite d'explications pour aujourd'hui."

### Garde-fou 4 — Fallback en cas d'erreur Claude
Si l'API Claude échoue, on affiche une explication "statique" générée côté serveur à partir des données (sans IA) :
> "Ton CA est de 5 114€/jour en moyenne cette semaine, au-dessus de ton objectif de 4 500€."

Moins riche, mais jamais de page cassée.

---

## Coûts estimés

### Par appel
- Prompt système : ~200 tokens
- Prompt utilisateur : ~300 tokens (varie selon indicateur)
- Réponse : ~100 tokens
- **Total par appel** : ~600 tokens

### Prix Haiku (tarif avril 2026)
À vérifier au moment de l'implémentation, mais ordre de grandeur :
- Input : ~1 $/million tokens
- Output : ~5 $/million tokens
- **Coût par appel** : ~0.001€

### Volume par client Premium
- 5 indicateurs × 3 périodes = 15 explications pré-calculées/jour
- + ~10 explications à la demande par jour (estimation)
- **~25 appels/jour × 30 jours = 750 appels/mois**
- **Coût mensuel par client** : ~0.75€ pour les explications

Avec cache 24h sur les pré-calculés, on réduit à **~0.30-0.50€/mois par client**.

---

## Plan de développement (ordre recommandé)

### Étape 1 — Infrastructure (2-3h)
1. Créer les tables `ia_explications_cache` et `ia_usage`
2. Créer le middleware `lib/ai.js` avec fonction `callClaude(options)` qui gère :
   - Appel API Anthropic
   - Tracking automatique dans `ia_usage`
   - Gestion des erreurs avec fallback
3. Route `/api/ia/explication` (squelette)

### Étape 2 — Premier indicateur : CA Total (2h)
1. Fonction `buildContextCA(parametre_id, periode)` qui rassemble les données
2. Fonction `buildPromptCA(contexte)` qui génère le prompt
3. Route complète avec cache
4. Tester sur ton propre compte

### Étape 3 — UI minimaliste (2h)
1. Composant `<ExplicationButton indicateur="ca_total" periode="semaine" />`
2. Icône ✨ animée
3. Modal qui s'ouvre avec l'explication
4. Gestion des états : loading, error, success

### Étape 4 — Étendre aux autres indicateurs (3-4h)
- Un indicateur à la fois
- Réutiliser le même pattern
- Tester pour chaque

### Étape 5 — Pré-calcul nocturne (2h)
- Cron qui tourne chaque nuit après le cron existant
- Génère les explications des indicateurs principaux pour chaque client Premium
- Pour que l'UX soit instantanée au réveil du gérant

### Étape 6 — Gating Premium (1h)
- Middleware qui vérifie le tier du client
- UI qui masque ou tease la feature pour les Standard

**Total estimé** : 12-15h de dev concentré. Soit 2-3 jours réalistes.

---

## Tests à faire avant de lancer

### Tests fonctionnels
- [ ] Un client avec historique complet : explications riches et contextualisées
- [ ] Un client avec 5 jours de données : explications qui mentionnent la limite
- [ ] Un client avec données nulles : pas de crash, message honnête
- [ ] Crash API Claude : fallback statique
- [ ] Dépassement rate limit : message clair
- [ ] Cache : deuxième appel instantané
- [ ] Invalidation cache : quand les données changent

### Tests de qualité IA
- [ ] Pas d'invention de chiffres (contre-check manuel sur 20 explications)
- [ ] Pas de généralités vides
- [ ] Ton cohérent avec le persona IA défini
- [ ] Pas de jargon technique
- [ ] Respect du format 2-3 phrases

### Tests de coût
- [ ] Mesure réelle du coût sur 100 appels
- [ ] Comparaison avec l'estimation
- [ ] Ajustement du rate limit si besoin

---

## Métriques à suivre post-lancement

- **Usage** : % de clients Premium qui utilisent la feature, nb de taps/client/semaine
- **Coûts** : €/client/mois réel vs estimé
- **Qualité** : feedback utilisateur (✓ utile / ✗ pas utile sur chaque explication)
- **Performance** : temps de réponse moyen, taux de cache hit
- **Erreurs** : taux d'échec appel Claude, taux de fallback

Stocker ces métriques dans un dashboard admin simple dès le lancement.

---

_Document vivant. À mettre à jour au fur et à mesure de l'implémentation si des ajustements sont nécessaires._
