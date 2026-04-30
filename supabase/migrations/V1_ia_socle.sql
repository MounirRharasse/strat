-- Sprint IA Phase 1 — Socle commun (Brief + Anomalies + Insight + Chat).
-- Cf. cadrage 2026-04-30.
--
-- Tables :
--   - ia_usage : tracking par appel (modele, tokens, cout, succes/erreur).
--   - ia_explications_cache : cache des contenus générés (brief, anomalie, insight).
-- ia_memoire (chat) sera créée séparément au commit 8.

CREATE TABLE IF NOT EXISTS ia_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (feature IN ('brief','anomalie','insight','chat','test')),
  modele text NOT NULL,
  tokens_input integer NOT NULL DEFAULT 0,
  tokens_output integer NOT NULL DEFAULT 0,
  cout_estime_eur numeric(10,6) NOT NULL DEFAULT 0,
  duree_ms integer,
  succes boolean NOT NULL DEFAULT true,
  erreur text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_usage_parametre_date
  ON ia_usage(parametre_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ia_usage_feature_date
  ON ia_usage(feature, created_at DESC);

CREATE TABLE IF NOT EXISTS ia_explications_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  indicateur text NOT NULL,
  -- 'brief_semaine' | 'anomalie_montant' | 'insight_jour' | 'autre'
  cle text NOT NULL,
  -- Brief : 'YYYY-Wxx' (ISO week)
  -- Anomalie : transaction_id (uuid en string)
  -- Insight : 'YYYY-MM-DD'
  contexte_hash text NOT NULL,
  contenu text NOT NULL,
  modele text NOT NULL,
  tokens_input integer,
  tokens_output integer,
  cout_estime_eur numeric(10,6),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (parametre_id, indicateur, cle)
);

CREATE INDEX IF NOT EXISTS idx_ia_cache_lookup
  ON ia_explications_cache(parametre_id, indicateur, cle);

CREATE INDEX IF NOT EXISTS idx_ia_cache_expires
  ON ia_explications_cache(expires_at);
