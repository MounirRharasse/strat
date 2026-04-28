-- =====================================================
-- MIGRATION V1 - Feature Inventaire simple
-- Date : 2026-04-28
-- Branche : v1-refactor
-- Cf. STRAT_CADRAGE.md §14
--
-- Crée la table `inventaires` pour la feature de saisie d'inventaire
-- du stock total (sans détail par référence). Permet de calculer le
-- food cost en mode "exact" (variation de stock) au lieu du mode
-- "estimé" (achats / CA HT).
-- =====================================================

BEGIN;

CREATE TABLE inventaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  date date NOT NULL,
  valeur_totale numeric(10, 2) NOT NULL,
  note text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT inventaires_parametre_date_key UNIQUE (parametre_id, date),
  CONSTRAINT inventaires_valeur_positive CHECK (valeur_totale >= 0)
);

CREATE INDEX idx_inventaires_parametre_id ON inventaires(parametre_id);
CREATE INDEX idx_inventaires_parametre_date ON inventaires(parametre_id, date DESC);

-- Pas de policies RLS en V1 (cohérent avec les 7 autres tables).
-- Filtrage par parametre_id côté code via getParametreIdFromSession dans /api/inventaires.

DO $$
BEGIN
  RAISE NOTICE 'Table inventaires créée. Filtrage tenant côté code (RLS V1+).';
END $$;

-- RLS explicitement désactivée pour rester cohérent avec les 7 autres tables
-- (transactions, historique_ca, uber_orders, fournisseurs, entrees, amplitude_horaire,
-- import_mappings) qui sont toutes en RLS off en V1. Le filtrage multi-tenant
-- est appliqué côté code via parametre_id. Activation RLS prévue V1+.
ALTER TABLE inventaires DISABLE ROW LEVEL SECURITY;

COMMIT;
