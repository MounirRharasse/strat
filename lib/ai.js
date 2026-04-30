// Sprint IA Phase 1 commit 1 — Middleware Claude.
//
// Fournit `callClaude()` : un appel unique avec retries, timeout, fallback,
// et tracking automatique dans `ia_usage` (best-effort, n'échoue pas l'appel).
//
// Garde-fous critiques :
// - Aucun console.log de prompts ou messages (fuite tokens dans logs Vercel).
// - parametre_id JAMAIS user-controlled (toujours injecté côté serveur).
// - Pricing intégré : Haiku 4.5 / Sonnet 4.6 (avril 2026).
//
// Cf. cadrage Sprint IA Phase 1 commit 1.

import { supabase } from '@/lib/supabase'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

// Tarifs avril 2026 (en $/M tokens, à actualiser si changement).
const PRICING = {
  'claude-haiku-4-5-20251001':  { input: 1.0, output: 5.0 },
  'claude-sonnet-4-6':          { input: 3.0, output: 15.0 }
}
const USD_TO_EUR = 0.92

// 3 retries avec backoff exponentiel : 500ms, 1s, 2s entre tentatives.
const RETRY_DELAYS_MS = [500, 1000, 2000]
const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_MAX_TOKENS = 600

function calculerCoutEur(model, tokens_input, tokens_output) {
  const pricing = PRICING[model] || { input: 1, output: 5 }
  const cout_usd = (tokens_input * pricing.input / 1e6) + (tokens_output * pricing.output / 1e6)
  return cout_usd * USD_TO_EUR
}

async function trackUsage({ parametre_id, feature, model, tokens_input, tokens_output, cout_eur, duree_ms, succes, erreur }) {
  // Best-effort : n'échoue jamais l'appel principal si Supabase down.
  try {
    await supabase.from('ia_usage').insert({
      parametre_id,
      feature,
      modele: model,
      tokens_input: tokens_input || 0,
      tokens_output: tokens_output || 0,
      cout_estime_eur: cout_eur || 0,
      duree_ms,
      succes,
      erreur: erreur ? String(erreur).slice(0, 500) : null
    })
  } catch {
    // Swallow : tracking ne doit jamais bloquer.
  }
}

/**
 * Appelle Claude avec retries, fallback, tracking automatique.
 *
 * @param {Object} options
 * @param {string} options.model - 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6'
 * @param {string} [options.system] - System prompt
 * @param {Array<{role:'user'|'assistant', content:string|Array}>} options.messages
 * @param {Array} [options.tools] - Schemas function calling (Chat, commit 9+)
 * @param {string} options.parametre_id - Tenant (ne JAMAIS exposer aux user)
 * @param {string} options.feature - 'brief'|'anomalie'|'insight'|'chat'|'test'
 * @param {Object} [options.opts]
 * @param {number} [options.opts.max_tokens=600]
 * @param {number} [options.opts.timeout_ms=30000]
 *
 * @returns {Promise<
 *   { content, tokens_input, tokens_output, cout_eur, model, raw } |
 *   { error, fallback_used: true }
 * >}
 */
export async function callClaude({
  model,
  system,
  messages,
  tools,
  parametre_id,
  feature,
  opts = {}
}) {
  const { max_tokens = DEFAULT_MAX_TOKENS, timeout_ms = DEFAULT_TIMEOUT_MS } = opts
  const t0 = Date.now()
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    const erreur = 'ANTHROPIC_API_KEY missing'
    await trackUsage({
      parametre_id, feature, model,
      tokens_input: 0, tokens_output: 0, cout_eur: 0,
      duree_ms: Date.now() - t0,
      succes: false,
      erreur
    })
    return { error: erreur, fallback_used: true }
  }

  const body = { model, messages, max_tokens }
  if (system) body.system = system
  if (tools && tools.length > 0) body.tools = tools

  let lastError

  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), timeout_ms)

    try {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 200)}`)
      }

      const data = await res.json()
      const tokens_input = data.usage?.input_tokens || 0
      const tokens_output = data.usage?.output_tokens || 0
      const cout_eur = calculerCoutEur(model, tokens_input, tokens_output)

      // Extraction du content textuel (1er bloc 'text').
      const textBlock = (data.content || []).find(c => c.type === 'text')
      const content = textBlock?.text || ''

      await trackUsage({
        parametre_id, feature, model,
        tokens_input, tokens_output, cout_eur,
        duree_ms: Date.now() - t0,
        succes: true
      })

      return { content, tokens_input, tokens_output, cout_eur, model, raw: data }
    } catch (e) {
      clearTimeout(timeoutId)
      lastError = e
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]))
      }
    }
  }

  // Échec après 3 retries.
  await trackUsage({
    parametre_id, feature, model,
    tokens_input: 0, tokens_output: 0, cout_eur: 0,
    duree_ms: Date.now() - t0,
    succes: false,
    erreur: lastError
  })
  return { error: String(lastError), fallback_used: true }
}

// Export pour tests (calcul coût isolé, useful pour vérifier sans appel réseau)
export const _internal = { calculerCoutEur, PRICING, USD_TO_EUR }
