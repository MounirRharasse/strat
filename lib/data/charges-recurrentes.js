// Helper data layer pour la feature Charges Récurrentes V1.1.
// Cf. STRAT_CADRAGE.md §6.5, migration 20260505220000_v1_charges_recurrentes_lot_1_fondations.sql.
//
// LECTURE SEULE — toutes les écritures (INSERT/UPDATE/DELETE) passent par
// les routes REST app/api/charges-recurrentes/* (Lot 3) ou par le cron
// mensuel (Lot 8). Pas d'écriture depuis ce fichier.
//
// Filtrage tenant : toutes les fonctions prennent `parametreId` en 1er
// argument. RLS désactivée V1, filtrage côté code obligatoire (cf. CLAUDE.md §6 règle 2).
//
// Convention error handling cohérente lib/data/ventes.js :
// `throw new Error(\`<funcName> : ${error.message}\`)` sur erreur Supabase.

// ─── 1. listChargesActives ──────────────────────────────────────────
/**
 * Liste les charges récurrentes actives d'un tenant.
 * Tri : par jour_du_mois croissant (ordre chronologique mensuel),
 * puis libelle_personnalise alphabétique (stable si plusieurs charges même jour).
 *
 * @param {string} parametreId - UUID du tenant
 * @returns {Promise<Array<{
 *   id: string, parametre_id: string, charge_type_id: string|null,
 *   libelle_personnalise: string, categorie_pl: string, sous_categorie: string|null,
 *   fournisseur_nom_attendu: string|null, profil: 'fixe'|'variable_recurrente'|'one_shot',
 *   frequence: 'mensuel'|'trimestriel'|'semestriel'|'annuel',
 *   jour_du_mois: number, montant_attendu: number|null, formule_calcul: string|null,
 *   taux_tva_defaut: number, actif: boolean, source_creation: string,
 *   pause_jusqu_au: string|null, created_at: string, updated_at: string
 * }>>}
 *
 * @example
 *   const charges = await listChargesActives('68f417f5-...')
 *   // → [{ libelle_personnalise: 'Loyer SCI', jour_du_mois: 1, montant_attendu: 2288.63, ... }, ...]
 */
export async function listChargesActives(parametreId) {
  const { supabase } = await import('../supabase.js')
  const { data, error } = await supabase
    .from('charges_recurrentes')
    .select('*')
    .eq('parametre_id', parametreId)
    .eq('actif', true)
    .order('jour_du_mois', { ascending: true })
    .order('libelle_personnalise', { ascending: true })
  if (error) throw new Error(`listChargesActives : ${error.message}`)
  return data || []
}

// ─── 2. getChargeById ───────────────────────────────────────────────
/**
 * Récupère une charge récurrente par son id, scopée tenant.
 * Si l'id n'existe pas OU appartient à un autre tenant → retourne null
 * (pas d'erreur, comportement cohérent avec maybeSingle).
 *
 * @param {string} parametreId - UUID du tenant (filtre RLS-équivalent)
 * @param {string} id - UUID de la charge
 * @returns {Promise<object|null>} - row complète ou null
 *
 * @example
 *   const charge = await getChargeById('68f417f5-...', 'abc-...')
 *   if (!charge) return Response.json({ error: 'introuvable' }, { status: 404 })
 */
export async function getChargeById(parametreId, id) {
  const { supabase } = await import('../supabase.js')
  const { data, error } = await supabase
    .from('charges_recurrentes')
    .select('*')
    .eq('parametre_id', parametreId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getChargeById : ${error.message}`)
  return data || null
}

// ─── 3. listSuggestionsPending ──────────────────────────────────────
/**
 * Liste les suggestions en attente de validation pour un tenant.
 * Optionnel : filtrer sur un mois précis (format 'YYYY-MM').
 * Tri : par date_attendue croissante (ordre chronologique).
 *
 * @param {string} parametreId
 * @param {string} [mois] - Format 'YYYY-MM' (ex: '2026-05'). Si omis, toutes périodes.
 * @returns {Promise<Array<{
 *   id: string, charge_recurrente_id: string, mois: string, date_attendue: string,
 *   montant_suggere: number, fournisseur_suggere: string|null, formule_evaluee: string|null,
 *   statut: string, transaction_id: string|null, created_at: string, expires_at: string
 * }>>}
 *
 * @example
 *   const sug = await listSuggestionsPending('68f417f5-...', '2026-05')
 *   // → [{ date_attendue: '2026-05-01', montant_suggere: 2288.63, ... }, ...]
 */
export async function listSuggestionsPending(parametreId, mois) {
  const { supabase } = await import('../supabase.js')
  let query = supabase
    .from('charges_suggestions')
    .select('*')
    .eq('parametre_id', parametreId)
    .eq('statut', 'pending')
    .order('date_attendue', { ascending: true })
  if (mois) query = query.eq('mois', mois)
  const { data, error } = await query
  if (error) throw new Error(`listSuggestionsPending : ${error.message}`)
  return data || []
}

// ─── 4. listCandidatesPending ───────────────────────────────────────
/**
 * Liste les candidats récurrence détectés par IA (Lot 5/6) en attente
 * d'acceptation/dismissal.
 * Tri : par confiance_pct décroissante (les plus probables d'abord).
 *
 * @param {string} parametreId
 * @returns {Promise<Array<{
 *   id: string, fournisseur_nom_norm: string, fournisseur_nom_brut: string,
 *   categorie_pl: string, nb_observations: number, montant_median: number,
 *   montant_ecart_pct: number|null, intervalle_jours_median: number,
 *   derniere_date: string, premiere_date: string, confiance_pct: number,
 *   hints_llm: object, statut: string, created_at: string, updated_at: string
 * }>>}
 *
 * @example
 *   const cands = await listCandidatesPending('68f417f5-...')
 *   // → [{ fournisseur_nom_brut: 'Vérisure', confiance_pct: 92, montant_median: 89, ... }, ...]
 */
export async function listCandidatesPending(parametreId) {
  const { supabase } = await import('../supabase.js')
  const { data, error } = await supabase
    .from('recurrence_candidates')
    .select('*')
    .eq('parametre_id', parametreId)
    .eq('statut', 'pending')
    .order('confiance_pct', { ascending: false })
  if (error) throw new Error(`listCandidatesPending : ${error.message}`)
  return data || []
}

// ─── 5. listIgnores ─────────────────────────────────────────────────
/**
 * Liste les patterns ignorés par le tenant (apprentissage refus).
 * Utilisé par Lot 5/6 pour exclure les fournisseurs déjà refusés
 * du scan détection.
 * Tri : par created_at décroissante (plus récents d'abord, pour UI).
 *
 * @param {string} parametreId
 * @returns {Promise<Array<{
 *   id: string, cle: string, motif: string|null, ne_plus_proposer: boolean,
 *   created_at: string
 * }>>}
 *
 * @example
 *   const ignores = await listIgnores('68f417f5-...')
 *   // → [{ cle: 'fournisseur:carrefour', motif: 'achat ponctuel', ... }, ...]
 *   const fournisseursIgnores = ignores
 *     .filter(i => i.cle.startsWith('fournisseur:'))
 *     .map(i => i.cle.split(':', 2)[1])
 */
export async function listIgnores(parametreId) {
  const { supabase } = await import('../supabase.js')
  const { data, error } = await supabase
    .from('charges_ignores')
    .select('*')
    .eq('parametre_id', parametreId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`listIgnores : ${error.message}`)
  return data || []
}
