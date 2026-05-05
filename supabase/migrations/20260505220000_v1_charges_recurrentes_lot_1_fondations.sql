-- =====================================================
-- MIGRATION V1 — Charges Récurrentes Lot 1 / Fondations BDD
-- Date    : 2026-05-05
-- Branche : main
--
-- Cf. STRAT_CADRAGE.md §6.5 (Charges Récurrentes V1.1) — cadrage produit
-- Cf. IRRITANTS_UX_V1.md §B5 (charges récurrentes saisies manuellement)
-- Cf. cadrage architectural complet du 2026-05-05 (12 sections, 12 lots).
--
-- Ce Lot 1 crée :
--   - 5 tables : charges_types, charges_recurrentes, charges_suggestions,
--     recurrence_candidates, charges_ignores
--   - Indexes (incl. indexes partiels sur actif/statut pour optimiser cron)
--   - Seed catalogue charges_types : 25 entrées typiques restauration FR
--
-- CONVENTIONS Strat appliquées :
--   - Énums : CHECK (col IN ('a','b','c')) sur colonnes text, PAS de
--     CREATE TYPE Postgres. Cohérent avec ia_signaux.type_trigger,
--     audits_ignores.type, sources.type. Plus flexible (ajout valeur =
--     ALTER TABLE ... DROP/ADD CONSTRAINT, pas ALTER TYPE).
--   - RLS : explicitement DÉSACTIVÉE sur les 5 tables (DISABLE ROW LEVEL
--     SECURITY). Filtrage multi-tenant côté code via parametre_id dans
--     toutes les queries. Convention V1 du repo, activation RLS prévue
--     V1+ dans un sprint dédié.
--     Cf. supabase/migrations/20260428001000_v1_inventaires.sql:38-40
--     et 20260503203000_v1_data_layer_phase_a_etape_1.sql:71-83.
--   - Idempotence : CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT
--     EXISTS, INSERT ... ON CONFLICT DO NOTHING.
--
-- Aucun code applicatif modifié dans ce Lot — uniquement schéma + seed.
-- La prod fonctionne EXACTEMENT comme avant après cette migration
-- (5 tables vides côté tenant + catalogue partagé seedé).
-- =====================================================

BEGIN;

-- =====================================================
-- 1. TABLES (5)
-- =====================================================

-- ----- 1.1 charges_types (catalogue PARTAGÉ tous tenants) -----
-- Pas de parametre_id : catalogue commun, seedé en migration, modifiable
-- uniquement via migration future. Pas de FK sortante hors charges_types.
CREATE TABLE IF NOT EXISTS charges_types (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     text NOT NULL UNIQUE,
  libelle                  text NOT NULL,
  categorie_pl             text NOT NULL,
  profil_defaut            text NOT NULL DEFAULT 'fixe'
                             CHECK (profil_defaut IN ('fixe','variable_recurrente','one_shot')),
  frequence_defaut         text NOT NULL DEFAULT 'mensuel'
                             CHECK (frequence_defaut IN ('mensuel','trimestriel','semestriel','annuel')),
  jour_typique             int CHECK (jour_typique BETWEEN 1 AND 28),
  formule_calcul_defaut    text,
  hints_ia                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  applicable_si            jsonb NOT NULL DEFAULT '{}'::jsonb,
  ordre_affichage          int NOT NULL DEFAULT 100,
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- ----- 1.2 charges_recurrentes (paramétrage par tenant) -----
-- charge_type_id NULLABLE : permet charges custom non au catalogue
-- (ex. charge atypique d'un futur tenant exotique).
-- CHECK chk_montant_ou_formule : garantit la cohérence profil/montant/formule.
CREATE TABLE IF NOT EXISTS charges_recurrentes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id             uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  charge_type_id           uuid REFERENCES charges_types(id),
  libelle_personnalise     text NOT NULL,
  categorie_pl             text NOT NULL,
  sous_categorie           text,
  fournisseur_nom_attendu  text,
  profil                   text NOT NULL
                             CHECK (profil IN ('fixe','variable_recurrente','one_shot')),
  frequence                text NOT NULL
                             CHECK (frequence IN ('mensuel','trimestriel','semestriel','annuel')),
  jour_du_mois             int NOT NULL CHECK (jour_du_mois BETWEEN 1 AND 28),
  montant_attendu          numeric(10,2),
  formule_calcul           text,
  taux_tva_defaut          numeric(5,2) DEFAULT 20.0,
  actif                    boolean NOT NULL DEFAULT true,
  source_creation          text NOT NULL
                             CHECK (source_creation IN ('onboarding_catalogue','manuel_ui','chat_ia','detection_ia')),
  pause_jusqu_au           date,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_montant_ou_formule CHECK (
    (profil = 'fixe' AND montant_attendu IS NOT NULL)
    OR (profil = 'variable_recurrente' AND (montant_attendu IS NOT NULL OR formule_calcul IS NOT NULL))
    OR (profil = 'one_shot')
  )
);

-- ----- 1.3 charges_suggestions (file validation, générée par cron mensuel) -----
-- UNIQUE (charge_recurrente_id, mois) garantit idempotence cron : re-run = no-op.
-- transaction_id ON DELETE SET NULL : si client supprime la transaction, la
-- suggestion garde la trace de validation (audit).
CREATE TABLE IF NOT EXISTS charges_suggestions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id             uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  charge_recurrente_id     uuid NOT NULL REFERENCES charges_recurrentes(id) ON DELETE CASCADE,
  mois                     text NOT NULL CHECK (mois ~ '^\d{4}-\d{2}$'),
  date_attendue            date NOT NULL,
  montant_suggere          numeric(10,2) NOT NULL,
  fournisseur_suggere      text,
  formule_evaluee          text,
  statut                   text NOT NULL DEFAULT 'pending'
                             CHECK (statut IN ('pending','validated','ignored','modified','expired')),
  transaction_id           uuid REFERENCES transactions(id) ON DELETE SET NULL,
  motif_ignore             text,
  montant_modifie          numeric(10,2),
  created_at               timestamptz NOT NULL DEFAULT now(),
  validated_at             timestamptz,
  expires_at               timestamptz NOT NULL DEFAULT (now() + interval '60 days'),
  CONSTRAINT uq_suggestion_par_mois UNIQUE (charge_recurrente_id, mois)
);

-- ----- 1.4 recurrence_candidates (détection IA passive) -----
-- UNIQUE (parametre_id, fournisseur_nom_norm) : 1 candidat par fournisseur
-- par tenant, re-scan UPDATE au lieu de dupliquer.
CREATE TABLE IF NOT EXISTS recurrence_candidates (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id             uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  fournisseur_nom_norm     text NOT NULL,
  fournisseur_nom_brut     text NOT NULL,
  categorie_pl             text NOT NULL,
  nb_observations          int NOT NULL CHECK (nb_observations >= 3),
  montant_median           numeric(10,2) NOT NULL,
  montant_ecart_pct        numeric(5,2),
  intervalle_jours_median  int NOT NULL,
  derniere_date            date NOT NULL,
  premiere_date            date NOT NULL,
  confiance_pct            int NOT NULL CHECK (confiance_pct BETWEEN 0 AND 100),
  hints_llm                jsonb DEFAULT '{}'::jsonb,
  statut                   text NOT NULL DEFAULT 'pending'
                             CHECK (statut IN ('pending','proposed','accepted','dismissed')),
  charge_recurrente_id     uuid REFERENCES charges_recurrentes(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_candidat_fournisseur UNIQUE (parametre_id, fournisseur_nom_norm)
);

-- ----- 1.5 charges_ignores (apprentissage des refus client → IA) -----
-- Format `cle` préfixé : 'fournisseur:<nom_norm>', 'charge_type:<code>',
-- 'pattern:<libre>'. Évite 3 colonnes nullables.
-- Cohérent avec audits_ignores.cle (pattern existant).
CREATE TABLE IF NOT EXISTS charges_ignores (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id             uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  cle                      text NOT NULL,
  motif                    text,
  ne_plus_proposer         boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ignore_cle UNIQUE (parametre_id, cle)
);


-- =====================================================
-- 2. INDEXES
-- =====================================================

-- charges_types : index sur categorie_pl pour filtrer catalogue par section UI
CREATE INDEX IF NOT EXISTS idx_charges_types_categorie
  ON charges_types(categorie_pl);

-- charges_recurrentes : index partiel sur (parametre_id, actif) pour cron mensuel
-- (qui scanne uniquement WHERE actif=true)
CREATE INDEX IF NOT EXISTS idx_charges_rec_parametre_actif
  ON charges_recurrentes(parametre_id) WHERE actif = true;

CREATE INDEX IF NOT EXISTS idx_charges_rec_type
  ON charges_recurrentes(charge_type_id);

-- charges_suggestions : index partiel sur (parametre_id, statut, date_attendue)
-- pour la file de validation pending sur /previsions
CREATE INDEX IF NOT EXISTS idx_charges_sug_pending
  ON charges_suggestions(parametre_id, date_attendue) WHERE statut = 'pending';

-- recurrence_candidates : index partiel pour l'UI "Candidats détectés" sur /previsions
CREATE INDEX IF NOT EXISTS idx_rec_cand_pending
  ON recurrence_candidates(parametre_id, confiance_pct DESC) WHERE statut = 'pending';

-- charges_ignores : index sur parametre_id pour SELECT IN au scan IA
CREATE INDEX IF NOT EXISTS idx_charges_ign_parametre
  ON charges_ignores(parametre_id);


-- =====================================================
-- 3. RLS — DÉSACTIVÉE explicitement (cohérent V1)
--
-- Le filtrage multi-tenant est appliqué côté code via parametre_id dans
-- toutes les queries (pattern Strat V1). Activation RLS prévue V1+ dans
-- un sprint dédié (bascule backend vers service_role obligatoire avant
-- activation, sinon les requêtes anon retourneraient 0 rows silencieusement).
--
-- charges_types est partagée tous tenants (pas de parametre_id) : la lecture
-- publique est volontaire (catalogue de référence). L'écriture depuis le code
-- applicatif n'est jamais effectuée (seed uniquement via migrations).
-- =====================================================

ALTER TABLE charges_types          DISABLE ROW LEVEL SECURITY;
ALTER TABLE charges_recurrentes    DISABLE ROW LEVEL SECURITY;
ALTER TABLE charges_suggestions    DISABLE ROW LEVEL SECURITY;
ALTER TABLE recurrence_candidates  DISABLE ROW LEVEL SECURITY;
ALTER TABLE charges_ignores        DISABLE ROW LEVEL SECURITY;


-- =====================================================
-- 4. SEED charges_types — 25 entrées catalogue restauration FR
--
-- Sources : cadrage Section 2 du 2026-05-05.
-- Catégories alignées sur les valeurs categorie_pl existantes Krousty.
-- ON CONFLICT (code) DO NOTHING : idempotence (re-exécution safe).
-- =====================================================

INSERT INTO charges_types (code, libelle, categorie_pl, profil_defaut, frequence_defaut, jour_typique, formule_calcul_defaut, hints_ia, applicable_si, ordre_affichage) VALUES

-- LOCAUX
('loyer_commercial', 'Loyer commercial', 'loyers_charges', 'fixe', 'mensuel', 1, NULL,
  '{"mots_cles_fournisseur":["loyer","sci","bailleur","propriétaire"],"plage_montant_typique":[800,5000]}'::jsonb,
  '{"type_restaurant":["franchise","independant","fast_food","restaurant","brasserie"]}'::jsonb, 10),

('charges_locatives', 'Charges de copropriété', 'loyers_charges', 'fixe', 'trimestriel', 5, NULL,
  '{"mots_cles_fournisseur":["syndic","copropriete"],"plage_montant_typique":[100,800]}'::jsonb,
  '{}'::jsonb, 11),

('taxe_fonciere', 'Taxe foncière', 'loyers_charges', 'fixe', 'annuel', 15, NULL,
  '{"mots_cles_fournisseur":["impots","tresor","DGFIP"]}'::jsonb,
  '{}'::jsonb, 12),

-- ÉNERGIE & TÉLÉCOMS
('electricite', 'Électricité', 'energie', 'variable_recurrente', 'mensuel', 10, NULL,
  '{"mots_cles_fournisseur":["edf","engie","total","direct energie","ekwateur"],"plage_montant_typique":[300,3000]}'::jsonb,
  '{}'::jsonb, 20),

('gaz', 'Gaz', 'energie', 'variable_recurrente', 'mensuel', 10, NULL,
  '{"mots_cles_fournisseur":["engie","grdf","total"],"plage_montant_typique":[100,1500]}'::jsonb,
  '{}'::jsonb, 21),

('eau', 'Eau', 'energie', 'variable_recurrente', 'trimestriel', 20, NULL,
  '{"mots_cles_fournisseur":["veolia","saur","suez","eau"],"plage_montant_typique":[100,800]}'::jsonb,
  '{}'::jsonb, 22),

('telecom_internet', 'Internet / Téléphonie', 'autres_frais_influencables', 'fixe', 'mensuel', 5, NULL,
  '{"mots_cles_fournisseur":["orange","sfr","free","bouygues"],"plage_montant_typique":[40,200]}'::jsonb,
  '{}'::jsonb, 23),

-- ASSURANCES & FINANCES
('assurance_pro', 'Assurance professionnelle (RC, MMA, AXA)', 'autres_frais_influencables', 'fixe', 'mensuel', 5, NULL,
  '{"mots_cles_fournisseur":["axa","allianz","mma","groupama","generali","macif","maif"],"plage_montant_typique":[80,500]}'::jsonb,
  '{}'::jsonb, 30),

('mutuelle_employeur', 'Mutuelle salariés', 'autres_charges_personnel', 'fixe', 'mensuel', 5, NULL,
  '{"mots_cles_fournisseur":["malakoff","apicil","probtp","ag2r"],"plage_montant_typique":[50,500]}'::jsonb,
  '{}'::jsonb, 31),

('frais_bancaires', 'Frais bancaires fixes', 'autres_frais_influencables', 'fixe', 'mensuel', 28, NULL,
  '{"mots_cles_fournisseur":["banque","credit agricole","bnp","societe generale","cic","lcl"],"plage_montant_typique":[10,150]}'::jsonb,
  '{}'::jsonb, 32),

-- FISCALITÉ & SOCIAL (variables)
-- Note formules : taux_urssaf est en pourcentage (= 42), divisé par 100
--                 dans la formule. tva_collectee_mois doit être calculée
--                 par le DSL Lot 8 depuis ventes_par_source post-Sprint
--                 Migration data layer (popina TTC - HT + uber TTC/11 pour
--                 TVA 10%), PAS via API Popina live.
('urssaf', 'URSSAF (charges sociales)', 'autres_charges_personnel', 'variable_recurrente', 'mensuel', 15,
  'sum_transactions(categorie_pl=frais_personnel, mois_courant) * taux_urssaf / 100',
  '{"mots_cles_fournisseur":["urssaf"],"plage_montant_typique":[1000,15000]}'::jsonb,
  '{"type_restaurant":["franchise","independant","fast_food","restaurant","brasserie"]}'::jsonb, 40),

('tva_a_payer', 'TVA à reverser', 'autres_charges', 'variable_recurrente', 'mensuel', 20,
  'max(0, tva_collectee_mois - tva_deductible_mois)',
  '{"mots_cles_fournisseur":["tresor","dgfip","impots"]}'::jsonb,
  '{}'::jsonb, 41),

('impots_societes', 'Impôt sur les sociétés', 'autres_charges', 'variable_recurrente', 'trimestriel', 15, NULL,
  '{"mots_cles_fournisseur":["tresor","dgfip","impots"]}'::jsonb,
  '{}'::jsonb, 42),

('cfe', 'Cotisation Foncière des Entreprises', 'autres_charges', 'fixe', 'annuel', 15, NULL,
  '{"mots_cles_fournisseur":["dgfip","tresor"]}'::jsonb,
  '{}'::jsonb, 43),

-- HONORAIRES
('expert_comptable', 'Expert-comptable', 'honoraires', 'fixe', 'mensuel', 5, NULL,
  '{"mots_cles_fournisseur":["cabinet","expert","comptable"],"plage_montant_typique":[150,2500]}'::jsonb,
  '{}'::jsonb, 50),

('honoraires_juridique', 'Honoraires juridiques (avocat)', 'honoraires', 'one_shot', 'mensuel', 1, NULL,
  '{"mots_cles_fournisseur":["avocat","cabinet"]}'::jsonb,
  '{}'::jsonb, 51),

-- FRANCHISE / ENSEIGNE
('redevance_marque', 'Redevance de marque (franchise)', 'redevance_marque', 'fixe', 'mensuel', 5, NULL,
  '{"mots_cles_fournisseur":["redevance","franchise","royalties"],"plage_montant_typique":[500,5000]}'::jsonb,
  '{"type_restaurant":["franchise"]}'::jsonb, 60),

('redevance_publicite', 'Redevance publicité enseigne', 'redevance_marque', 'fixe', 'mensuel', 5, NULL,
  '{"mots_cles_fournisseur":["redevance","publicite","comm"]}'::jsonb,
  '{"type_restaurant":["franchise"]}'::jsonb, 61),

-- LOGICIELS / ABONNEMENTS PRO
('logiciel_caisse', 'Logiciel de caisse', 'prestations_operationnelles', 'fixe', 'mensuel', 1, NULL,
  '{"mots_cles_fournisseur":["popina","laddition","tactill","sumup","zelty"],"plage_montant_typique":[20,150]}'::jsonb,
  '{}'::jsonb, 70),

('plateforme_livraison_abo', 'Abonnement plateforme livraison (hors commissions)', 'prestations_operationnelles', 'fixe', 'mensuel', 1, NULL,
  '{"mots_cles_fournisseur":["uber","deliveroo","just eat"]}'::jsonb,
  '{}'::jsonb, 71),

('logiciel_paie', 'Logiciel de paie / RH', 'autres_charges_personnel', 'fixe', 'mensuel', 1, NULL,
  '{"mots_cles_fournisseur":["payfit","pennylane","silae"],"plage_montant_typique":[30,300]}'::jsonb,
  '{}'::jsonb, 72),

('musique_pro', 'SACEM / Musique', 'autres_frais_influencables', 'fixe', 'trimestriel', 5, NULL,
  '{"mots_cles_fournisseur":["sacem","spre","mood"]}'::jsonb,
  '{}'::jsonb, 73),

-- SÉCURITÉ & ENTRETIEN RÉCURRENT
('alarme_securite', 'Alarme / Télésurveillance', 'entretiens_reparations', 'fixe', 'mensuel', 5, NULL,
  '{"mots_cles_fournisseur":["verisure","securitas","prosegur"],"plage_montant_typique":[30,200]}'::jsonb,
  '{}'::jsonb, 80),

('contrat_entretien_clim', 'Entretien climatisation/chauffage', 'entretiens_reparations', 'fixe', 'trimestriel', 15, NULL,
  '{"mots_cles_fournisseur":["clim","frigo","entretien","maintenance"],"plage_montant_typique":[80,500]}'::jsonb,
  '{}'::jsonb, 81),

('dechets_pro', 'Collecte déchets professionnels', 'entretiens_reparations', 'fixe', 'mensuel', 15, NULL,
  '{"mots_cles_fournisseur":["veolia","suez","sepur","derichebourg"],"plage_montant_typique":[50,400]}'::jsonb,
  '{}'::jsonb, 82)

ON CONFLICT (code) DO NOTHING;


-- =====================================================
-- 5. LOGS POST-MIGRATION
-- =====================================================

DO $$
DECLARE
  nb_types     int;
  nb_rec       int;
  nb_sug       int;
  nb_cand      int;
  nb_ign       int;
BEGIN
  SELECT COUNT(*) INTO nb_types FROM charges_types;
  SELECT COUNT(*) INTO nb_rec   FROM charges_recurrentes;
  SELECT COUNT(*) INTO nb_sug   FROM charges_suggestions;
  SELECT COUNT(*) INTO nb_cand  FROM recurrence_candidates;
  SELECT COUNT(*) INTO nb_ign   FROM charges_ignores;

  RAISE NOTICE '✅ Lot 1 Charges Récurrentes — 5 tables créées + RLS désactivée';
  RAISE NOTICE '   charges_types          : % rows (catalogue partagé seedé)', nb_types;
  RAISE NOTICE '   charges_recurrentes    : % rows (paramétrage tenant)', nb_rec;
  RAISE NOTICE '   charges_suggestions    : % rows (file validation cron)', nb_sug;
  RAISE NOTICE '   recurrence_candidates  : % rows (détection IA passive)', nb_cand;
  RAISE NOTICE '   charges_ignores        : % rows (apprentissage refus)', nb_ign;
  RAISE NOTICE '';
  RAISE NOTICE 'Prochain Lot : Lot 2 — Helper data layer lib/data/charges-recurrentes.js (lecture seule).';
END $$;

COMMIT;
