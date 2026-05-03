-- =====================================================
-- MIGRATION V1 — Sprint Migration data layer / Phase A étape 1
-- Date  : 2026-05-03
-- Branche : v1-refactor
--
-- Crée les 3 tables cibles de la nouvelle data layer Strat :
--   - sources           : catalogue paramétrable des sources de revenus par tenant
--   - ventes_par_source : faits journaliers (1 ligne par jour × source)
--   - paiements_caisse  : ventilation des modes de paiement (Restaurant uniquement)
--
-- Cf. STRAT_ARCHITECTURE.md v1.1 §Décision #1 (schéma cible) et §Décision #5
-- (stratégie d'exécution option β).
-- Cf. PLANNING_V1.md v1.2 §Sprint Migration data layer Étape 1.
--
-- Cette étape ne fait QUE créer les tables (idempotence garantie via
-- CREATE TABLE IF NOT EXISTS) + seed Krousty dans `sources`. Aucun backfill,
-- aucun dual-write, aucune lecture migrée. La prod fonctionne EXACTEMENT comme
-- avant après cette migration.
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Table sources (catalogue par tenant)
-- =====================================================
CREATE TABLE IF NOT EXISTS sources (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id       uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  nom                text NOT NULL,
  slug               text,
  type               text NOT NULL CHECK (type IN ('caisse','plateforme')),
  actif              boolean NOT NULL DEFAULT true,
  integration_config jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sources_parametre_nom_key  UNIQUE (parametre_id, nom),
  CONSTRAINT sources_parametre_slug_key UNIQUE (parametre_id, slug)
);

-- =====================================================
-- 2. Table ventes_par_source (faits journaliers × source)
-- =====================================================
CREATE TABLE IF NOT EXISTS ventes_par_source (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id    uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  date            date NOT NULL,
  source_id       uuid NOT NULL REFERENCES sources(id),
  montant_ttc     numeric(10,2) NOT NULL,
  montant_ht      numeric(10,2),
  nb_commandes    integer,
  commission_ttc  numeric(10,2),
  commission_ht   numeric(10,2),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ventes_par_source_parametre_date_source_key UNIQUE (parametre_id, date, source_id)
);

CREATE INDEX IF NOT EXISTS idx_vps_param_date ON ventes_par_source (parametre_id, date);

-- =====================================================
-- 3. Table paiements_caisse (ventilation modes paiement Restaurant)
-- =====================================================
CREATE TABLE IF NOT EXISTS paiements_caisse (
  parametre_id  uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  date          date NOT NULL,
  especes       numeric(10,2),
  cb            numeric(10,2),
  tr            numeric(10,2),
  PRIMARY KEY (parametre_id, date)
);

-- =====================================================
-- 4. RLS — explicitement désactivée pour cohérence V1
--
-- Note : STRAT_ARCHITECTURE.md v1.1 §Décision #1 §RLS prévoit l'activation de
-- RLS sur ces 3 tables avec policies par parametre_id. Choix d'écart volontaire
-- à la Phase A étape 1 (cf. IRRITANTS_UX_V1.md §F14) : on aligne sur la
-- convention V1 du repo, qui est RLS désactivée partout avec filtrage côté code
-- via parametre_id. Activation RLS prévue V1+ dans un sprint dédié (bascule
-- backend vers la clé service_role obligatoire avant activation, sinon les
-- requêtes backend retourneraient 0 rows silencieusement).
--
-- Référence : supabase/migrations/20260428001000_v1_inventaires.sql:38-40 pour
-- la même convention sur la table inventaires.
-- =====================================================

ALTER TABLE sources           DISABLE ROW LEVEL SECURITY;
ALTER TABLE ventes_par_source DISABLE ROW LEVEL SECURITY;
ALTER TABLE paiements_caisse  DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. Seed Krousty dans sources
--
-- 2 lignes : Restaurant (caisse popina) + Uber Eats (plateforme).
-- parametre_id sélectionné dynamiquement par slug pour ne pas hardcoder l'uuid.
-- Idempotence : ON CONFLICT (parametre_id, slug) DO NOTHING.
-- Si le slug Krousty change, le seed sera silencieusement skip (pas d'erreur).
-- =====================================================

INSERT INTO sources (parametre_id, nom, slug, type, actif)
SELECT id, 'Restaurant', 'popina', 'caisse', true
FROM parametres
WHERE slug = 'krousty-sabaidi-montpellier-castelnau'
ON CONFLICT (parametre_id, slug) DO NOTHING;

INSERT INTO sources (parametre_id, nom, slug, type, actif)
SELECT id, 'Uber Eats', 'uber_eats', 'plateforme', true
FROM parametres
WHERE slug = 'krousty-sabaidi-montpellier-castelnau'
ON CONFLICT (parametre_id, slug) DO NOTHING;

DO $$
DECLARE
  nb_sources_krousty integer;
BEGIN
  SELECT COUNT(*) INTO nb_sources_krousty
  FROM sources s
  JOIN parametres p ON p.id = s.parametre_id
  WHERE p.slug = 'krousty-sabaidi-montpellier-castelnau';
  RAISE NOTICE 'Tables sources / ventes_par_source / paiements_caisse créées. Seed Krousty : % sources actives.', nb_sources_krousty;
END $$;

COMMIT;
