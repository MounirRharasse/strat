-- =====================================================
-- MIGRATION V1 — ia_signaux.type_trigger ajout 'charge_oubliee'
-- Date    : 2026-05-06
-- Branche : main
--
-- Cf. Lot 10 Charges Récurrentes V1.1 (brief lundi + dashboard alertes).
--
-- Le cron mensuel charges-recurrentes-mensuel détecte post-génération les
-- suggestions pending dont date_attendue + 5 jours < today (= oubli probable).
-- Pour chaque tenant ayant >=1 oubli, écrit un signal ia_signaux avec
-- type_trigger='charge_oubliee' et contexte = liste des charges oubliées.
--
-- Le brief lundi consomme ce signal pour afficher une section "⚠ Charges
-- oubliées" dans le récap hebdomadaire. Le dashboard affiche aussi un badge
-- count des suggestions pending non validées.
--
-- Pattern : DROP CONSTRAINT existant + ADD avec liste élargie. Idempotent.
-- =====================================================

BEGIN;

ALTER TABLE ia_signaux
  DROP CONSTRAINT IF EXISTS ia_signaux_type_trigger_check;

ALTER TABLE ia_signaux
  ADD CONSTRAINT ia_signaux_type_trigger_check CHECK (type_trigger IN (
    'drop_ca',
    'spike_ca',
    'food_cost_spike',
    'fournisseur_hausse',
    'seuil_atteint',
    'seuil_decroche',
    'charge_oubliee'
  ));

DO $$
BEGIN
  RAISE NOTICE '✅ ia_signaux.type_trigger CHECK étendu — nouvelle valeur acceptée : charge_oubliee';
END $$;

COMMIT;
