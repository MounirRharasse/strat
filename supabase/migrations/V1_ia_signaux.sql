-- Sprint IA Phase 1 commit 5 — Détection déterministe insight quotidien.
-- Cf. cadrage 2026-05-01.
--
-- Tables / colonnes :
--   - parametres : 3 nouvelles colonnes (seuils par tenant)
--   - ia_signaux : 1 ligne par insight détecté, max 1/jour/tenant
--
-- Le commit 6 (à venir) :
--   - INSERT dans ia_signaux via le cron quotidien
--   - UPDATE colonnes ia_contenu / ia_modele / ia_cout_eur / ia_genere_le
--     après appel Haiku 4.5

-- 1. Seuils paramétrables par tenant
ALTER TABLE parametres
  ADD COLUMN IF NOT EXISTS seuil_insight_spike_ca_pct numeric NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS seuil_insight_drop_ca_pct numeric NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS seuil_insight_fournisseur_hausse_pct numeric NOT NULL DEFAULT 30;

-- 2. Table ia_signaux
CREATE TABLE IF NOT EXISTS ia_signaux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  date_detection date NOT NULL,
  type_trigger text NOT NULL CHECK (type_trigger IN (
    'drop_ca', 'spike_ca', 'food_cost_spike',
    'fournisseur_hausse', 'seuil_atteint', 'seuil_decroche'
  )),
  tier text NOT NULL CHECK (tier IN ('T1', 'T2', 'T3', 'T4')),
  magnitude numeric NOT NULL,
  contexte jsonb NOT NULL,
  traite_par_ia boolean NOT NULL DEFAULT false,
  ia_contenu text,
  ia_modele text,
  ia_cout_eur numeric(10,6),
  ia_genere_le timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parametre_id, date_detection)
);

CREATE INDEX IF NOT EXISTS idx_ia_signaux_parametre_date
  ON ia_signaux(parametre_id, date_detection DESC);

CREATE INDEX IF NOT EXISTS idx_ia_signaux_type_date
  ON ia_signaux(type_trigger, date_detection DESC);
