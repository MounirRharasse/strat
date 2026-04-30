// Sprint IA Phase 1 commit 2 — Orchestration brief lundi matin.
//
// Génère, valide et cache le brief hebdo. Appelé par le cron lundi 06:00 UTC
// et l'endpoint POST /api/ia/brief.
//
// Cf. STRAT_IA.md §3 (Ton + format) + §6 (garde-fous).

import crypto from 'crypto'
import { supabase } from '@/lib/supabase'
import { callClaude } from '@/lib/ai'
import { BRIEF_LUNDI_SYSTEM } from '@/lib/ia/prompts'
import {
  validerSeuilsMinDonnees,
  detectChiffresHallucines,
  filtrerDomainesExclus
} from '@/lib/ia/garde-fous'
import {
  buildBriefInputs,
  getSemaineCourante,
  getSemainePrecedente
} from '@/lib/ia/brief-inputs'

const MODEL_BRIEF = 'claude-sonnet-4-6'
const CACHE_TTL_JOURS = 7

function buildUserPrompt(inputs) {
  return `Voici les données de la semaine ${inputs.semaine.label_humain} :
\`\`\`json
${JSON.stringify(inputs, null, 2)}
\`\`\`

Rédige le brief de cette semaine selon le format strict (## Résumé / ## 3 points forts / ## 3 points de vigilance / ## 3 actions cette semaine).`
}

function hashInputs(inputs) {
  // V1.1 : permettra l'invalidation cache si saisie tardive change les inputs.
  return crypto.createHash('sha256')
    .update(JSON.stringify(inputs)).digest('hex').slice(0, 16)
}

/**
 * Génère le brief lundi pour la semaine demandée.
 * Force regen même si déjà en cache (UPSERT).
 *
 * @returns {Promise<{ contenu, semaine_iso, generee_le, cout_eur, ... } | { error, semaine_iso, ... }>}
 */
export async function genererBriefSemaine({ parametre_id, semaine_iso }) {
  const seuils = await validerSeuilsMinDonnees({ feature: 'brief', parametre_id })
  if (!seuils.ok) return { error: seuils.raison, semaine_iso }

  let inputs, periode
  try {
    const built = await buildBriefInputs({ parametre_id, semaine_iso })
    inputs = built.inputs
    periode = built.periode
  } catch (e) {
    return { error: 'erreur_build_inputs', detail: e.message, semaine_iso }
  }

  const r = await callClaude({
    model: MODEL_BRIEF,
    system: BRIEF_LUNDI_SYSTEM,
    messages: [{ role: 'user', content: buildUserPrompt(inputs) }],
    parametre_id,
    feature: 'brief',
    opts: { max_tokens: 1500 }
  })
  if (r.error) return { error: r.error, fallback_used: r.fallback_used, semaine_iso }

  const hallu = detectChiffresHallucines(r.content, inputs)
  if (hallu.length > 0) {
    console.warn('[brief] hallucination detectee', { parametre_id, semaine_iso, chiffres: hallu })
    return { error: 'hallucination_detectee', chiffres: hallu, semaine_iso }
  }
  const exclu = filtrerDomainesExclus(r.content)
  if (exclu.exclu) {
    console.warn('[brief] domaine exclu', { parametre_id, semaine_iso, pattern: exclu.pattern })
    return { error: 'domaine_exclu', semaine_iso }
  }

  const generee_le = new Date().toISOString()
  const upsertRow = {
    parametre_id,
    indicateur: 'brief_semaine',
    cle: semaine_iso,
    contexte_hash: hashInputs(inputs),
    contenu: r.content,
    modele: MODEL_BRIEF,
    tokens_input: r.tokens_input,
    tokens_output: r.tokens_output,
    cout_estime_eur: r.cout_eur,
    metadata: {
      periode_since: periode.since,
      periode_until: periode.until,
      ca_brut: inputs.ca_semaine.brut
    },
    expires_at: new Date(Date.now() + CACHE_TTL_JOURS * 86400_000).toISOString(),
    created_at: generee_le // sémantique V1: dernière génération
  }

  await supabase
    .from('ia_explications_cache')
    .upsert(upsertRow, { onConflict: 'parametre_id,indicateur,cle' })

  return {
    contenu: r.content,
    semaine_iso,
    generee_le,
    cout_eur: r.cout_eur,
    tokens_input: r.tokens_input,
    tokens_output: r.tokens_output
  }
}

/** Lit le brief en cache (sans génération). Renvoie null si absent ou expiré. */
export async function getBriefSemaine({ parametre_id, semaine_iso }) {
  const { data, error } = await supabase
    .from('ia_explications_cache')
    .select('contenu, created_at, expires_at')
    .eq('parametre_id', parametre_id)
    .eq('indicateur', 'brief_semaine')
    .eq('cle', semaine_iso)
    .maybeSingle()

  if (error || !data) return null
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null
  return {
    contenu: data.contenu,
    semaine_iso,
    generee_le: data.created_at
  }
}

export { getSemaineCourante, getSemainePrecedente }
