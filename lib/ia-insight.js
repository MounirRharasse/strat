// Sprint IA Phase 1 commit 6 — Orchestration insight quotidien.
//
// Pipeline :
//   1. detecterInsightDuJour (commit 5) → null ou signal {type, tier, magnitude, contexte}
//   2. INSERT ia_signaux (idempotent via UNIQUE), traite_par_ia=false
//   3. callClaude Haiku 4.5
//   4. Garde-fous : detectChiffresHallucines + filtrerDomainesExclus
//   5. UPDATE ia_signaux SET ia_contenu, ia_modele, ia_cout_eur, ia_genere_le, traite_par_ia=true
//
// Si garde-fous KO ou Haiku error : log warn, ne PAS UPDATE traite_par_ia.
// Le cron retentera demain (et la row reste en DB pour audit).

import { supabase } from '@/lib/supabase'
import { callClaude } from '@/lib/ai'
import { INSIGHT_SYSTEM } from '@/lib/ia/prompts'
import {
  detectChiffresHallucines,
  filtrerDomainesExclus
} from '@/lib/ia/garde-fous'
import { detecterInsightDuJour } from '@/lib/ia/insight-detection'

const MODEL_INSIGHT = 'claude-haiku-4-5-20251001'

function buildUserPrompt(signal) {
  return JSON.stringify({
    type_trigger: signal.type_trigger,
    tier: signal.tier,
    magnitude: signal.magnitude,
    contexte: signal.contexte
  }, null, 2)
}

/**
 * Lit l'insight du jour (signal détecté ET traité par IA).
 * Renvoie null si pas de row OU pas encore de contenu IA.
 */
export async function getInsightDuJour({ parametre_id, date_ref }) {
  const { data } = await supabase
    .from('ia_signaux')
    .select('ia_contenu, type_trigger, tier, magnitude, ia_genere_le')
    .eq('parametre_id', parametre_id)
    .eq('date_detection', date_ref)
    .eq('traite_par_ia', true)
    .maybeSingle()
  if (!data || !data.ia_contenu) return null
  return {
    contenu: data.ia_contenu,
    signal_type: data.type_trigger,
    tier: data.tier,
    magnitude: data.magnitude,
    generee_le: data.ia_genere_le
  }
}

/**
 * Pipeline complet détection → INSERT → IA → garde-fous → UPDATE.
 * Idempotent : si signal déjà traité ce jour, return depuis cache.
 *
 * @returns {Promise<
 *   { contenu, signal, cout_eur, ... } |
 *   { skipped: true, raison } |
 *   { error, signal_inserted? }
 * >}
 */
export async function genererInsightDuJour({ parametre_id, date_ref }) {
  const signal = await detecterInsightDuJour({ parametre_id, date_ref })
  if (!signal) return { skipped: true, raison: 'aucun_trigger', date_ref }

  // INSERT idempotent — gère conflit UNIQUE(parametre_id, date_detection)
  const { data: insertedRow, error: insertErr } = await supabase
    .from('ia_signaux')
    .insert({
      parametre_id,
      date_detection: date_ref,
      type_trigger: signal.type_trigger,
      tier: signal.tier,
      magnitude: signal.magnitude,
      contexte: signal.contexte
    })
    .select('id, ia_contenu, traite_par_ia')
    .single()

  let signalRow = insertedRow
  if (insertErr) {
    // Conflit UNIQUE → row existante : on récupère et on évalue son état
    const { data: existing } = await supabase
      .from('ia_signaux')
      .select('id, ia_contenu, traite_par_ia, type_trigger, magnitude, ia_genere_le')
      .eq('parametre_id', parametre_id)
      .eq('date_detection', date_ref)
      .maybeSingle()
    if (!existing) {
      return { error: 'erreur_insert_signal', detail: insertErr.message, date_ref }
    }
    if (existing.traite_par_ia) {
      return {
        contenu: existing.ia_contenu,
        depuis_cache: true,
        signal: { type_trigger: existing.type_trigger, magnitude: existing.magnitude },
        generee_le: existing.ia_genere_le
      }
    }
    signalRow = existing
  }

  // Appel Haiku
  const r = await callClaude({
    model: MODEL_INSIGHT,
    system: INSIGHT_SYSTEM,
    messages: [{ role: 'user', content: buildUserPrompt(signal) }],
    parametre_id,
    feature: 'insight',
    opts: { max_tokens: 300 }
  })
  if (r.error) {
    console.warn('[insight] callClaude error', { date_ref, raison: r.error })
    return { error: r.error, fallback_used: r.fallback_used, signal_inserted: true, date_ref }
  }

  // Garde-fous post-génération
  const hallu = detectChiffresHallucines(r.content, signal.contexte)
  if (hallu.length > 0) {
    console.warn('[insight] hallucination detectee', { date_ref, chiffres: hallu })
    return { error: 'hallucination_detectee', chiffres: hallu, signal_inserted: true, date_ref }
  }
  const exclu = filtrerDomainesExclus(r.content)
  if (exclu.exclu) {
    console.warn('[insight] domaine exclu', { date_ref, pattern: exclu.pattern })
    return { error: 'domaine_exclu', signal_inserted: true, date_ref }
  }

  // UPDATE row avec contenu IA validé
  const generee_le = new Date().toISOString()
  await supabase
    .from('ia_signaux')
    .update({
      ia_contenu: r.content,
      ia_modele: MODEL_INSIGHT,
      ia_cout_eur: r.cout_eur,
      ia_genere_le: generee_le,
      traite_par_ia: true
    })
    .eq('id', signalRow.id)

  return {
    contenu: r.content,
    signal: {
      type_trigger: signal.type_trigger,
      tier: signal.tier,
      magnitude: signal.magnitude
    },
    cout_eur: r.cout_eur,
    tokens_input: r.tokens_input,
    tokens_output: r.tokens_output,
    generee_le
  }
}
