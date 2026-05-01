// Sprint IA Phase 1 commit 4 — Orchestration explication anomalie.
//
// Génère, valide et cache une explication IA pour une transaction
// flagguée comme anomalie. Modèle Haiku 4.5 (~0.001€/explication).
// Cache TTL 30j sur ia_explications_cache (cle = transaction_id).
//
// Cf. STRAT_IA.md §6 (garde-fous).

import { supabase } from '@/lib/supabase'
import { callClaude } from '@/lib/ai'
import { ANOMALIE_SYSTEM } from '@/lib/ia/prompts'
import {
  detectChiffresHallucines,
  filtrerDomainesExclus
} from '@/lib/ia/garde-fous'
import { buildAnomalieInputs } from '@/lib/ia/anomalie-inputs'

const MODEL_ANOMALIE = 'claude-haiku-4-5-20251001'
const CACHE_TTL_JOURS = 30

function buildUserPrompt(inputs) {
  return `Voici une transaction inhabituelle détectée dans le journal :
\`\`\`json
${JSON.stringify(inputs, null, 2)}
\`\`\`

Rédige 2-3 paragraphes (max 150 mots total) selon le format demandé.`
}

/** Lit le cache. Renvoie null si miss ou expiré. */
export async function getExplicationCachee({ parametre_id, transaction_id }) {
  const { data } = await supabase
    .from('ia_explications_cache')
    .select('contenu, created_at, expires_at')
    .eq('parametre_id', parametre_id)
    .eq('indicateur', 'anomalie_montant')
    .eq('cle', transaction_id)
    .maybeSingle()
  if (!data) return null
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null
  return { contenu: data.contenu, generee_le: data.created_at }
}

/**
 * Génère (ou retourne depuis cache) l'explication IA d'une anomalie.
 *
 * @returns {Promise<{ contenu, depuis_cache, generee_le, cout_eur?, ... } | { error, ... }>}
 */
export async function genererExplicationAnomalie({ parametre_id, transaction_id }) {
  // 1. Cache hit
  const cached = await getExplicationCachee({ parametre_id, transaction_id })
  if (cached) {
    return { contenu: cached.contenu, depuis_cache: true, generee_le: cached.generee_le }
  }

  // 2. Build inputs
  let inputs
  try {
    inputs = await buildAnomalieInputs({ parametre_id, transaction_id })
  } catch (e) {
    return { error: e.message }
  }

  // 3. Appel Haiku
  const r = await callClaude({
    model: MODEL_ANOMALIE,
    system: ANOMALIE_SYSTEM,
    messages: [{ role: 'user', content: buildUserPrompt(inputs) }],
    parametre_id,
    feature: 'anomalie',
    opts: { max_tokens: 500 }
  })
  if (r.error) return { error: r.error, fallback_used: r.fallback_used }

  // 4. Garde-fous post-génération
  const hallu = detectChiffresHallucines(r.content, inputs)
  if (hallu.length > 0) {
    console.warn('[anomalie] hallucination detectee', { transaction_id, chiffres: hallu })
    return { error: 'hallucination_detectee', chiffres: hallu }
  }
  const exclu = filtrerDomainesExclus(r.content)
  if (exclu.exclu) {
    console.warn('[anomalie] domaine exclu', { transaction_id, pattern: exclu.pattern })
    return { error: 'domaine_exclu' }
  }

  // 5. UPSERT cache (TTL 30j)
  const generee_le = new Date().toISOString()
  await supabase.from('ia_explications_cache').upsert({
    parametre_id,
    indicateur: 'anomalie_montant',
    cle: transaction_id,
    contexte_hash: '',
    contenu: r.content,
    modele: MODEL_ANOMALIE,
    tokens_input: r.tokens_input,
    tokens_output: r.tokens_output,
    cout_estime_eur: r.cout_eur,
    metadata: {
      fournisseur: inputs.transaction.fournisseur,
      montant_ttc: inputs.transaction.montant_ttc,
      ecart_pct: inputs.ecart.en_pct
    },
    expires_at: new Date(Date.now() + CACHE_TTL_JOURS * 86400_000).toISOString(),
    created_at: generee_le
  }, { onConflict: 'parametre_id,indicateur,cle' })

  return {
    contenu: r.content,
    depuis_cache: false,
    generee_le,
    cout_eur: r.cout_eur,
    tokens_input: r.tokens_input,
    tokens_output: r.tokens_output
  }
}
