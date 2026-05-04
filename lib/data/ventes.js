// Helper centralisé pour lectures du data layer V1 (Sprint Migration étape 5).
// Cf. PLANNING_V1.md §Sprint Migration data layer Étape 5, CLAUDE.md §6 règle 2 (parametre_id partout).
//
// Toutes les lectures de `historique_ca` et `entrees` côté code applicatif
// doivent passer par ce helper. Voir scripts/check-no-direct-legacy-reads.mjs
// pour le garde-fou anti-contournement.
//
// Sémantique préservée vs legacy historique_ca (UX figée par Mounir, étape 5
// invisible utilisateur, cf. Q3 du cadrage étape 5) :
//   - getCaBrut(parametreId, date) ≈ historique_ca.ca_brut legacy
//     (= popina_TTC + uber_TTC, mélange caisse + plateformes)
//   - getNbCommandesCaisse(parametreId, date) ≈ historique_ca.nb_commandes legacy
//     (= popina seul, pas de somme avec uber, cf. Q4 du cadrage)
//   - getVentilation(parametreId, date) ≈ historique_ca.{especes, cb+tpa, tr}
//     (paiements_caisse a déjà la fusion D3 TPA→cb appliquée à l'écriture)
//
// Composantes séparées exposées (résolution dette F1 côté data) :
//   - getCaCaisse() = popina seul (sans plateformes)
//   - getCaPlateformes() = uber_eats + futures plateformes (sans caisse)
//
// Comportement sur trou (pas de fallback HCA, cf. Q2 du cadrage) :
//   - Si VPS popina absent pour la date → la fonction retourne null
//   - Pour les sums sur période, expose nb_jours_couverts distinct du sum

// ─── Constantes ─────────────────────────────────────────────────────
// V1 mono-tenant Krousty. TODO V1+ : fetch dynamique via parametreId.
const PARAMETRE_ID_KROUSTY    = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'
const SOURCE_POPINA_ID        = 'a4e92432-7d3c-4b3f-aafb-745d19e6b2f8'
const SOURCE_UBER_EATS_ID     = '888b047c-54d9-4c05-a364-5e1a9c6a9409'

// TVA Uber Eats opiniâtre (10% restauration sur place / livraison FR).
// Cf. CLAUDE.md §4 (TVA FR opiniâtre, jamais paramétrable).
// Utilisé pour reconstituer le HT depuis montant_ttc Uber (legacy formula).
const TVA_UBER_EATS = 1.10

// ─── Helpers ────────────────────────────────────────────────────────
const r2 = n => Math.round(n * 100) / 100

function listDates(dateMin, dateMax) {
  const out = []
  const cur = new Date(dateMin + 'T00:00:00Z')
  const end = new Date(dateMax + 'T00:00:00Z')
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

// ─── 1. getCaBrut ───────────────────────────────────────────────────
/**
 * CA brut total (caisse + plateformes) pour une date.
 * Reproduit la sémantique historique_ca.ca_brut legacy.
 * @returns null si VPS popina absent ; sum popina + uber sinon
 */
export async function getCaBrut(parametreId, date) {
  const popina = await getCaCaisse(parametreId, date)
  if (popina === null) return null
  const uber = await getCaPlateformes(parametreId, date)
  return r2(popina + (uber || 0))
}

// ─── 2. getCaBrutSomme ──────────────────────────────────────────────
/**
 * Somme du CA brut sur une période [dateMin, dateMax] inclus.
 * @returns { sum, nb_jours_couverts, nb_jours_attendus }
 */
export async function getCaBrutSomme(parametreId, dateMin, dateMax) {
  const { supabase } = await import('../supabase.js')
  const { data, error } = await supabase
    .from('ventes_par_source')
    .select('date, montant_ttc, source_id')
    .eq('parametre_id', parametreId)
    .gte('date', dateMin).lte('date', dateMax)
    .in('source_id', [SOURCE_POPINA_ID, SOURCE_UBER_EATS_ID])
  if (error) throw new Error(`getCaBrutSomme : ${error.message}`)

  const datesPopina = new Set()
  let sum = 0
  for (const r of data || []) {
    sum += Number(r.montant_ttc || 0)
    if (r.source_id === SOURCE_POPINA_ID) datesPopina.add(r.date)
  }
  return {
    sum: r2(sum),
    nb_jours_couverts: datesPopina.size,
    nb_jours_attendus: listDates(dateMin, dateMax).length,
  }
}

// ─── 3. getCaCaisse ─────────────────────────────────────────────────
/**
 * CA caisse Restaurant seul (popina, hors plateformes).
 * @returns null si VPS popina absent ; montant_ttc sinon
 */
export async function getCaCaisse(parametreId, date) {
  const { supabase } = await import('../supabase.js')
  const { data, error } = await supabase
    .from('ventes_par_source')
    .select('montant_ttc')
    .eq('parametre_id', parametreId)
    .eq('date', date)
    .eq('source_id', SOURCE_POPINA_ID)
    .maybeSingle()
  if (error) throw new Error(`getCaCaisse : ${error.message}`)
  return data ? r2(Number(data.montant_ttc || 0)) : null
}

// ─── 4. getCaPlateformes ────────────────────────────────────────────
/**
 * CA plateformes (uber_eats + futures) pour une date.
 * @returns null si VPS uber_eats absent ; sum montant_ttc sinon
 */
export async function getCaPlateformes(parametreId, date) {
  const { supabase } = await import('../supabase.js')
  const { data, error } = await supabase
    .from('ventes_par_source')
    .select('montant_ttc')
    .eq('parametre_id', parametreId)
    .eq('date', date)
    .eq('source_id', SOURCE_UBER_EATS_ID)
    .maybeSingle()
  if (error) throw new Error(`getCaPlateformes : ${error.message}`)
  return data ? r2(Number(data.montant_ttc || 0)) : null
}

// ─── 5. getNbCommandesCaisse ────────────────────────────────────────
/**
 * Nb commandes caisse Restaurant seul (popina, sans uber, continuité legacy).
 * @returns null si VPS popina absent ; nb_commandes sinon (peut être null DB)
 */
export async function getNbCommandesCaisse(parametreId, date) {
  const { supabase } = await import('../supabase.js')
  const { data, error } = await supabase
    .from('ventes_par_source')
    .select('nb_commandes')
    .eq('parametre_id', parametreId)
    .eq('date', date)
    .eq('source_id', SOURCE_POPINA_ID)
    .maybeSingle()
  if (error) throw new Error(`getNbCommandesCaisse : ${error.message}`)
  return data ? data.nb_commandes : null
}

// ─── 6. getVentilation ──────────────────────────────────────────────
/**
 * Ventilation paiements caisse pour une date (fusion D3 TPA→cb déjà appliquée à l'écriture).
 * @returns null si paiements_caisse absent ; { especes, cb, tr } sinon
 */
export async function getVentilation(parametreId, date) {
  const { supabase } = await import('../supabase.js')
  const { data, error } = await supabase
    .from('paiements_caisse')
    .select('especes, cb, tr')
    .eq('parametre_id', parametreId)
    .eq('date', date)
    .maybeSingle()
  if (error) throw new Error(`getVentilation : ${error.message}`)
  if (!data) return null
  return {
    especes: r2(Number(data.especes || 0)),
    cb: r2(Number(data.cb || 0)),
    tr: r2(Number(data.tr || 0)),
  }
}

// ─── 8. getDerniereDateAvecCreatedAt (M1) ───────────────────────────
/**
 * Dernière date popina enregistrée + son created_at (= date d'écriture en BDD).
 *
 * ⚠️ Caveat sémantique : `created_at` reflète la date d'écriture en BDD
 * (cron étape 4 ou backfill rétroactif), pas la date à laquelle le user
 * a saisi la donnée. Pour les rows backfillées (étapes 2+3+3-bis+3-ter),
 * created_at = date du backfill, pas la date métier. Pour les rows
 * écrites par le cron étape 4 forward, created_at ≈ date métier + ~02h30
 * UTC du jour suivant.
 *
 * @returns null si aucune row VPS popina ; { date, created_at } sinon
 */
export async function getDerniereDateAvecCreatedAt(parametreId) {
  const { supabase } = await import('../supabase.js')
  const { data, error } = await supabase
    .from('ventes_par_source')
    .select('date, created_at')
    .eq('parametre_id', parametreId)
    .eq('source_id', SOURCE_POPINA_ID)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getDerniereDateAvecCreatedAt : ${error.message}`)
  return data || null
}

// ─── 9. getCaBrutParJour (M2) ───────────────────────────────────────
/**
 * CA brut agrégé jour par jour sur une période (popina_TTC + uber_TTC).
 * Une seule requête BDD pour la fenêtre, agrégation côté JS.
 * Optimisation pour remplacer N×getCaBrut() en boucle.
 *
 * @returns Array<{ date, ca_brut }> trié par date ascendante.
 *          Inclut uniquement les dates où popina existe (cohérent getCaBrut).
 */
export async function getCaBrutParJour(parametreId, dateMin, dateMax) {
  const { supabase } = await import('../supabase.js')
  const { data, error } = await supabase
    .from('ventes_par_source')
    .select('date, montant_ttc, source_id')
    .eq('parametre_id', parametreId)
    .gte('date', dateMin).lte('date', dateMax)
    .in('source_id', [SOURCE_POPINA_ID, SOURCE_UBER_EATS_ID])
  if (error) throw new Error(`getCaBrutParJour : ${error.message}`)

  const popinaParDate = {}
  const uberParDate = {}
  for (const r of data || []) {
    const m = Number(r.montant_ttc || 0)
    if (r.source_id === SOURCE_POPINA_ID) popinaParDate[r.date] = (popinaParDate[r.date] || 0) + m
    else if (r.source_id === SOURCE_UBER_EATS_ID) uberParDate[r.date] = (uberParDate[r.date] || 0) + m
  }
  return Object.keys(popinaParDate).sort().map(date => ({
    date,
    ca_brut: r2(popinaParDate[date] + (uberParDate[date] || 0)),
  }))
}

// ─── 10. getCaHtSomme (M3) ──────────────────────────────────────────
/**
 * Somme HT sur une période, reproduit la formule legacy :
 *   sum(historique_ca.ca_ht) + sum(historique_ca.uber)/TVA_UBER_EATS
 *   + sum(entrees.uber_eats.montant_ttc)/TVA_UBER_EATS
 * Côté nouvelles tables : sum(VPS popina.montant_ht) + sum(VPS uber_eats.montant_ttc)/TVA_UBER_EATS
 *
 * @returns number — sum HT en euros (arrondi 2 décimales)
 */
export async function getCaHtSomme(parametreId, dateMin, dateMax) {
  const { supabase } = await import('../supabase.js')
  const { data, error } = await supabase
    .from('ventes_par_source')
    .select('montant_ht, montant_ttc, source_id')
    .eq('parametre_id', parametreId)
    .gte('date', dateMin).lte('date', dateMax)
    .in('source_id', [SOURCE_POPINA_ID, SOURCE_UBER_EATS_ID])
  if (error) throw new Error(`getCaHtSomme : ${error.message}`)

  let sumHt = 0
  for (const r of data || []) {
    if (r.source_id === SOURCE_POPINA_ID) sumHt += Number(r.montant_ht || 0)
    else if (r.source_id === SOURCE_UBER_EATS_ID) sumHt += Number(r.montant_ttc || 0) / TVA_UBER_EATS
  }
  return r2(sumHt)
}

// ─── 11. getRowsCompatHCA — adaptateur rétro-compat auditerJournal ──
/**
 * ADAPTATEUR rétro-compat pour auditerJournal — à retirer quand
 * audit-saisies sera refondu (V1+).
 * Reconstitue la structure historique_ca legacy depuis VPS+PC.
 *
 * @returns Array<{ date, ca_brut, ca_ht, especes, cb, tpa, tr, uber, nb_commandes }>
 *          tpa = 0 (fusion D3 appliquée à l'écriture, cf. étape 3-ter).
 *          uber = 0 si pas de ligne VPS uber_eats (legacy : 0 si pas de saisie).
 *          Inclut toutes les dates où popina OU uber existe dans la période.
 */
export async function getRowsCompatHCA(parametreId, dateMin, dateMax) {
  const { supabase } = await import('../supabase.js')
  const [vpsRes, pcRes] = await Promise.all([
    supabase
      .from('ventes_par_source')
      .select('date, montant_ttc, montant_ht, nb_commandes, source_id')
      .eq('parametre_id', parametreId)
      .gte('date', dateMin).lte('date', dateMax)
      .in('source_id', [SOURCE_POPINA_ID, SOURCE_UBER_EATS_ID]),
    supabase
      .from('paiements_caisse')
      .select('date, especes, cb, tr')
      .eq('parametre_id', parametreId)
      .gte('date', dateMin).lte('date', dateMax),
  ])
  if (vpsRes.error) throw new Error(`getRowsCompatHCA VPS : ${vpsRes.error.message}`)
  if (pcRes.error) throw new Error(`getRowsCompatHCA PC : ${pcRes.error.message}`)

  const popinaParDate = {}
  const uberParDate = {}
  for (const r of vpsRes.data || []) {
    if (r.source_id === SOURCE_POPINA_ID) popinaParDate[r.date] = r
    else if (r.source_id === SOURCE_UBER_EATS_ID) uberParDate[r.date] = r
  }
  const pcParDate = {}
  for (const r of pcRes.data || []) pcParDate[r.date] = r

  const allDates = new Set([...Object.keys(popinaParDate), ...Object.keys(uberParDate)])
  return [...allDates].sort().map(date => {
    const p = popinaParDate[date]
    const u = uberParDate[date]
    const pc = pcParDate[date]
    return {
      date,
      ca_brut: r2((p ? Number(p.montant_ttc || 0) : 0) + (u ? Number(u.montant_ttc || 0) : 0)),
      ca_ht: p ? r2(Number(p.montant_ht || 0)) : 0,
      especes: pc ? r2(Number(pc.especes || 0)) : 0,
      cb: pc ? r2(Number(pc.cb || 0)) : 0,
      tpa: 0,  // fusion D3 — TPA est inclus dans cb depuis étape 3-ter
      tr: pc ? r2(Number(pc.tr || 0)) : 0,
      uber: u ? r2(Number(u.montant_ttc || 0)) : 0,
      nb_commandes: p ? p.nb_commandes : null,
    }
  })
}

// ─── 7. getCouverture ───────────────────────────────────────────────
/**
 * Diagnostic de couverture VPS popina sur une période.
 * @returns { nb_jours_attendus, nb_jours_couverts, dates_manquantes }
 */
export async function getCouverture(parametreId, dateMin, dateMax) {
  const { supabase } = await import('../supabase.js')
  const { data, error } = await supabase
    .from('ventes_par_source')
    .select('date')
    .eq('parametre_id', parametreId)
    .gte('date', dateMin).lte('date', dateMax)
    .eq('source_id', SOURCE_POPINA_ID)
  if (error) throw new Error(`getCouverture : ${error.message}`)
  const datesPresentes = new Set((data || []).map(r => r.date))
  const datesAttendues = listDates(dateMin, dateMax)
  const datesManquantes = datesAttendues.filter(d => !datesPresentes.has(d))
  return {
    nb_jours_attendus: datesAttendues.length,
    nb_jours_couverts: datesPresentes.size,
    dates_manquantes: datesManquantes,
  }
}

// ─── Tests inline ────────────────────────────────────────────────────
import { fileURLToPath } from 'node:url'
import { readFileSync as _rf, existsSync as _ex } from 'node:fs'
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Charger .env.local pour les vars Supabase
  const envPath = '/Users/mRharasse/strat/.env.local'
  if (_ex(envPath)) {
    for (const line of _rf(envPath, 'utf-8').split('\n')) {
      const m = /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  }

  const k = PARAMETRE_ID_KROUSTY

  function assertNum(label, actual, expected, tol = 0.5) {
    const ok = actual !== null && Math.abs(actual - expected) <= tol
    console.log(`  ${ok ? '✓' : '✗'} ${label} : ${actual} (attendu ~${expected}, tol ±${tol})`)
    if (!ok) throw new Error(`✗ ${label} échec`)
  }
  function assertEq(label, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected)
    console.log(`  ${ok ? '✓' : '✗'} ${label} : ${JSON.stringify(actual)} (attendu ${JSON.stringify(expected)})`)
    if (!ok) throw new Error(`✗ ${label} échec`)
  }
  function assertNull(label, actual) {
    const ok = actual === null
    console.log(`  ${ok ? '✓' : '✗'} ${label} : ${actual} (attendu null)`)
    if (!ok) throw new Error(`✗ ${label} échec`)
  }

  console.log('━'.repeat(70))
  console.log('  TESTS lib/data/ventes.js')
  console.log('━'.repeat(70))

  // ─── Test 1 — date 2026-05-03 (post-comblement Phase 0 étape 5) ──
  console.log('\nTest 1 — date 2026-05-03 (Krousty)')
  assertNum('getCaCaisse', await getCaCaisse(k, '2026-05-03'), 2550.58, 0.5)
  const ttc1 = await getCaBrut(k, '2026-05-03')
  console.log(`  getCaBrut : ${ttc1} (popina + uber si présent)`)
  if (ttc1 < 2550 || ttc1 > 2600) throw new Error('getCaBrut hors plage attendue')
  const platfm1 = await getCaPlateformes(k, '2026-05-03')
  console.log(`  getCaPlateformes : ${platfm1} (peut être null si VPS uber absent)`)
  assertEq('getVentilation', await getVentilation(k, '2026-05-03'),
    { especes: 733.73, cb: 1788.85, tr: 28.00 })
  const nbCmd1 = await getNbCommandesCaisse(k, '2026-05-03')
  console.log(`  getNbCommandesCaisse : ${nbCmd1} (vérif manuelle vs HCA)`)

  // ─── Test 2 — date passée 2025-06-01 (étape 3-ter peuplée) ──────
  console.log('\nTest 2 — date 2025-06-01 (Krousty, post-étape 3-ter)')
  const caCaisse2 = await getCaCaisse(k, '2025-06-01')
  console.log(`  getCaCaisse : ${caCaisse2}`)
  if (caCaisse2 === null) throw new Error('getCaCaisse null sur date connue')
  const ventil2 = await getVentilation(k, '2025-06-01')
  console.log(`  getVentilation : ${JSON.stringify(ventil2)}`)
  if (!ventil2) throw new Error('getVentilation null sur date connue')

  // ─── Test 3 — date 2026-05-04 (= aujourd'hui, hors VPS+PC) ──────
  console.log('\nTest 3 — date 2026-05-04 (aujourd\'hui, hors VPS+PC)')
  assertNull('getCaCaisse', await getCaCaisse(k, '2026-05-04'))
  assertNull('getCaBrut', await getCaBrut(k, '2026-05-04'))
  assertNull('getVentilation', await getVentilation(k, '2026-05-04'))

  // ─── Test 4 — couverture juin 2025 (mois entier backfillé) ──────
  console.log('\nTest 4 — couverture juin 2025')
  const cov4 = await getCouverture(k, '2025-06-01', '2025-06-30')
  console.log(`  getCouverture : ${JSON.stringify(cov4)}`)
  if (cov4.nb_jours_attendus !== 30) throw new Error('nb_jours_attendus ≠ 30')
  if (cov4.nb_jours_couverts !== 30) throw new Error(`nb_jours_couverts ≠ 30 (got ${cov4.nb_jours_couverts}, manquantes : ${cov4.dates_manquantes.join(', ')})`)
  if (cov4.dates_manquantes.length !== 0) throw new Error('dates_manquantes ≠ []')

  // ─── Test 5 — couverture 01→04/05/2026 (4 jours, 04/05 manquant) ─
  console.log('\nTest 5 — couverture 01→04/05/2026')
  const cov5 = await getCouverture(k, '2026-05-01', '2026-05-04')
  console.log(`  getCouverture : ${JSON.stringify(cov5)}`)
  if (cov5.nb_jours_attendus !== 4) throw new Error('nb_jours_attendus ≠ 4')
  if (cov5.nb_jours_couverts !== 3) throw new Error(`nb_jours_couverts ≠ 3 (got ${cov5.nb_jours_couverts})`)
  if (cov5.dates_manquantes.length !== 1 || cov5.dates_manquantes[0] !== '2026-05-04') {
    throw new Error(`dates_manquantes inattendu : ${JSON.stringify(cov5.dates_manquantes)}`)
  }

  // ─── Test 6 — getCaBrutSomme sur même période ───────────────────
  console.log('\nTest 6 — getCaBrutSomme 2026-05-01 → 2026-05-04')
  const sum6 = await getCaBrutSomme(k, '2026-05-01', '2026-05-04')
  console.log(`  getCaBrutSomme : ${JSON.stringify(sum6)}`)
  if (sum6.nb_jours_attendus !== 4) throw new Error('nb_jours_attendus ≠ 4')
  if (sum6.nb_jours_couverts !== 3) throw new Error('nb_jours_couverts ≠ 3')
  if (sum6.sum < 2000 || sum6.sum > 30000) throw new Error(`sum hors plage : ${sum6.sum}`)

  // ─── Test 7 — getDerniereDateAvecCreatedAt (M1) ──────────────────
  console.log('\nTest 7 — getDerniereDateAvecCreatedAt')
  const last = await getDerniereDateAvecCreatedAt(k)
  console.log(`  result : ${JSON.stringify(last)}`)
  if (!last || !last.date || !last.created_at) throw new Error('M1 retour incomplet')
  if (last.date !== '2026-05-03') throw new Error(`M1 date attendue 2026-05-03, got ${last.date}`)

  // ─── Test 8 — getCaBrutParJour (M2) ──────────────────────────────
  console.log('\nTest 8 — getCaBrutParJour 2025-06-01 → 2025-06-03')
  const arr = await getCaBrutParJour(k, '2025-06-01', '2025-06-03')
  console.log(`  result : ${JSON.stringify(arr)}`)
  if (!Array.isArray(arr) || arr.length !== 3) throw new Error(`M2 attendu 3 rows, got ${arr.length}`)
  for (const row of arr) {
    if (!row.date || typeof row.ca_brut !== 'number' || row.ca_brut <= 0) {
      throw new Error(`M2 row invalide : ${JSON.stringify(row)}`)
    }
  }

  // ─── Test 9 — getCaHtSomme (M3) ──────────────────────────────────
  console.log('\nTest 9 — getCaHtSomme juin 2025')
  const sumHt = await getCaHtSomme(k, '2025-06-01', '2025-06-30')
  console.log(`  sum HT juin 2025 : ${sumHt} €`)
  if (typeof sumHt !== 'number' || sumHt < 50000 || sumHt > 200000) {
    throw new Error(`M3 sum hors plage attendue (50k-200k) : ${sumHt}`)
  }

  // ─── Test 10 — getRowsCompatHCA ──────────────────────────────────
  console.log('\nTest 10 — getRowsCompatHCA 2025-06-01 → 2025-06-03')
  const rows = await getRowsCompatHCA(k, '2025-06-01', '2025-06-03')
  console.log(`  nb rows : ${rows.length}`)
  console.log(`  row[0] : ${JSON.stringify(rows[0])}`)
  if (!Array.isArray(rows) || rows.length < 1) throw new Error('getRowsCompatHCA attendu ≥1 row')
  const r0 = rows[0]
  const expectedKeys = ['date', 'ca_brut', 'ca_ht', 'especes', 'cb', 'tpa', 'tr', 'uber', 'nb_commandes']
  for (const k2 of expectedKeys) {
    if (!(k2 in r0)) throw new Error(`getRowsCompatHCA row manque clé : ${k2}`)
  }
  if (r0.tpa !== 0) throw new Error(`getRowsCompatHCA tpa attendu = 0 (fusion D3), got ${r0.tpa}`)

  console.log()
  console.log('✓ Tous les tests OK')
  process.exit(0)
}
