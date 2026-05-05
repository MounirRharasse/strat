// Détection IA Layer 2 — enrichissement LLM Haiku 4.5.
// Lot 6 Charges Récurrentes V1.1.
// Cf. STRAT_CADRAGE.md §6.5, cadrage Section 4 Layer 2.
//
// Prend les recurrence_candidates Layer 1 (déterministe), les envoie en batch
// à Haiku 4.5 avec contexte du catalogue charges_types, parse le JSON output,
// applique validation déterministe stricte (anti-hallucination), UPDATE
// hints_llm + montant_ecart_pct + confiance_pct si LLM apporte de la valeur.
//
// Garde-fous (cf. STRAT_IA.md §4) :
// - Aucun chiffre inventé : montants/dates ne sont JAMAIS modifiés par le LLM
// - charge_type_code retourné DOIT exister dans le catalogue (sinon → null)
// - profil/frequence DOIVENT appartenir aux énums (sinon → fallback Layer 1)
// - Confiance globale clamp [0,100]
// - Si JSON malformé ou erreur LLM → fallback Layer 1 (pas de UPDATE hints_llm)
// - Tracking obligatoire ia_usage avec feature='charges_detection'

import { callClaude } from '@/lib/ai'

const MODEL = 'claude-haiku-4-5-20251001'
const PROFILS_VALIDES = ['fixe', 'variable_recurrente', 'one_shot']
const FREQUENCES_VALIDES = ['mensuel', 'trimestriel', 'semestriel', 'annuel']

const SYSTEM_PROMPT = `Tu es un assistant qualifiant des candidats charges récurrentes pour restaurateurs FR.

Pour chaque candidat fourni (fournisseur, montant_median, intervalle_jours_median, categorie_pl, nb_observations), tu dois :
1. Proposer un libellé humain ("Loyer SCI Castelnau" plutôt que "SCI CASTELNAU 34170")
2. Mapper sur le catalogue charges_types fourni (charge_type_code OU "aucun" si pas de match évident)
3. Confirmer ou réviser le profil (fixe/variable_recurrente/one_shot)
4. Confirmer la fréquence (mensuel/trimestriel/semestriel/annuel)
5. Évaluer la confiance globale (0-100)

CONTRAINTES STRICTES :
- Tu retournes UN JSON unique au format : { "candidats": [{ "id": "<uuid_du_candidat>", "libelle_propose": "...", "charge_type_code": "loyer_commercial" | "aucun", "profil": "fixe", "frequence": "mensuel", "confiance": 85, "commentaire": "<optionnel, court>" }] }
- Le champ "id" doit reprendre EXACTEMENT le uuid du candidat fourni en entrée.
- Tu n'inventes JAMAIS de montant, date, fournisseur — uniquement les champs sémantiques (libellé, charge_type_code, profil, frequence, confiance).
- charge_type_code DOIT venir du catalogue fourni OU être "aucun".
- Si confiance < 60 explique pourquoi dans commentaire (court, max 80 caractères).
- Aucun texte hors du JSON. Pas de markdown, pas de \`\`\`json. Juste le JSON brut.`

/**
 * Enrichit un batch de candidats récurrence via Haiku 4.5.
 * @param {Array} candidats - rows recurrence_candidates Layer 1
 * @param {Array} chargesTypes - catalogue (id, code, libelle, categorie_pl)
 * @param {string} parametreId
 * @returns {Promise<{
 *   enriched: Array<{ candidatId, libelle_propose, charge_type_code, charge_type_id, profil, frequence, confiance, commentaire }>,
 *   nb_failed_validation: number,
 *   nb_skipped: number,
 *   tokens_input: number,
 *   tokens_output: number,
 *   cout_eur: number,
 *   error?: string,
 * }>}
 */
export async function enrichirCandidats(candidats, chargesTypes, parametreId) {
  if (!candidats || candidats.length === 0) {
    return { enriched: [], nb_failed_validation: 0, nb_skipped: 0, tokens_input: 0, tokens_output: 0, cout_eur: 0 }
  }

  // Construit le contexte catalogue (compact, sans les jsonb hints_ia détaillés)
  const catalogueCompact = (chargesTypes || []).map(t => ({
    code: t.code,
    libelle: t.libelle,
    categorie_pl: t.categorie_pl,
    profil: t.profil_defaut,
    frequence: t.frequence_defaut,
  }))

  const candidatsCompacts = candidats.map(c => ({
    id: c.id,
    fournisseur_nom_brut: c.fournisseur_nom_brut,
    categorie_pl: c.categorie_pl,
    montant_median: c.montant_median,
    nb_observations: c.nb_observations,
    intervalle_jours_median: c.intervalle_jours_median,
    derniere_date: c.derniere_date,
    premiere_date: c.premiere_date,
  }))

  const userMessage = `Voici le catalogue de référence des charges récurrentes typiques restauration FR :
${JSON.stringify(catalogueCompact, null, 2)}

Voici les ${candidatsCompacts.length} candidat(s) à qualifier :
${JSON.stringify(candidatsCompacts, null, 2)}

Retourne le JSON enrichi pour ces ${candidatsCompacts.length} candidat(s).`

  const result = await callClaude({
    model: MODEL,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    parametre_id: parametreId,
    feature: 'charges_detection',
    // max_tokens : ~150 tok/candidat × N + overhead JSON. 4000 suffit pour ~25 candidats.
    // Au-delà, batcher en chunks (à implémenter si tenant a > 30 candidats).
    opts: { max_tokens: 4000, timeout_ms: 60000 },
  })

  if (result.error) {
    return {
      enriched: [],
      nb_failed_validation: 0,
      nb_skipped: candidats.length,
      tokens_input: 0,
      tokens_output: 0,
      cout_eur: 0,
      error: result.error,
    }
  }

  // Parse JSON output (tolérant : extrait JSON même si texte parasite)
  let parsed
  try {
    const cleaned = result.content.trim()
    // Cas markdown ```json ... ```
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Aucun JSON trouvé dans la réponse')
    parsed = JSON.parse(jsonMatch[0])
  } catch (e) {
    return {
      enriched: [],
      nb_failed_validation: candidats.length,
      nb_skipped: 0,
      tokens_input: result.tokens_input,
      tokens_output: result.tokens_output,
      cout_eur: result.cout_eur,
      error: `JSON parse : ${e.message}`,
    }
  }

  // Index catalogue pour validation
  const catalogueByCode = Object.fromEntries((chargesTypes || []).map(t => [t.code, t]))
  const candidatsById = Object.fromEntries(candidats.map(c => [c.id, c]))

  // Validation déterministe par candidat
  const enriched = []
  let nbFailedValidation = 0

  for (const c of (parsed.candidats || [])) {
    if (!c.id || !candidatsById[c.id]) {
      nbFailedValidation++
      continue
    }
    if (!c.libelle_propose || typeof c.libelle_propose !== 'string') {
      nbFailedValidation++
      continue
    }
    const libelle = String(c.libelle_propose).trim().slice(0, 200)
    if (!libelle) { nbFailedValidation++; continue }

    // charge_type_code : doit être 'aucun' OU exister dans le catalogue
    let chargeTypeCode = null
    let chargeTypeId = null
    if (c.charge_type_code === 'aucun') {
      chargeTypeCode = 'aucun'
    } else if (c.charge_type_code && catalogueByCode[c.charge_type_code]) {
      chargeTypeCode = c.charge_type_code
      chargeTypeId = catalogueByCode[c.charge_type_code].id
    } else if (c.charge_type_code) {
      // Halluciné → on ignore le mapping mais on garde l'enrichissement
      chargeTypeCode = 'aucun'
    }

    const profil = PROFILS_VALIDES.includes(c.profil) ? c.profil : null
    const frequence = FREQUENCES_VALIDES.includes(c.frequence) ? c.frequence : null

    let confiance = parseInt(c.confiance, 10)
    if (isNaN(confiance)) confiance = null
    else confiance = Math.max(0, Math.min(100, confiance))

    const commentaire = (c.commentaire && typeof c.commentaire === 'string')
      ? String(c.commentaire).trim().slice(0, 200) || null
      : null

    enriched.push({
      candidatId: c.id,
      libelle_propose: libelle,
      charge_type_code: chargeTypeCode,
      charge_type_id: chargeTypeId,
      profil,
      frequence,
      confiance,
      commentaire,
    })
  }

  return {
    enriched,
    nb_failed_validation: nbFailedValidation,
    nb_skipped: 0,
    tokens_input: result.tokens_input,
    tokens_output: result.tokens_output,
    cout_eur: result.cout_eur,
  }
}

/**
 * Pipeline complet : fetch candidats pending Layer 1, enrichit via Haiku,
 * UPDATE hints_llm sur recurrence_candidates.
 * Idempotent : peut être appelé plusieurs fois, ne ré-écrit que les candidats
 * pending (pas accepted/dismissed).
 */
export async function enrichirEtUpserter(parametreId, options = {}) {
  const { supabase } = await import('../supabase.js')

  // Fetch candidats pending sans enrichissement (hints_llm vide ou sans libelle_propose)
  const { data: candidats, error: cErr } = await supabase
    .from('recurrence_candidates')
    .select('*')
    .eq('parametre_id', parametreId)
    .eq('statut', 'pending')
    .order('confiance_pct', { ascending: false })
  if (cErr) throw new Error(`enrichirEtUpserter candidats : ${cErr.message}`)

  if (!candidats || candidats.length === 0) {
    return { nb_input: 0, nb_enriched: 0, nb_failed: 0, cout_eur: 0 }
  }

  // Filtrer ceux qui ont déjà un libellé propose (sauf option force)
  const aEnrichir = options.force
    ? candidats
    : candidats.filter(c => !c.hints_llm?.libelle_propose)

  if (aEnrichir.length === 0) {
    return {
      nb_input: candidats.length,
      nb_a_enrichir: 0,
      nb_enriched: 0,
      nb_failed: 0,
      nb_skipped_already_enriched: candidats.length,
      tokens_input: 0,
      tokens_output: 0,
      cout_eur: 0,
    }
  }

  // Fetch catalogue
  const { data: chargesTypes, error: tErr } = await supabase
    .from('charges_types')
    .select('id, code, libelle, categorie_pl, profil_defaut, frequence_defaut')
  if (tErr) throw new Error(`enrichirEtUpserter charges_types : ${tErr.message}`)

  const result = await enrichirCandidats(aEnrichir, chargesTypes || [], parametreId)

  // UPDATE hints_llm pour chaque enriched
  let nbUpdated = 0
  for (const e of result.enriched) {
    const newHints = {
      ...(candidats.find(c => c.id === e.candidatId)?.hints_llm || {}),
      libelle_propose: e.libelle_propose,
      charge_type_code: e.charge_type_code,
      charge_type_id: e.charge_type_id,
      profil: e.profil,
      frequence: e.frequence,
      confiance_llm: e.confiance,
      commentaire_llm: e.commentaire,
      enriched_at: new Date().toISOString(),
    }

    const { error: uErr } = await supabase
      .from('recurrence_candidates')
      .update({ hints_llm: newHints, updated_at: new Date().toISOString() })
      .eq('id', e.candidatId)
      .eq('parametre_id', parametreId)
    if (!uErr) nbUpdated++
  }

  return {
    nb_input: candidats.length,
    nb_a_enrichir: aEnrichir.length,
    nb_enriched: nbUpdated,
    nb_failed: result.nb_failed_validation,
    nb_skipped: result.nb_skipped,
    tokens_input: result.tokens_input,
    tokens_output: result.tokens_output,
    cout_eur: result.cout_eur,
    error: result.error,
  }
}
