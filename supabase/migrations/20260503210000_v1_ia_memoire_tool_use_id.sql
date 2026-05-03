-- =====================================================
-- HOTFIX V1 — ia_memoire : appariement tool_use / tool_result
-- Date : 2026-05-03
-- Branche : v1-refactor
--
-- Bug : Anthropic 400 invalid_request_error au 2ème message dans une
-- conversation existante avec tool_use. La row ia_memoire utilisait
-- l'UUID Postgres en row.id, et lib/ia-chat.js:rebuildMessages()
-- renvoyait cet UUID en tool_use_id à Anthropic, qui rejette parce
-- que l'ID Anthropic d'origine (toolu_01ABC...) n'est pas reconnu.
--
-- Fix structurel : ajout d'une colonne tool_use_id pour stocker
-- l'identifiant Anthropic du tool_use, partagé entre les rows
-- tool_use et tool_result d'une même invocation. rebuildMessages
-- l'utilisera pour l'appariement correct côté requête Claude.
--
-- Cf. lib/ia-chat.js:rebuildMessages, lib/ia/chat-memoire.js:saveTurn.
-- =====================================================

BEGIN;

ALTER TABLE ia_memoire
  ADD COLUMN IF NOT EXISTS tool_use_id text;

CREATE INDEX IF NOT EXISTS idx_ia_memoire_tool_use_id
  ON ia_memoire(parametre_id, conversation_id, tool_use_id)
  WHERE tool_use_id IS NOT NULL;

DO $$
BEGIN
  RAISE NOTICE 'Colonne ia_memoire.tool_use_id ajoutée + index partiel. Rows pré-fix : tool_use_id NULL (skip dans rebuildMessages).';
END $$;

COMMIT;
