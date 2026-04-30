-- Sprint Journal — V1 audit de saisie
-- Cf. cadrage 2026-04-30 (audit 10h café).
--
-- Migration 1 : ajout colonne `jours_fermes_semaine` sur parametres.
--   Convention JS : array d'int 0-6 (0=dimanche, 1=lundi, ..., 6=samedi).
--   Vide par défaut → règle "trous de jours" désactivée tant que non configurée.
--
-- Migration 2 : table `audits_ignores` pour persister les "Marquer comme OK".
--   Une ligne = un faux positif ignoré pour une occurrence précise (date+type).
--   N'ignore PAS pour toujours, juste cette occurrence (cf. décision 2026-04-30 flou 1).

ALTER TABLE parametres
  ADD COLUMN IF NOT EXISTS jours_fermes_semaine int[] DEFAULT ARRAY[]::int[];

CREATE TABLE IF NOT EXISTS audits_ignores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('trou_jour', 'trou_canal', 'trou_categorie', 'anomalie_montant')),
  cle text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parametre_id, type, cle)
);

CREATE INDEX IF NOT EXISTS idx_audits_ignores_lookup
  ON audits_ignores(parametre_id, type, cle);
