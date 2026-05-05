// Script de convergence Sprint Migration data layer (étape 4 → étape 6 cutover).
// LECTURE PURE — aucune écriture BDD.
//
// Compare jour par jour HCA (legacy) vs (ventes_par_source.popina + paiements_caisse)
// pour valider la convergence avant cutover.
//
// 5 indicateurs (cf. cadrage étape 4 Q3) :
//   1. Égalité TTC      : HCA.ca_brut ↔ VPS.popina.montant_ttc (tolérance ±1€)
//   2. Égalité ventilation : HCA.especes ↔ PC.especes,
//                            HCA.cb + HCA.tpa ↔ PC.cb (FUSION D3 explicite),
//                            HCA.tr ↔ PC.tr (tolérance ±1€ par colonne)
//   3. Couverture date  : nb dates HCA vs VPS popina sur la fenêtre commune
//   4. Δ cumulé glissant : sum diff TTC sur 7j et 30j derniers jours communs
//   5. Liste outliers    : jours où |HCA.ca_brut - VPS.popina.montant_ttc| > 5€
//
// Critère cutover synthétique :
//   - 30 jours consécutifs de DUAL-WRITE (post-déploiement étape 4)
//   - Couverture 100% (toute date HCA présente dans VPS)
//   - 0 outlier > 5€
//   - Δ cumulé 30j < 50€
//
// Notion de "fenêtre dual-write" :
//   - Section "Comparaison globale" : tous les jours communs HCA ∩ VPS
//     (utile pour vérifier l'alignement du backfill historique)
//   - Section "Fenêtre dual-write" : depuis DUAL_WRITE_START_DATE
//     (à mettre à jour après le déploiement étape 4 vers la date du
//     premier cron post-déploiement, typiquement J+1 du déploiement)
//   - Verdict cutover s'évalue UNIQUEMENT sur la fenêtre dual-write stricte.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as pathResolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = pathResolve(__dirname, '..')
const envPath = pathResolve(projectRoot, '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const { supabase } = await import('../lib/supabase.js')

// ─── Constantes ─────────────────────────────────────────────────────
const KROUSTY = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'
const POPINA  = 'a4e92432-7d3c-4b3f-aafb-745d19e6b2f8'

// À mettre à jour après le déploiement étape 4 vers la date du premier
// cron post-déploiement (format ISO 'YYYY-MM-DD'). Si null → fenêtre
// dual-write considérée comme non démarrée.
// 2026-05-05 : 1er cron étape 4 effectivement passé (02:30 UTC), date du
// premier upsert dual-write VPS+PC en plus de HCA legacy.
const DUAL_WRITE_START_DATE = '2026-05-05'

const TOL_TTC = 1.00      // tolérance ±1€ par jour sur TTC
const TOL_COL = 1.00      // tolérance ±1€ par jour par colonne ventilation
const OUTLIER = 5.00      // seuil outlier sur TTC
const CUTOVER_DELTA_30J = 50.00  // Δ cumulé 30j max pour cutover

const r2 = n => Math.round(n * 100) / 100

async function pageAll(builder) {
  const all = []
  let from = 0
  const SIZE = 1000
  while (true) {
    const { data, error } = await builder().range(from, from + SIZE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < SIZE) break
    from += SIZE
  }
  return all
}

// ─── Fetch ──────────────────────────────────────────────────────────
console.log('━'.repeat(80))
console.log('  CHECK CONVERGENCE DATA LAYER — Sprint Migration étape 4 → étape 6')
console.log('━'.repeat(80))

const hcaRows = await pageAll(() => supabase
  .from('historique_ca').select('date, ca_brut, ca_ht, especes, cb, tpa, tr')
  .eq('parametre_id', KROUSTY).order('date', { ascending: true }))

const vpsRows = await pageAll(() => supabase
  .from('ventes_par_source').select('date, montant_ttc, montant_ht, nb_commandes')
  .eq('parametre_id', KROUSTY).eq('source_id', POPINA).order('date', { ascending: true }))

const pcRows = await pageAll(() => supabase
  .from('paiements_caisse').select('date, especes, cb, tr')
  .eq('parametre_id', KROUSTY).order('date', { ascending: true }))

console.log()
console.log(`  Rows fetchées :`)
console.log(`    historique_ca         : ${hcaRows.length}`)
console.log(`    ventes_par_source.popina : ${vpsRows.length}`)
console.log(`    paiements_caisse      : ${pcRows.length}`)

// ─── Index par date ─────────────────────────────────────────────────
const hca = Object.fromEntries(hcaRows.map(r => [r.date, r]))
const vps = Object.fromEntries(vpsRows.map(r => [r.date, r]))
const pc  = Object.fromEntries(pcRows.map(r => [r.date, r]))

// Dates communes HCA ∩ VPS
const datesCommunes = Object.keys(hca).filter(d => vps[d]).sort()

if (datesCommunes.length === 0) {
  console.log()
  console.log('ℹ️  Aucune date commune HCA ∩ VPS popina.')
  console.log('   Le dual-write n\'a pas encore commencé OU les tables sont désynchronisées.')
  console.log('━'.repeat(80))
  process.exit(0)
}

const dateMin = datesCommunes[0]
const dateMax = datesCommunes[datesCommunes.length - 1]

// ─── SECTION 1 — Comparaison globale (tous jours communs) ──────────
console.log()
console.log('━'.repeat(80))
console.log(`  SECTION 1 — COMPARAISON GLOBALE (tous jours communs)`)
console.log(`  Fenêtre : ${dateMin} → ${dateMax} (${datesCommunes.length} dates communes)`)
console.log(`  Note : inclut le backfill historique. Le verdict cutover se base sur la SECTION 2.`)
console.log('━'.repeat(80))

// ─── Indicateur 1 — Égalité TTC ─────────────────────────────────────
let ttcOk = 0, ttcEcart = 0, ttcMaxAbs = 0, ttcSumAbs = 0
const outliers = []
for (const d of datesCommunes) {
  const h = Number(hca[d].ca_brut || 0)
  const v = Number(vps[d].montant_ttc || 0)
  const diff = r2(h - v)
  if (Math.abs(diff) <= TOL_TTC) ttcOk++
  else ttcEcart++
  if (Math.abs(diff) > ttcMaxAbs) ttcMaxAbs = Math.abs(diff)
  ttcSumAbs += Math.abs(diff)
  if (Math.abs(diff) > OUTLIER) outliers.push({ date: d, hca: h, vps: v, diff })
}
console.log()
console.log(`  Indicateur 1 — Égalité TTC (HCA.ca_brut ↔ VPS.popina.montant_ttc, tolérance ±${TOL_TTC}€)`)
console.log(`    Jours OK            : ${ttcOk} / ${datesCommunes.length}`)
console.log(`    Jours en écart      : ${ttcEcart}`)
console.log(`    Max écart absolu    : ${r2(ttcMaxAbs).toFixed(2)} €`)
console.log(`    Sum écarts absolus  : ${r2(ttcSumAbs).toFixed(2)} €`)

// ─── Indicateur 2 — Égalité ventilation paiements ───────────────────
// Fusion D3 explicite : HCA.cb + HCA.tpa ↔ PC.cb
const datesPC = datesCommunes.filter(d => pc[d])
let espOk = 0, espEcart = 0, espMaxAbs = 0
let cbOk = 0,  cbEcart = 0,  cbMaxAbs = 0
let trOk = 0,  trEcart = 0,  trMaxAbs = 0
for (const d of datesPC) {
  const hEsp = Number(hca[d].especes || 0)
  const hCb  = Number(hca[d].cb || 0) + Number(hca[d].tpa || 0)  // FUSION D3
  const hTr  = Number(hca[d].tr || 0)
  const pEsp = Number(pc[d].especes || 0)
  const pCb  = Number(pc[d].cb || 0)
  const pTr  = Number(pc[d].tr || 0)
  const dEsp = Math.abs(hEsp - pEsp)
  const dCb  = Math.abs(hCb - pCb)
  const dTr  = Math.abs(hTr - pTr)
  if (dEsp <= TOL_COL) espOk++; else espEcart++
  if (dCb  <= TOL_COL) cbOk++;  else cbEcart++
  if (dTr  <= TOL_COL) trOk++;  else trEcart++
  if (dEsp > espMaxAbs) espMaxAbs = dEsp
  if (dCb  > cbMaxAbs)  cbMaxAbs  = dCb
  if (dTr  > trMaxAbs)  trMaxAbs  = dTr
}
console.log()
console.log(`  Indicateur 2 — Égalité ventilation paiements (HCA ↔ PC, fusion D3 explicite)`)
console.log(`    Sur ${datesPC.length} jours communs HCA ∩ PC :`)
console.log(`    especes      : ${espOk} OK / ${espEcart} écart, max ${r2(espMaxAbs).toFixed(2)} €`)
console.log(`    cb (HCA.cb + HCA.tpa ↔ PC.cb)  : ${cbOk} OK / ${cbEcart} écart, max ${r2(cbMaxAbs).toFixed(2)} €`)
console.log(`    tr           : ${trOk} OK / ${trEcart} écart, max ${r2(trMaxAbs).toFixed(2)} €`)

// ─── Indicateur 3 — Couverture date ─────────────────────────────────
const datesHca = new Set(Object.keys(hca))
const datesVps = new Set(Object.keys(vps))
const enHcaPasVps = [...datesHca].filter(d => !datesVps.has(d)).sort()
const enVpsPasHca = [...datesVps].filter(d => !datesHca.has(d)).sort()
console.log()
console.log(`  Indicateur 3 — Couverture date`)
console.log(`    Dates HCA total      : ${datesHca.size}`)
console.log(`    Dates VPS popina     : ${datesVps.size}`)
console.log(`    En HCA mais pas VPS  : ${enHcaPasVps.length} ${enHcaPasVps.length > 0 ? `(top 5 : ${enHcaPasVps.slice(0, 5).join(', ')})` : ''}`)
console.log(`    En VPS mais pas HCA  : ${enVpsPasHca.length} ${enVpsPasHca.length > 0 ? `(top 5 : ${enVpsPasHca.slice(0, 5).join(', ')})` : ''}`)

// ─── Indicateur 4 — Δ cumulé glissant 7j / 30j ──────────────────────
const last30 = datesCommunes.slice(-30)
const last7  = datesCommunes.slice(-7)
const delta7 = r2(last7.reduce((s, d) => s + Number(hca[d].ca_brut || 0) - Number(vps[d].montant_ttc || 0), 0))
const delta30 = r2(last30.reduce((s, d) => s + Number(hca[d].ca_brut || 0) - Number(vps[d].montant_ttc || 0), 0))
console.log()
console.log(`  Indicateur 4 — Δ cumulé glissant`)
console.log(`    Δ cumulé 7 derniers jours  : ${delta7.toFixed(2)} € (sur ${last7.length} jours)`)
console.log(`    Δ cumulé 30 derniers jours : ${delta30.toFixed(2)} € (sur ${last30.length} jours)`)

// ─── Indicateur 5 — Liste outliers ──────────────────────────────────
console.log()
console.log(`  Indicateur 5 — Outliers (|HCA - VPS| > ${OUTLIER}€)`)
console.log(`    Total : ${outliers.length} jour(s)`)
if (outliers.length > 0) {
  const top10 = outliers.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 10)
  console.log(`    Top 10 par écart absolu :`)
  for (const o of top10) {
    console.log(`      ${o.date} : HCA ${o.hca.toFixed(2)} | VPS ${o.vps.toFixed(2)} | Δ ${o.diff.toFixed(2)} €`)
  }
}

// ─── SECTION 2 — Fenêtre dual-write stricte ────────────────────────
console.log()
console.log('━'.repeat(80))
console.log('  SECTION 2 — FENÊTRE DUAL-WRITE STRICTE (verdict cutover)')
console.log('━'.repeat(80))

if (!DUAL_WRITE_START_DATE) {
  console.log()
  console.log('  ℹ️  DUAL_WRITE_START_DATE = null')
  console.log('     → Le dual-write n\'a pas encore démarré (cron étape 4 pas déployé,')
  console.log('       ou la constante n\'a pas été mise à jour après déploiement).')
  console.log('     Mettre à jour la constante DUAL_WRITE_START_DATE en haut du script')
  console.log('     vers la date du premier cron post-déploiement (typiquement J+1).')
  console.log()
  console.log('  ℹ️  FENÊTRE TROP COURTE (<30j) → cutover non recommandé.')
  console.log('━'.repeat(80))
  process.exit(0)
}

const dwDates = datesCommunes.filter(d => d >= DUAL_WRITE_START_DATE)
console.log()
console.log(`  Fenêtre dual-write : ${DUAL_WRITE_START_DATE} → ${dateMax} (${dwDates.length} jours)`)

if (dwDates.length === 0) {
  console.log()
  console.log('  ℹ️  Aucun jour dans la fenêtre dual-write encore présent dans HCA ∩ VPS.')
  console.log('  ℹ️  FENÊTRE TROP COURTE (<30j) → cutover non recommandé.')
  console.log('━'.repeat(80))
  process.exit(0)
}

// Recalcule indicateurs sur la fenêtre dual-write
let dwTtcOk = 0, dwTtcOutliers = 0, dwTtcSumDiff = 0
for (const d of dwDates) {
  const diff = r2(Number(hca[d].ca_brut || 0) - Number(vps[d].montant_ttc || 0))
  if (Math.abs(diff) <= TOL_TTC) dwTtcOk++
  if (Math.abs(diff) > OUTLIER) dwTtcOutliers++
  dwTtcSumDiff += diff
}
const dwSumDiff = r2(dwTtcSumDiff)
const dwCoverage = (dwTtcOk / dwDates.length * 100).toFixed(1)

console.log(`    Jours OK (|Δ TTC| ≤ ${TOL_TTC}€)     : ${dwTtcOk}/${dwDates.length} (${dwCoverage}%)`)
console.log(`    Outliers (|Δ TTC| > ${OUTLIER}€)      : ${dwTtcOutliers}`)
console.log(`    Δ cumulé sur la fenêtre  : ${dwSumDiff.toFixed(2)} €`)

// ─── Verdict cutover ────────────────────────────────────────────────
const reasons = []
if (dwDates.length < 30) reasons.push(`fenêtre trop courte (${dwDates.length}j < 30j)`)
if (dwTtcOk !== dwDates.length) reasons.push(`couverture < 100% (${dwTtcOk}/${dwDates.length})`)
if (dwTtcOutliers > 0) reasons.push(`${dwTtcOutliers} outlier(s) > ${OUTLIER}€`)
if (Math.abs(dwSumDiff) >= CUTOVER_DELTA_30J) reasons.push(`|Δ cumulé| ≥ ${CUTOVER_DELTA_30J}€ (${dwSumDiff.toFixed(2)}€)`)

console.log()
console.log('━'.repeat(80))
if (reasons.length === 0) {
  console.log('  ✅ PRÊT POUR CUTOVER')
  console.log(`     Fenêtre dual-write ${dwDates.length}j, 100% couverture, 0 outlier, Δ cumulé ${dwSumDiff.toFixed(2)}€`)
} else if (dwDates.length < 30) {
  console.log('  ℹ️  FENÊTRE TROP COURTE (<30j)')
  for (const r of reasons) console.log(`     - ${r}`)
} else {
  console.log('  ⚠️  NON PRÊT POUR CUTOVER')
  for (const r of reasons) console.log(`     - ${r}`)
}
console.log('━'.repeat(80))

process.exit(0)
