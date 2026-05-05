-- =====================================================
-- MIGRATION V1 — ia_usage feature CHECK extension
-- Date    : 2026-05-05
-- Branche : main
--
-- Cf. Lot 6 Charges Récurrentes V1.1 (Layer 2 LLM Haiku enrichissement).
--
-- ia_usage.feature CHECK initial (V1_ia_socle.sql) acceptait uniquement
-- ('brief','anomalie','insight','chat','test'). Le Lot 6 doit tracker
-- les appels d'enrichissement candidats avec feature='charges_detection',
-- d'où l'extension du CHECK.
--
-- Pattern : DROP CONSTRAINT existant + ADD avec liste élargie. Toutes les
-- valeurs existantes restent acceptées + nouvelle valeur ajoutée.
--
-- Idempotence : DROP IF EXISTS + ADD CONSTRAINT (échouera si la nouvelle
-- contrainte existe déjà avec le même nom — relancer = no-op si déjà migré).
-- =====================================================

BEGIN;

ALTER TABLE ia_usage
  DROP CONSTRAINT IF EXISTS ia_usage_feature_check;

ALTER TABLE ia_usage
  ADD CONSTRAINT ia_usage_feature_check CHECK (feature IN (
    'brief',
    'anomalie',
    'insight',
    'chat',
    'test',
    'charges_detection'
  ));

DO $$
BEGIN
  RAISE NOTICE '✅ ia_usage.feature CHECK étendu — nouvelle valeur acceptée : charges_detection';
END $$;

COMMIT;
