-- =====================================================
-- MIGRATION V1 - Étape 1 : préparation parametres multi-tenant
-- Date : 2026-04-25
-- Branche : v1-refactor
-- Description : ajoute timezone, jours_ouverture, slug unique sur parametres
-- Note : ces changements ont déjà été appliqués en prod via SQL Editor.
-- Ce fichier sert de trace versionnée pour rejouabilité.
-- =====================================================

-- Ajouter timezone (défaut Europe/Paris, NOT NULL)
ALTER TABLE parametres
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Europe/Paris' NOT NULL;

-- Ajouter jours_ouverture (tableau 7 booléens, lundi=0 → dimanche=6)
ALTER TABLE parametres
  ADD COLUMN IF NOT EXISTS jours_ouverture boolean[] 
  DEFAULT ARRAY[true, true, true, true, true, true, true] NOT NULL;

-- Contrainte UNIQUE sur slug (nullable, mais chaque slug non-null doit être unique)
ALTER TABLE parametres
  ADD CONSTRAINT parametres_slug_unique UNIQUE (slug);

-- Remplir le slug initial pour Krousty
UPDATE parametres
SET slug = 'krousty-sabaidi-montpellier-castelnau'
WHERE id = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'
  AND slug IS NULL;
