-- =====================================================
-- MIGRATION V1 - Étape 2 : multi-tenant parametre_id
-- Date : 2026-04-25
-- Branche : v1-refactor
-- Description : ajoute parametre_id sur toutes les tables métier,
-- backfill avec UUID Krousty, contraintes + index, refonte UNIQUE multi-tenant
-- =====================================================

BEGIN;

-- UUID Krousty : 68f417f5-b3ea-4b8b-98ea-29b752076e8c

-- =====================================================
-- 1. TRANSACTIONS
-- =====================================================
ALTER TABLE transactions 
  ADD COLUMN parametre_id uuid REFERENCES parametres(id);
UPDATE transactions 
  SET parametre_id = '68f417f5-b3ea-4b8b-98ea-29b752076e8c';
ALTER TABLE transactions 
  ALTER COLUMN parametre_id SET NOT NULL;
CREATE INDEX idx_transactions_parametre_id ON transactions(parametre_id);

-- =====================================================
-- 2. HISTORIQUE_CA + refonte UNIQUE
-- =====================================================
ALTER TABLE historique_ca 
  ADD COLUMN parametre_id uuid REFERENCES parametres(id);
UPDATE historique_ca 
  SET parametre_id = '68f417f5-b3ea-4b8b-98ea-29b752076e8c';
ALTER TABLE historique_ca 
  ALTER COLUMN parametre_id SET NOT NULL;
ALTER TABLE historique_ca 
  DROP CONSTRAINT historique_ca_date_key;
ALTER TABLE historique_ca 
  ADD CONSTRAINT historique_ca_parametre_date_key UNIQUE (parametre_id, date);
CREATE INDEX idx_historique_ca_parametre_id ON historique_ca(parametre_id);

-- =====================================================
-- 3. UBER_ORDERS
-- =====================================================
ALTER TABLE uber_orders 
  ADD COLUMN parametre_id uuid REFERENCES parametres(id);
UPDATE uber_orders 
  SET parametre_id = '68f417f5-b3ea-4b8b-98ea-29b752076e8c';
ALTER TABLE uber_orders 
  ALTER COLUMN parametre_id SET NOT NULL;
CREATE INDEX idx_uber_orders_parametre_id ON uber_orders(parametre_id);

-- =====================================================
-- 4. FOURNISSEURS + refonte UNIQUE
-- =====================================================
ALTER TABLE fournisseurs 
  ADD COLUMN parametre_id uuid REFERENCES parametres(id);
UPDATE fournisseurs 
  SET parametre_id = '68f417f5-b3ea-4b8b-98ea-29b752076e8c';
ALTER TABLE fournisseurs 
  ALTER COLUMN parametre_id SET NOT NULL;
ALTER TABLE fournisseurs 
  DROP CONSTRAINT fournisseurs_nom_normalise_unique;
ALTER TABLE fournisseurs 
  ADD CONSTRAINT fournisseurs_parametre_nom_normalise_unique UNIQUE (parametre_id, nom_normalise);
CREATE INDEX idx_fournisseurs_parametre_id ON fournisseurs(parametre_id);

-- =====================================================
-- 5. ENTREES
-- =====================================================
ALTER TABLE entrees 
  ADD COLUMN parametre_id uuid REFERENCES parametres(id);
UPDATE entrees 
  SET parametre_id = '68f417f5-b3ea-4b8b-98ea-29b752076e8c';
ALTER TABLE entrees 
  ALTER COLUMN parametre_id SET NOT NULL;
CREATE INDEX idx_entrees_parametre_id ON entrees(parametre_id);

-- =====================================================
-- 6. AMPLITUDE_HORAIRE + refonte UNIQUE
-- =====================================================
ALTER TABLE amplitude_horaire 
  ADD COLUMN parametre_id uuid REFERENCES parametres(id);
UPDATE amplitude_horaire 
  SET parametre_id = '68f417f5-b3ea-4b8b-98ea-29b752076e8c';
ALTER TABLE amplitude_horaire 
  ALTER COLUMN parametre_id SET NOT NULL;
ALTER TABLE amplitude_horaire 
  DROP CONSTRAINT amplitude_horaire_date_heure_canal_key;
ALTER TABLE amplitude_horaire 
  ADD CONSTRAINT amplitude_horaire_parametre_date_heure_canal_key UNIQUE (parametre_id, date, heure, canal);
CREATE INDEX idx_amplitude_horaire_parametre_id ON amplitude_horaire(parametre_id);

-- =====================================================
-- 7. IMPORT_MAPPINGS
-- =====================================================
ALTER TABLE import_mappings 
  ADD COLUMN parametre_id uuid REFERENCES parametres(id);
UPDATE import_mappings 
  SET parametre_id = '68f417f5-b3ea-4b8b-98ea-29b752076e8c';
ALTER TABLE import_mappings 
  ALTER COLUMN parametre_id SET NOT NULL;
CREATE INDEX idx_import_mappings_parametre_id ON import_mappings(parametre_id);

-- =====================================================
-- 8. ADMINS (vide, parametre_id nullable pour l'instant)
-- =====================================================
ALTER TABLE admins 
  ADD COLUMN parametre_id uuid REFERENCES parametres(id);
CREATE INDEX idx_admins_parametre_id ON admins(parametre_id);

-- =====================================================
-- VÉRIFICATIONS FINALES
-- =====================================================

DO $$
DECLARE
  nb_null int;
BEGIN
  SELECT 
    (SELECT COUNT(*) FROM transactions WHERE parametre_id IS NULL) +
    (SELECT COUNT(*) FROM historique_ca WHERE parametre_id IS NULL) +
    (SELECT COUNT(*) FROM uber_orders WHERE parametre_id IS NULL) +
    (SELECT COUNT(*) FROM fournisseurs WHERE parametre_id IS NULL) +
    (SELECT COUNT(*) FROM entrees WHERE parametre_id IS NULL) +
    (SELECT COUNT(*) FROM amplitude_horaire WHERE parametre_id IS NULL) +
    (SELECT COUNT(*) FROM import_mappings WHERE parametre_id IS NULL)
  INTO nb_null;
  
  IF nb_null > 0 THEN
    RAISE EXCEPTION 'Backfill incomplet : % lignes NULL détectées', nb_null;
  END IF;
  
  RAISE NOTICE 'Backfill OK - aucune ligne NULL sur les 7 tables critiques';
END $$;

COMMIT;
