// Détection IA Layer 1 — déterministe, statistique pure (pas d'IA).
// Lot 5 Charges Récurrentes V1.1.
// Cf. STRAT_CADRAGE.md §6.5, cadrage Section 4.
//
// Algo : grouper transactions par fournisseur normalisé sur fenêtre 6 mois,
// calculer médiane montant + intervalle, qualifier candidats récurrents
// si CV<0.30 + intervalle régulier + ≥3 occurrences + pas dans charges_ignores.
// UPSERT recurrence_candidates avec confiance_pct.
//
// Layer 2 (LLM Haiku enrichissement libellé/charge_type/profil) : Lot 6.

// ─── Constantes ─────────────────────────────────────────────────────
// Patch agrégation mensuelle (5/05/2026) : on regroupe les transactions
// par mois calendrier (YYYY-MM) pour chaque fournisseur, puis on calcule
// CV/intervalle sur les sums mensuels. Résout :
//   - Multi-factures même mois (Corhofi 2 abonnements, Prefiloc 1+frais...)
//   - Saisies dupliquées le même mois (loyer saisi 2× en avril)
//   - Dates non strictement régulières en jours (28-31j → toujours 1 mois)
const NB_MOIS_MIN = 3                   // nb mois distincts (pas nb transactions)
const CV_MAX = 0.30                     // coefficient variation sums mensuels (σ/médiane)
const CV_INTERVALLE_MAX = 0.20          // ratio σ/médiane sur écarts en mois
const FENETRE_JOURS = 180               // 6 mois roulants

// Plages d'écarts en mois calendrier acceptées
const PLAGES_INTERVALLE = [
  { val: 1,  freq: 'mensuel' },
  { val: 3,  freq: 'trimestriel' },
  { val: 6,  freq: 'semestriel' },
  { val: 12, freq: 'annuel' },
]

// ─── Helpers ────────────────────────────────────────────────────────
export function normaliserFournisseur(nom) {
  if (!nom) return ''
  return nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function mediane(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function ecartType(arr) {
  if (arr.length < 2) return 0
  const moy = arr.reduce((s, x) => s + x, 0) / arr.length
  const variance = arr.reduce((s, x) => s + (x - moy) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

// Agrège les items d'un fournisseur par mois calendrier (YYYY-MM).
// Returns { 'YYYY-MM': sum_montants_du_mois, ... }
function sumsParMois(items) {
  const out = {}
  for (const it of items) {
    const mois = (it.date || '').slice(0, 7)
    if (!mois) continue
    out[mois] = (out[mois] || 0) + Number(it.montant)
  }
  return out
}

// Écarts en mois calendrier entre mois consécutifs.
// Ex: ['2025-11', '2025-12', '2026-01', '2026-04'] → [1, 1, 3]
function ecartsEnMois(moisISO) {
  const sorted = [...moisISO].sort()
  const out = []
  for (let i = 1; i < sorted.length; i++) {
    const [y1, m1] = sorted[i - 1].split('-').map(Number)
    const [y2, m2] = sorted[i].split('-').map(Number)
    out.push((y2 - y1) * 12 + (m2 - m1))
  }
  return out
}

function trouverPlage(intervalleMedianMois) {
  return PLAGES_INTERVALLE.find(p => p.val === intervalleMedianMois) || null
}

// Convertit médiane en mois → médiane équivalente en jours (pour rétro-compat
// du champ recurrence_candidates.intervalle_jours_median qui reste en jours).
function moisVersJours(mois) {
  return Math.round(mois * 30.44)  // 365.25 / 12 ≈ 30.44 jours/mois
}

// ─── Algo principal ─────────────────────────────────────────────────
/**
 * Détecte les fournisseurs récurrents pour un tenant.
 * @param {Array} transactions - rows transactions du tenant (avec fournisseur_nom, montant_ttc, date, categorie_pl)
 * @param {Set<string>} ignoresFournisseursNorm - set des fournisseur_nom_norm déjà ignorés
 * @returns {Array<{
 *   fournisseur_nom_norm, fournisseur_nom_brut, categorie_pl,
 *   nb_observations, montant_median, montant_ecart_pct,
 *   intervalle_jours_median, derniere_date, premiere_date,
 *   confiance_pct, frequence_inferee
 * }>}
 */
export function detecterCandidats(transactions, ignoresFournisseursNorm = new Set()) {
  // 1. Grouper par fournisseur_nom_norm, exclure consommations
  const groupes = {}
  for (const t of (transactions || [])) {
    if (!t.fournisseur_nom || !t.date || !t.montant_ttc) continue
    if (t.categorie_pl === 'consommations') continue
    const norm = normaliserFournisseur(t.fournisseur_nom)
    if (!norm) continue
    if (ignoresFournisseursNorm.has(norm)) continue

    if (!groupes[norm]) {
      groupes[norm] = {
        fournisseur_nom_brut: t.fournisseur_nom,
        categorie_pl: t.categorie_pl,
        items: [],
      }
    }
    groupes[norm].items.push({ date: t.date, montant: Number(t.montant_ttc) })
  }

  // 2. Qualifier chaque groupe — agrégation mensuelle puis stats
  const candidats = []
  for (const [norm, g] of Object.entries(groupes)) {
    // Agrège par mois calendrier
    const parMois = sumsParMois(g.items)
    const moisDistincts = Object.keys(parMois)
    if (moisDistincts.length < NB_MOIS_MIN) continue

    // Stats sur sums mensuels
    const sums = Object.values(parMois)
    const medianMontant = mediane(sums)
    if (medianMontant <= 0) continue
    const sigmaMontant = ecartType(sums)
    const cv = sigmaMontant / medianMontant
    if (cv >= CV_MAX) continue

    // Écarts en mois calendrier
    const ecarts = ecartsEnMois(moisDistincts)
    if (ecarts.length === 0) continue
    const medianEcart = mediane(ecarts)
    const sigmaEcart = ecartType(ecarts)
    const cvEcart = medianEcart > 0 ? sigmaEcart / medianEcart : 1
    if (cvEcart >= CV_INTERVALLE_MAX) continue

    const plage = trouverPlage(Math.round(medianEcart))
    if (!plage) continue  // hors plages régulières connues

    // 3. Confiance pct (basée sur nb mois, pas nb transactions)
    const confiance = Math.max(30, Math.min(95, Math.round(
      100 * (1 - cv) * (1 - cvEcart) * Math.min(moisDistincts.length / 6, 1)
    )))

    const datesAll = g.items.map(i => i.date).sort()
    candidats.push({
      fournisseur_nom_norm: norm,
      fournisseur_nom_brut: g.fournisseur_nom_brut,
      categorie_pl: g.categorie_pl,
      nb_observations: moisDistincts.length,  // = nb mois distincts (sémantique post-agrégation)
      montant_median: Math.round(medianMontant * 100) / 100,
      montant_ecart_pct: Math.round(cv * 100 * 100) / 100,
      intervalle_jours_median: moisVersJours(medianEcart),  // converti en jours pour rétro-compat schéma BDD
      derniere_date: datesAll[datesAll.length - 1],
      premiere_date: datesAll[0],
      confiance_pct: confiance,
      frequence_inferee: plage.freq,
    })
  }

  return candidats.sort((a, b) => b.confiance_pct - a.confiance_pct)
}

/**
 * Pipeline complet : fetch transactions + ignores, run algo, UPSERT candidats.
 * @returns {Promise<{ nb_candidats, nb_inserts, nb_updates, candidats }>}
 */
export async function scannerEtUpserter(parametreId, options = {}) {
  const { supabase } = await import('../supabase.js')
  const fenetreJours = options.fenetreJours || FENETRE_JOURS

  const dateMax = options.dateMax || new Date().toISOString().slice(0, 10)
  const dateMinDate = new Date(dateMax + 'T00:00:00Z')
  dateMinDate.setUTCDate(dateMinDate.getUTCDate() - fenetreJours)
  const dateMin = dateMinDate.toISOString().slice(0, 10)

  // Fetch transactions
  const { data: transactions, error: tErr } = await supabase
    .from('transactions')
    .select('fournisseur_nom, montant_ttc, date, categorie_pl')
    .eq('parametre_id', parametreId)
    .gte('date', dateMin).lte('date', dateMax)
  if (tErr) throw new Error(`scannerEtUpserter transactions : ${tErr.message}`)

  // Fetch ignores fournisseur (cle starts with 'fournisseur:')
  const { data: ignores, error: iErr } = await supabase
    .from('charges_ignores')
    .select('cle')
    .eq('parametre_id', parametreId)
    .like('cle', 'fournisseur:%')
  if (iErr) throw new Error(`scannerEtUpserter ignores : ${iErr.message}`)
  const ignoresFournisseursNorm = new Set(
    (ignores || []).map(i => i.cle.split(':').slice(1).join(':'))
  )

  const candidats = detecterCandidats(transactions || [], ignoresFournisseursNorm)

  // UPSERT par batch
  let nbInserts = 0, nbUpdates = 0
  for (const c of candidats) {
    // Check existence pour distinguer insert vs update (logging)
    const { data: existing } = await supabase
      .from('recurrence_candidates')
      .select('id, statut')
      .eq('parametre_id', parametreId)
      .eq('fournisseur_nom_norm', c.fournisseur_nom_norm)
      .maybeSingle()

    // Si déjà accepted/dismissed, skip (ne pas ressusciter)
    if (existing && (existing.statut === 'accepted' || existing.statut === 'dismissed')) continue

    const payload = {
      parametre_id: parametreId,
      fournisseur_nom_norm: c.fournisseur_nom_norm,
      fournisseur_nom_brut: c.fournisseur_nom_brut,
      categorie_pl: c.categorie_pl,
      nb_observations: c.nb_observations,
      montant_median: c.montant_median,
      montant_ecart_pct: c.montant_ecart_pct,
      intervalle_jours_median: c.intervalle_jours_median,
      derniere_date: c.derniere_date,
      premiere_date: c.premiere_date,
      confiance_pct: c.confiance_pct,
      hints_llm: { frequence_inferee: c.frequence_inferee },
      statut: 'pending',
      updated_at: new Date().toISOString(),
    }

    const { error: upErr } = await supabase
      .from('recurrence_candidates')
      .upsert(payload, { onConflict: 'parametre_id,fournisseur_nom_norm' })

    if (upErr) throw new Error(`UPSERT candidat ${c.fournisseur_nom_norm} : ${upErr.message}`)
    if (existing) nbUpdates++
    else nbInserts++
  }

  return {
    nb_candidats: candidats.length,
    nb_inserts: nbInserts,
    nb_updates: nbUpdates,
    candidats,
  }
}
