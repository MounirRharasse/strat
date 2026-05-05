-- =====================================================
-- MIGRATION V1 — Charges Récurrentes patch — taux TVA dans catalogue
-- Date    : 2026-05-05
-- Branche : main
--
-- Cf. STRAT_CADRAGE.md §6.5, audit TTC labels Lot 4 du 5/05/2026.
--
-- Patch corrige un trou identifié post-Lot 4 : la table charges_types
-- (catalogue partagé) ne portait pas le taux TVA usuel par charge. Toutes
-- les charges créées via le modal UI prenaient le default 20% côté
-- charges_recurrentes.taux_tva_defaut, alors que certaines charges sont
-- exonérées de TVA (URSSAF, TVA à reverser, IS, CFE, mutuelle, frais
-- bancaires, assurance pro, taxe foncière).
--
-- Conséquence latent : validate suggestion calculait montant_ht = ttc/1.20
-- pour des charges sans TVA → transactions avec montant_tva fictif → P&L
-- contient de la TVA déductible fictive sur charges sociales/fiscales.
--
-- Ce patch :
--   1. Ajoute charges_types.taux_tva_defaut numeric(5,2) NOT NULL DEFAULT 20.0
--   2. UPDATE les 8 charges du catalogue qui sont à 0% (exonérées/hors TVA)
--   3. Les autres charges restent à 20% (loyer, énergie, télécoms, expert-
--      comptable, redevance, logiciels, sécurité, entretien, déchets, SACEM)
--
-- Idempotence : ADD COLUMN IF NOT EXISTS + UPDATE (rerun safe).
--
-- Note : les charges_recurrentes déjà créées par un tenant gardent leur
-- taux_tva_defaut tel quel (20% par défaut). Si Mounir a déjà créé une
-- charge URSSAF via UI Lot 4, il faudra PATCH manuel ou la recréer.
-- =====================================================

BEGIN;

ALTER TABLE charges_types
  ADD COLUMN IF NOT EXISTS taux_tva_defaut numeric(5,2) NOT NULL DEFAULT 20.0;

-- Charges sans TVA récupérable (charges sociales, fiscales, exonérées)
UPDATE charges_types
SET taux_tva_defaut = 0
WHERE code IN (
  'urssaf',                -- charges sociales, hors TVA
  'tva_a_payer',           -- TVA à reverser, par définition pas de TVA dessus
  'impots_societes',       -- impôt sur les bénéfices, hors TVA
  'cfe',                   -- cotisation foncière, impôt local hors TVA
  'mutuelle_employeur',    -- exonérée TVA
  'frais_bancaires',       -- hors TVA
  'assurance_pro',         -- taxe sur les contrats d''assurance (pas TVA récupérable)
  'taxe_fonciere'          -- impôt local hors TVA
);

DO $$
DECLARE
  nb_zero int;
  nb_total int;
BEGIN
  SELECT COUNT(*) INTO nb_zero FROM charges_types WHERE taux_tva_defaut = 0;
  SELECT COUNT(*) INTO nb_total FROM charges_types;
  RAISE NOTICE '✅ Patch charges_types.taux_tva_defaut : %/% à 0%% (charges exonérées/hors TVA)', nb_zero, nb_total;
END $$;

COMMIT;
