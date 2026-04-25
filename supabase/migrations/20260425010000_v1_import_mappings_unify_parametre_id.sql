-- =====================================================
-- MIGRATION V1 - Import mappings : unification client_id ↔ parametre_id
-- Date : 2026-04-25
-- Branche : v1-refactor
-- Contexte :
--   La migration Étape 2 (20260425005000) a ajouté parametre_id à import_mappings,
--   mais cette table avait déjà une colonne client_id qui pointait vers parametres(id)
--   et jouait le rôle de tenant key. Pour éviter une duplication permanente
--   (deux colonnes sémantiquement identiques), on supprime le parametre_id ajouté
--   et on renomme client_id → parametre_id pour aligner sur le pattern des 6 autres
--   tables migrées.
-- =====================================================

BEGIN;

-- =====================================================
-- 0. VÉRIFICATION DE COHÉRENCE (préalable à toute modif)
-- =====================================================
-- client_id et parametre_id doivent contenir la même valeur partout.
-- Si une ligne diverge, on stoppe net via RAISE EXCEPTION (ROLLBACK auto).
DO $$
DECLARE
  nb_divergent int;
BEGIN
  SELECT COUNT(*) INTO nb_divergent
  FROM import_mappings
  WHERE client_id IS DISTINCT FROM parametre_id;

  IF nb_divergent > 0 THEN
    RAISE EXCEPTION 'Cohérence brisée : % lignes ont client_id != parametre_id', nb_divergent;
  END IF;
END $$;

-- =====================================================
-- 1. DROP de l'ancienne contrainte UNIQUE (client_id, type, source)
-- =====================================================
-- Postgres nomme la contrainte selon comment elle a été créée. On la cherche
-- dynamiquement par sa signature (colonnes) pour ne pas dépendre du nom exact.
DO $$
DECLARE
  uc_name text;
BEGIN
  SELECT conname INTO uc_name
  FROM pg_constraint
  WHERE conrelid = 'import_mappings'::regclass
    AND contype = 'u'
    AND conkey = (
      SELECT array_agg(attnum ORDER BY attnum)
      FROM pg_attribute
      WHERE attrelid = 'import_mappings'::regclass
        AND attname IN ('client_id', 'type', 'source')
    );

  IF uc_name IS NULL THEN
    RAISE EXCEPTION 'Contrainte UNIQUE (client_id, type, source) introuvable';
  END IF;

  EXECUTE format('ALTER TABLE import_mappings DROP CONSTRAINT %I', uc_name);
END $$;

-- =====================================================
-- 2. DROP de la colonne parametre_id (le doublon ajouté par Étape 2)
-- =====================================================
-- DROP COLUMN supprime automatiquement la FK et l'index associés.
ALTER TABLE import_mappings
  DROP COLUMN parametre_id;

-- =====================================================
-- 3. RENAME client_id → parametre_id
-- =====================================================
ALTER TABLE import_mappings
  RENAME COLUMN client_id TO parametre_id;

-- =====================================================
-- 4. Garantie NOT NULL (idempotent si déjà NOT NULL)
-- =====================================================
ALTER TABLE import_mappings
  ALTER COLUMN parametre_id SET NOT NULL;

-- =====================================================
-- 5. RECRÉATION de l'index sur parametre_id
-- =====================================================
CREATE INDEX idx_import_mappings_parametre_id
  ON import_mappings(parametre_id);

-- =====================================================
-- 6. NOUVELLE contrainte UNIQUE (parametre_id, type, source)
-- =====================================================
ALTER TABLE import_mappings
  ADD CONSTRAINT import_mappings_parametre_type_source_key
  UNIQUE (parametre_id, type, source);

-- =====================================================
-- 7. RENAME de la FK (cosmétique mais évite un nom obsolète)
-- =====================================================
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'import_mappings'::regclass
    AND contype = 'f'
    AND conkey = (
      SELECT array_agg(attnum)
      FROM pg_attribute
      WHERE attrelid = 'import_mappings'::regclass
        AND attname = 'parametre_id'
    );

  IF fk_name IS NOT NULL AND fk_name <> 'import_mappings_parametre_id_fkey' THEN
    EXECUTE format(
      'ALTER TABLE import_mappings RENAME CONSTRAINT %I TO import_mappings_parametre_id_fkey',
      fk_name
    );
  END IF;
END $$;

-- =====================================================
-- VÉRIFICATIONS FINALES
-- =====================================================
DO $$
DECLARE
  nb_null int;
  has_pid boolean;
  has_cid boolean;
BEGIN
  SELECT COUNT(*) INTO nb_null
  FROM import_mappings WHERE parametre_id IS NULL;
  IF nb_null > 0 THEN
    RAISE EXCEPTION 'parametre_id NULL détecté : % lignes', nb_null;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_mappings' AND column_name = 'parametre_id'
  ) INTO has_pid;
  IF NOT has_pid THEN
    RAISE EXCEPTION 'Colonne parametre_id manquante après migration';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_mappings' AND column_name = 'client_id'
  ) INTO has_cid;
  IF has_cid THEN
    RAISE EXCEPTION 'Colonne client_id encore présente — rename a échoué';
  END IF;

  RAISE NOTICE 'Migration import_mappings OK : client_id → parametre_id, % lignes',
    (SELECT COUNT(*) FROM import_mappings);
END $$;

COMMIT;
