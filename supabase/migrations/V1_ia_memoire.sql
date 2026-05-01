-- Sprint IA Phase 1 commit 8 — Mémoire conversation chat.
--
-- 1 ligne par tour : message user, réponse assistant, appel d'outil
-- (tool_use), retour d'outil (tool_result). Permet de reconstruire le
-- contexte conversationnel pour le multi-tours du chat (commit 9).
--
-- conversation_id : UUID auto-généré côté client. Pas de slug en V1.
-- Limite contextuelle envoyée à Claude : 20 derniers tours (V1 fixe).
-- Purge V1.1 (cron de housekeeping pour supprimer conversations > N jours).

CREATE TABLE IF NOT EXISTS ia_memoire (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parametre_id uuid NOT NULL REFERENCES parametres(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool_use', 'tool_result')),
  content text,
  tool_name text,
  tool_input jsonb,
  tool_output jsonb,
  tokens_input integer DEFAULT 0,
  tokens_output integer DEFAULT 0,
  cout_eur numeric(10,6) DEFAULT 0,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_memoire_conversation
  ON ia_memoire(parametre_id, conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ia_memoire_parametre_date
  ON ia_memoire(parametre_id, created_at DESC);
