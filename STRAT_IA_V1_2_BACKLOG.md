# Strat IA V1.2 — Backlog d'évolution

_Document vivant — capturé le 6 mai 2026, post-livraison Charges Récurrentes V1.1._

Ce document capture les pistes d'évolution IA discutées entre Mounir et Claude. À utiliser comme matériau de cadrage V1.2 quand l'équipe sera prête.

**Ne pas confondre** :
- Ce document = backlog idées IA (matériau brut)
- `STRAT_IA.md` = doc produit IA actuel (4 features V1)
- `STRAT_CADRAGE.md` = décisions produit structurelles
- `IRRITANTS_UX_V1.md` = irritants UX terrain

---

## 1. État de l'IA Strat post-V1.1

| Feature | Modèle | Couche | Trigger |
|---|---|---|---|
| Insight quotidien | Haiku 4.5 | Détection + Contextualiseur | Cron 04:00 |
| Brief lundi | Sonnet 4.6 | Raisonneur multi-input | Cron 06:00 lundi |
| Anomalies transactions | Haiku | Contextualiseur | User-init |
| Chat conversationnel | Sonnet + 25 chat-functions | Raisonneur + Mémoire | User-init |
| Charges récurrentes Layer 2 | Haiku batch | Contextualiseur (libellés) | User trigger /previsions |

**Volontairement absent V1** : prévisions, action automatique, cross-tenant.

---

## 2. Dix axes d'évolution V1.2 (cadrage initial 6/05/2026)

| # | Axe | Impact | Effort | Risque |
|---|---|---|---|---|
| 1 | **Météo** — croiser CA × pluie/soleil | Fort | Moyen | Bas |
| 2 | **Calendrier événements** — jours fériés, vacances scolaires, matchs locaux | Fort | Moyen | Bas |
| 3 | **Causalité multi-data** — patterns émergents jour×météo×promo | Très fort | Lourd | Moyen |
| 4 | **Prévisions saisonnières** — *"tu vas faire 145k en août"* | Fort | Lourd | **Élevé** (perte confiance si erreur) |
| 5 | **Coaching proactif** — l'IA soulève des opportunités sans qu'on demande | Très fort | Lourd | Moyen |
| 6 | **Mémoire long terme** — faits persistés, personnalisation au fil du temps | Moyen | Léger | Bas |
| 7 | **Multi-modal** — OCR factures, voice → action | Fort | Moyen | Moyen |
| 8 | **Benchmark cross-tenant** — *"food cost top 25% des restos similaires"* | Très fort | Lourd | Élevé (RGPD, business model) |
| 9 | **Plans d'action multi-step** — *"food cost dérive → 3 actions"* | Fort | Lourd | Moyen |
| 10 | **Apprentissage préférences** — l'IA s'adapte aux refus récurrents | Moyen | Moyen | Bas |

---

## 3. Quick wins V1.2 prioritaires

Ranking par rentabilité (faible effort + impact + faible risque) :

1. **Axe 6 — Mémoire long terme** : extension `ia_memoire`, faits structurés. Améliore tout le reste.
2. **Axe 1 — Météo** : 1 API tierce, croisée dans brief lundi et insights.
3. **Axe 2 — Calendrier événements** : jours fériés (gratuit), vacances scolaires (gratuit), événements locaux saisis manuellement.
4. **Axe 7 — OCR factures** : test sur 50 factures Krousty avant rollout.
5. **Axe 10 — Apprentissage préférences** : invisible, améliore satisfaction long terme.

---

## 4. Nouvelles idées (6/05 soir)

### 4.1 — TODO matinale à l'ouverture
**Concept** : à l'ouverture de l'app le matin, le gérant voit une checklist actionnable de ce qui le concerne aujourd'hui.

**Différence dashboard** : dashboard = chiffres ; TODO = actions. Persona "pilote" matérialisé.

**Contenu possible (pondéré par urgence)** :
- 🔴 Charges récurrentes oubliées (J+5 ou plus)
- 🟠 Suggestions à valider du cron mensuel (ce mois)
- 🟠 Audits journal à traiter (anomalies détectées hier)
- 🟡 Saisies attendues aujourd'hui (loyer si jour 1, URSSAF si jour 15)
- 🟡 Insight quotidien à lire (généré 04:00)
- 🟢 Brief lundi disponible (si on est lundi)
- 🟢 Inventaire à faire (si cadence hebdo et 7+ jours sans saisie)

**Format** : 5-7 items max, chaque item est cliquable et amène à l'action correspondante. Pattern Apple Reminders / Things.

**Effort estimé** : ~3-4h pour V0 (page `/matin` ou bandeau dashboard). Réutilise déjà ia_signaux + charges_suggestions + audit-saisies.

**Lien V1.1** : on a déjà tous les signaux nécessaires en BDD. C'est un agrégateur UI, pas de nouveau LLM nécessaire.

### 4.2 — Imports facilités par IA
**Concept** : faciliter les imports de données externes (banques + Uber + autres CA) avec assistance IA.

**3 sources évoquées** :
- **Banques** : import relevés CSV/PDF, rapprochement avec transactions, détection doublons
- **Uber** : déjà via /admin/imports mais buggé (cf. IRRITANTS_UX_V1.md §33)
- **CA caisse** : déjà via Popina cron, mais autres caisses (TouchSystem, l'Addition, Sumup) ?

**Apport IA** :
- **OCR factures** : photo facture → extraction (fournisseur, montant, date, TVA) → transaction prête
- **Reconnaissance format CSV** : sans mapping manuel, l'IA détecte les colonnes ("Date opération" → date, "Montant" → montant_ttc, "Libellé" → fournisseur_nom)
- **Catégorisation auto** : *"BNP - 2288.63 - SCI Castelnau"* → categorie_pl=loyers_charges (par fuzzy match avec charges_recurrentes existantes)
- **Détection doublons** : transaction bancaire matchant déjà transaction caisse (montant + date proche)
- **Vérification cohérence** : si total bancaire ≠ total caisse + écart > 5%, alerte

**Lien existant** :
- §33 IRRITANTS — refonte /admin/imports déjà identifiée P0+P1 (legacy tables, bugs, pas d'intégration charges récurrentes)
- Lot 9 chat-functions — `rechercherCharge` déjà disponible pour détection doublons
- `lib/ia/recurrence-enrichment.js` — pattern Haiku batch validation déterministe ré-utilisable pour import

**Effort estimé** :
- Refonte /admin/imports (legacy fix + intégration IA) : ~1 jour
- OCR facture (Anthropic Vision API ou Mistral) : ~2 jours
- Auto-mapping CSV (Haiku batch) : ~1 jour
- Détection doublons : ~½ jour (réutilise pattern validate suggestion)

**Total** : ~4-5 jours pour version complète. Énorme rentabilité (Mounir saisit 17 charges récurrentes/mois, soit ~204 saisies/an évitables — cf. IRRITANTS B5).

---

## 5. Trois décisions stratégiques à trancher avant V1.2

### 5.1 — Persona final
- **Expert sage** (parle peu, juste, passif) : actuel STRAT_IA.md
- **Coach proactif** (bavard, soulève des actions) : axes 5/9 vont dans cette direction

→ Ce choix oriente tout le développement V1.2. Si "sage", éviter axes 5/9. Si "coach", investir massivement.

### 5.2 — Tolérance à l'erreur IA
- 0% : aucune prévision, jamais. Stricte cadrage V1 actuel.
- 5% : on accepte 1 prévision/mois fausse si les autres sont justes.
- 10%+ : on accepte le bruit pour la valeur.

→ Ce choix oriente axe 4 (prévisions) et 8 (benchmark cross-tenant).

### 5.3 — Budget LLM par tenant
- 2€/mois : Haiku partout, fréquence basse, pas de Sonnet en cron.
- 10€/mois : Sonnet pour brief + chat. Haiku pour le reste. Actuel.
- 30€/mois : Sonnet partout, multi-modal autorisé, agents possibles.

→ Ce choix oriente le rapport coût/qualité de chaque axe.

---

## Historique

- **6 mai 2026** : création du document. Cadrage initial 10 axes + 4 questions de challenge + 2 nouvelles idées (TODO matinale, imports IA-facilités).
