// Sprint IA Phase 1 commit 8 — CRUD ia_memoire.
//
// Persistance des tours de conversation chat. 1 ligne par message
// (user/assistant) ou interaction tool (tool_use/tool_result).
//
// Limite contextuelle ENVOYÉE à Claude : 20 derniers tours (V1 fixe).
// Tout est persisté en DB ; on filtre seulement à la lecture.

import { supabase } from '@/lib/supabase'

export const LIMIT_TURNS_DEFAUT = 20

/**
 * Sauvegarde un tour de conversation.
 * @param {Object} params
 * @param {string} params.parametre_id
 * @param {string} params.conversation_id - UUID
 * @param {'user'|'assistant'|'tool_use'|'tool_result'} params.role
 * @param {string} [params.content]
 * @param {string} [params.tool_name]
 * @param {Object} [params.tool_input]
 * @param {Object} [params.tool_output]
 * @param {string} [params.tool_use_id] - ID Anthropic du tool_use (ex: 'toolu_01ABC...'),
 *   partagé entre rows tool_use et tool_result d'une même invocation.
 *   Cf. supabase/migrations/20260503210000_v1_ia_memoire_tool_use_id.sql.
 * @param {number} [params.tokens_input]
 * @param {number} [params.tokens_output]
 * @param {number} [params.cout_eur]
 * @param {string} [params.model]
 */
export async function saveTurn(params) {
  const {
    parametre_id, conversation_id, role,
    content = null, tool_name = null,
    tool_input = null, tool_output = null,
    tool_use_id = null,
    tokens_input = 0, tokens_output = 0,
    cout_eur = 0, model = null
  } = params
  const { data, error } = await supabase.from('ia_memoire').insert({
    parametre_id, conversation_id, role, content, tool_name,
    tool_input, tool_output,
    tool_use_id,
    tokens_input, tokens_output, cout_eur, model
  }).select('id').single()
  if (error) throw new Error(`[chat-memoire] saveTurn: ${error.message}`)
  return data
}

/**
 * Charge les N derniers tours d'une conversation, en ordre chronologique.
 *
 * @returns {Promise<Array<Object>>}
 */
export async function loadConversation({ parametre_id, conversation_id, limit_turns = LIMIT_TURNS_DEFAUT }) {
  const { data, error } = await supabase
    .from('ia_memoire')
    .select('*')
    .eq('parametre_id', parametre_id)
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: false })
    .limit(limit_turns)
  if (error) throw new Error(`[chat-memoire] loadConversation: ${error.message}`)
  // Inverse pour avoir l'ordre conversationnel (du plus ancien au plus récent)
  return (data || []).reverse()
}

/**
 * Liste les conversations distinctes du tenant, avec le 1er user message
 * comme aperçu et le timestamp du dernier tour.
 */
export async function listConversations({ parametre_id, limit = 10 }) {
  const { data, error } = await supabase
    .from('ia_memoire')
    .select('conversation_id, created_at, content, role')
    .eq('parametre_id', parametre_id)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw new Error(`[chat-memoire] listConversations: ${error.message}`)

  const grouped = new Map()
  for (const row of data || []) {
    if (!grouped.has(row.conversation_id)) {
      grouped.set(row.conversation_id, {
        conversation_id: row.conversation_id,
        last_at: row.created_at,
        first_user_msg: null,
        nb_turns: 0
      })
    }
    const entry = grouped.get(row.conversation_id)
    entry.nb_turns += 1
    if (row.role === 'user' && row.content) {
      entry.first_user_msg = row.content
    }
  }
  return Array.from(grouped.values()).slice(0, limit)
}
