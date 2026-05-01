// Sprint IA Phase 1 commit 9 — Orchestration chat conversationnel.
//
// streamChat : async generator qui pilote la boucle Claude tool_use/
// tool_result. Yields des chunks SSE-ready :
//   { type: 'token', data: string }       — texte assistant
//   { type: 'tool_use', data: { name, input } }
//   { type: 'tool_result', data: { name, success } }
//   { type: 'done', data: { conversation_id, cumul_eur, iterations } }
//   { type: 'error', data: string }
//
// Garde-fous : input injection, content injection (sanitize),
// loop max 5 itérations, cost cap 0.10€.

import { callClaude } from '@/lib/ai'
import { CHAT_SYSTEM } from '@/lib/ia/prompts'
import { TOOLS, dispatch } from '@/lib/ia/chat-functions'
import { saveTurn, loadConversation } from '@/lib/ia/chat-memoire'
import {
  validerMessageUtilisateur,
  sanitizeToolOutput,
  verifierLoopLimit,
  verifierCostCap
} from '@/lib/ia/chat-guards'
import { getDateAujourdhui } from '@/lib/ia/chat-functions/meta'

const MODEL_CHAT = 'claude-sonnet-4-6'
const LOOP_MAX = 5
const COST_CAP_EUR = 0.10

/**
 * Substitue les placeholders {{DATE_AUJOURDHUI}} et {{SEMAINE_ISO}}
 * dans CHAT_SYSTEM par les vraies valeurs du tenant.
 */
function buildSystem(dateInfo) {
  return CHAT_SYSTEM
    .replace('{{DATE_AUJOURDHUI}}', `${dateInfo.date} (${dateInfo.jour_semaine})`)
    .replace('{{SEMAINE_ISO}}', dateInfo.semaine_iso)
}

/**
 * Reconstruit le format messages[] Anthropic depuis l'historique DB.
 * Les rows ia_memoire sont en ordre chronologique.
 */
function rebuildMessages(history) {
  const messages = []
  let pendingAssistantBlocks = []
  let pendingToolResults = []

  function flushAssistant() {
    if (pendingAssistantBlocks.length > 0) {
      messages.push({ role: 'assistant', content: pendingAssistantBlocks })
      pendingAssistantBlocks = []
    }
  }
  function flushToolResults() {
    if (pendingToolResults.length > 0) {
      messages.push({ role: 'user', content: pendingToolResults })
      pendingToolResults = []
    }
  }

  for (const row of history) {
    if (row.role === 'user') {
      flushAssistant()
      flushToolResults()
      messages.push({ role: 'user', content: row.content || '' })
    } else if (row.role === 'assistant') {
      flushToolResults()
      // Bloc texte final
      if (row.content) {
        pendingAssistantBlocks.push({ type: 'text', text: row.content })
      }
      flushAssistant()
    } else if (row.role === 'tool_use') {
      flushToolResults()
      pendingAssistantBlocks.push({
        type: 'tool_use',
        id: row.id,
        name: row.tool_name,
        input: row.tool_input || {}
      })
    } else if (row.role === 'tool_result') {
      // Si on a des assistant blocks pending, on les flush avant
      flushAssistant()
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: row.id, // approximation : V1.1 idéalement on lie via une FK
        content: JSON.stringify(row.tool_output || {})
      })
    }
  }
  flushAssistant()
  flushToolResults()
  return messages
}

/**
 * Pipeline conversationnel complet.
 *
 * @yields {Object} chunks { type, data }
 */
export async function* streamChat({ parametre_id, conversation_id, message }) {
  // 1. Validation input
  const v = validerMessageUtilisateur(message)
  if (!v.ok) {
    yield { type: 'error', data: { raison: v.raison, message: 'Message refusé pour raisons de sécurité.' } }
    return
  }

  // 2. Save user message
  try {
    await saveTurn({ parametre_id, conversation_id, role: 'user', content: message })
  } catch (e) {
    yield { type: 'error', data: { raison: 'erreur_save_user', message: e.message } }
    return
  }

  // 3. Load history (20 derniers tours)
  let history
  try {
    history = await loadConversation({ parametre_id, conversation_id })
  } catch (e) {
    yield { type: 'error', data: { raison: 'erreur_load_history', message: e.message } }
    return
  }

  // 4. Build messages[] Anthropic
  const messages = rebuildMessages(history)

  // 5. Substitution placeholders dans le system prompt
  const dateInfo = await getDateAujourdhui({ parametre_id })
  const system = buildSystem(dateInfo)

  // 6. Loop tool_use/tool_result
  let iterations = 0
  let cumul_eur = 0
  let assistantTextFinal = ''
  let modelUsed = MODEL_CHAT
  let tokensInputCumul = 0
  let tokensOutputCumul = 0

  while (true) {
    const lc = verifierLoopLimit({ iterations, max: LOOP_MAX })
    if (!lc.ok) {
      yield { type: 'error', data: { raison: 'loop_limit_atteint', iterations: lc.iterations } }
      return
    }

    const r = await callClaude({
      model: MODEL_CHAT,
      system,
      messages,
      tools: TOOLS,
      parametre_id,
      feature: 'chat',
      opts: { max_tokens: 1500 }
    })

    if (r.error) {
      yield { type: 'error', data: { raison: 'callClaude_error', message: r.error } }
      return
    }

    cumul_eur += (r.cout_eur || 0)
    tokensInputCumul += (r.tokens_input || 0)
    tokensOutputCumul += (r.tokens_output || 0)

    const cc = verifierCostCap({ cumul_eur, max: COST_CAP_EUR })
    if (!cc.ok) {
      yield { type: 'error', data: { raison: 'cost_cap_atteint', cumul_eur } }
      return
    }

    const blocks = r.raw?.content || []
    const stopReason = r.raw?.stop_reason

    // Yield les blocks text + tool_use, accumule pour la suite
    const toolUseBlocks = []
    let assistantTextThisTurn = ''
    for (const block of blocks) {
      if (block.type === 'text' && block.text) {
        assistantTextThisTurn += block.text
        yield { type: 'token', data: block.text }
      } else if (block.type === 'tool_use') {
        toolUseBlocks.push(block)
        yield { type: 'tool_use', data: { name: block.name, input: block.input } }
      }
    }

    if (stopReason === 'end_turn' || toolUseBlocks.length === 0) {
      // Réponse finale
      assistantTextFinal = assistantTextThisTurn
      try {
        await saveTurn({
          parametre_id, conversation_id,
          role: 'assistant',
          content: assistantTextFinal,
          model: modelUsed,
          tokens_input: tokensInputCumul,
          tokens_output: tokensOutputCumul,
          cout_eur: cumul_eur
        })
      } catch (e) {
        // Best-effort, on ne bloque pas la réponse user
        console.warn('[chat] saveTurn assistant failed', e.message)
      }
      yield { type: 'done', data: { conversation_id, cumul_eur, iterations: iterations + 1 } }
      return
    }

    // Append assistant message (tous les blocks reçus) à messages
    messages.push({ role: 'assistant', content: blocks })

    // Dispatch chaque tool_use, accumule les tool_results
    const toolResultsBlocks = []
    for (const block of toolUseBlocks) {
      const dispatchRes = await dispatch({
        name: block.name,
        input: block.input,
        parametre_id // TOUJOURS depuis la session, jamais le body
      })
      const rawOutput = dispatchRes.error
        ? { error: dispatchRes.error }
        : (dispatchRes.result ?? {})
      const sanitized = sanitizeToolOutput(rawOutput)

      try {
        await saveTurn({
          parametre_id, conversation_id,
          role: 'tool_use',
          tool_name: block.name,
          tool_input: block.input
        })
        await saveTurn({
          parametre_id, conversation_id,
          role: 'tool_result',
          tool_name: block.name,
          tool_output: sanitized
        })
      } catch (e) {
        console.warn('[chat] saveTurn tool failed', e.message)
      }

      yield {
        type: 'tool_result',
        data: { name: block.name, success: !dispatchRes.error }
      }

      toolResultsBlocks.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(sanitized)
      })
    }

    messages.push({ role: 'user', content: toolResultsBlocks })

    iterations++
  }
}

export const _internal = { rebuildMessages, buildSystem, MODEL_CHAT, LOOP_MAX, COST_CAP_EUR }
