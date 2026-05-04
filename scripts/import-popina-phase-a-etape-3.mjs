// Import API Popina + KS2 fantômes → ventes_par_source.popina + paiements_caisse — Phase A étape 3.
//
// Cf. STRAT_ARCHITECTURE.md §Décision #5, PLANNING_V1.md §Sprint Migration data layer Étape 3.
// Période : 2025-01-16 → 2026-05-02 inclus (472 jours).
//
// SOURCES PAR CIBLE :
//   ventes_par_source.popina    : API Popina (456 jours) + KS2 (16 jours fantômes API)
//   paiements_caisse            : API Popina (456 jours) + KS2 (16 jours fantômes API, ventilation espèces/CB+TPA/TR depuis KS2)
//
// Uber Eats (470 jours KS2 + 2 jours entrees) : hors scope étape 3, traité en étape 3-bis dédiée.
//
// Mapping figé (cf. session de cadrage et étape 2) :
//   - paiements_caisse.cb = api.cb + api.tpa  (fusion D3, scorie TPA Krousty)
//   - paiements_caisse.especes/tr           = api.especes/tr (paiements classifiés)
//   - ventes_par_source.montant_ttc         = report.totalSales (vérité Popina, inclut Edenred etc.)
//   - ventes_par_source.montant_ht          = totalSales - sum(reportTaxes.taxAmount)
//
// Idempotence : ON CONFLICT (parametre_id, date, source_id) DO UPDATE.

import XLSX from 'xlsx'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as pathResolve } from 'node:path'
import { createInterface } from 'node:readline'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = pathResolve(__dirname, '..')

const envPath = pathResolve(projectRoot, '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

// ─── Constantes ─────────────────────────────────────────────────────
const KS2_FILE = '/Users/mRharasse/Downloads/KS2 (1) (5).xlsx'
const KROUSTY_SLUG = 'krousty-sabaidi-montpellier-castelnau'
const PERIOD_START = '2025-01-16'
const PERIOD_END   = '2026-05-02'
const BATCH_SIZE   = 200
const DRY_RUN = process.argv.includes('--dry-run')

// ─── Vérif env ──────────────────────────────────────────────────────
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('❌ Vars Supabase manquantes (NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY)')
  process.exit(1)
}

const { supabase } = await import('../lib/supabase.js')
const { getAllReports, getAllOrders } = await import('../lib/popina.js')
const { buildClassifier } = await import('../lib/payments-classifier.js')

// ─── Helpers ────────────────────────────────────────────────────────
const toEuros = c => Math.round(c) / 100
const r2 = n => Math.round(n * 100) / 100

function serialToISO(n) {
  const epoch = new Date(Date.UTC(1899, 11, 30))
  return new Date(epoch.getTime() + n * 86400000).toISOString().slice(0, 10)
}

function num(v) { return Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0 }

function listMonths(since, until) {
  const out = []
  const cur = new Date(since.slice(0, 7) + '-01T00:00:00Z')
  const end = new Date(until.slice(0, 7) + '-01T00:00:00Z')
  while (cur <= end) {
    const y = cur.getUTCFullYear()
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0')
    const lastDay = new Date(Date.UTC(y, cur.getUTCMonth() + 1, 0)).getUTCDate()
    const monthSince = `${y}-${m}-01`
    const monthUntil = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
    out.push({
      since: monthSince < since ? since : monthSince,
      until: monthUntil > until ? until : monthUntil,
    })
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  return out
}

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans) }))
}

// ─── 1. Récupération parametre_id Krousty + source_id popina ────────
console.log()
console.log('━'.repeat(70))
console.log(`  Import Popina + KS2 fantômes → ventes_par_source.popina + paiements_caisse — Phase A étape 3`)
console.log(`  Période : ${PERIOD_START} → ${PERIOD_END}`)
console.log(`  Mode : ${DRY_RUN ? '🟡 DRY-RUN (aucune écriture)' : '🔴 ÉCRITURE RÉELLE'}`)
console.log('━'.repeat(70))

const { data: paramRows, error: errParam } = await supabase
  .from('parametres').select('id').eq('slug', KROUSTY_SLUG)
if (errParam || !paramRows || paramRows.length !== 1) {
  console.error(`❌ Krousty introuvable via slug '${KROUSTY_SLUG}'`)
  process.exit(1)
}
const KROUSTY_ID = paramRows[0].id
console.log(`✓ parametre_id Krousty : ${KROUSTY_ID}`)

const { data: sourceRows, error: errSrc } = await supabase
  .from('sources').select('id, slug').eq('parametre_id', KROUSTY_ID).eq('slug', 'popina')
if (errSrc || !sourceRows || sourceRows.length !== 1) {
  console.error(`❌ Source 'popina' Krousty introuvable`)
  process.exit(1)
}
const SOURCE_POPINA_ID = sourceRows[0].id
console.log(`✓ source_id popina    : ${SOURCE_POPINA_ID}`)

const classifier = await buildClassifier(KROUSTY_ID)
console.log(`✓ classifier paiements : ${classifier.rules.length} règles chargées (cf. parametres.config_paiements_classifier)`)

// ─── 2. Lecture API Popina mois par mois ────────────────────────────
console.log()
console.log('━'.repeat(70))
console.log('  FETCH API POPINA (mois par mois)')
console.log('━'.repeat(70))

const apiParJour = {}  // ISO → { ttc, ht, nb_orders, paiements: { especes, cb, tpa, tr } }
const months = listMonths(PERIOD_START, PERIOD_END)
for (const month of months) {
  process.stdout.write(`  ${month.since} → ${month.until} ... `)
  const t0 = Date.now()
  const [reports, orders] = await Promise.all([
    getAllReports(month.since, month.until),
    getAllOrders(month.since, month.until),
  ])
  for (const r of reports || []) {
    const date = (r.startedAt || r.finalizedAt || '').slice(0, 10)
    if (!date || date < PERIOD_START || date > PERIOD_END) continue
    if (!apiParJour[date]) {
      apiParJour[date] = { ttc: 0, ht: 0, nb_orders: 0, paiements: { especes: 0, cb: 0, tpa: 0, tr: 0 } }
    }
    const ttc = toEuros(r.totalSales || 0)
    const tva = (r.reportTaxes || []).reduce((s, t) => s + toEuros(t.taxAmount || 0), 0)
    apiParJour[date].ttc += ttc
    apiParJour[date].ht += (ttc - tva)
    for (const p of (r.reportPayments || [])) {
      const m = toEuros(p.paymentAmount || 0)
      const cat = classifier.classify(p.paymentName)
      if (cat === 'especes' || cat === 'cb' || cat === 'tpa' || cat === 'tr') {
        apiParJour[date].paiements[cat] += m
      } else if (cat === 'ignored') {
        // skip — ex: avoirs Krousty (-19 € total négligeable)
      } else {
        console.warn(`[import-popina-3] paymentName non classifié date=${date} : "${p.paymentName}" (${m.toFixed(2)} €)`)
      }
    }
  }
  for (const o of orders || []) {
    if (o.isCanceled || (o.total || 0) <= 0) continue
    const date = (o.openedAt || o.createdAt || '').slice(0, 10)
    if (!date || date < PERIOD_START || date > PERIOD_END) continue
    if (!apiParJour[date]) {
      apiParJour[date] = { ttc: 0, ht: 0, nb_orders: 0, paiements: { especes: 0, cb: 0, tpa: 0, tr: 0 } }
    }
    apiParJour[date].nb_orders++
  }
  console.log(`${reports?.length || 0} reports, ${orders?.length || 0} orders (${Date.now() - t0}ms)`)
}
console.log(`  → ${Object.keys(apiParJour).length} jours avec data API`)

// ─── 3. Lecture KS2 (caisse pour patch fantômes) ────────────────────
console.log()
console.log('━'.repeat(70))
console.log('  FETCH KS2 (Excel local, pour patch des jours fantômes API)')
console.log('━'.repeat(70))

if (!existsSync(KS2_FILE)) {
  console.error(`❌ Fichier KS2 introuvable : ${KS2_FILE}`)
  process.exit(1)
}
const wb = XLSX.readFile(KS2_FILE)
const ks2 = {}  // ISO → { especes, cb, tpa, tr, ht_total, uber_ht }
for (const sheetName of ['Data_CA_N-1', 'Data_CA']) {
  const ws = wb.Sheets[sheetName]
  if (!ws) continue
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: true })
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const s = parseFloat(r[0])
    if (!Number.isFinite(s) || s < 40000) continue
    const iso = serialToISO(s)
    if (iso < PERIOD_START || iso > PERIOD_END) continue
    ks2[iso] = {
      especes: num(r[4]), cb: num(r[5]), tpa: num(r[6]), tr: num(r[7]),
      ht_total: num(r[12]), uber_ht: num(r[15]),
    }
  }
}
console.log(`  → ${Object.keys(ks2).length} jours avec data KS2`)

// ─── 4. Construction des rows à upsert ──────────────────────────────
console.log()
console.log('━'.repeat(70))
console.log('  CONSTRUCTION DES ROWS')
console.log('━'.repeat(70))

const vpsRows = []
const pcRows = []

// Itère sur tous les jours de la période
const datesPeriode = []
const cur = new Date(PERIOD_START + 'T00:00:00Z')
const endD = new Date(PERIOD_END + 'T00:00:00Z')
while (cur <= endD) {
  datesPeriode.push(cur.toISOString().slice(0, 10))
  cur.setUTCDate(cur.getUTCDate() + 1)
}

let nbVpsPopinaApi = 0, nbVpsPopinaKs2 = 0
let sumHtPopinaApi = 0, sumHtPopinaKs2 = 0
let nbPcApi = 0, nbPcKs2 = 0
let nbJoursVides = 0

for (const date of datesPeriode) {
  const a = apiParJour[date]
  const k = ks2[date]

  // CAISSE — popina + paiements_caisse
  if (a && a.ttc > 0) {
    // Source API Popina
    vpsRows.push({
      parametre_id: KROUSTY_ID, date,
      source_id: SOURCE_POPINA_ID,
      montant_ttc: r2(a.ttc),
      montant_ht: r2(a.ht),
      nb_commandes: a.nb_orders || null,
      commission_ttc: null, commission_ht: null,
    })
    nbVpsPopinaApi++
    sumHtPopinaApi += a.ht
    pcRows.push({
      parametre_id: KROUSTY_ID, date,
      especes: r2(a.paiements.especes),
      cb: r2(a.paiements.cb + a.paiements.tpa),  // fusion D3
      tr: r2(a.paiements.tr),
    })
    nbPcApi++
  } else if (k) {
    // Fallback KS2 sur jour fantôme API
    const caisseKs2 = k.especes + k.cb + k.tpa + k.tr
    if (caisseKs2 > 0) {
      const caisseHtKs2 = k.ht_total - k.uber_ht  // HT total − HT Uber = HT caisse
      vpsRows.push({
        parametre_id: KROUSTY_ID, date,
        source_id: SOURCE_POPINA_ID,
        montant_ttc: r2(caisseKs2),
        montant_ht: r2(caisseHtKs2),
        nb_commandes: null,  // KS2 ne tracke pas nb VSP avant 01/06/2025 (F4)
        commission_ttc: null, commission_ht: null,
      })
      nbVpsPopinaKs2++
      sumHtPopinaKs2 += caisseHtKs2
      pcRows.push({
        parametre_id: KROUSTY_ID, date,
        especes: r2(k.especes),
        cb: r2(k.cb + k.tpa),  // fusion D3
        tr: r2(k.tr),
      })
      nbPcKs2++
    }
  }

  // Jour vraiment vide ? (pas d'API ET pas de KS2 caisse exploitable)
  if (!(a && a.ttc > 0) && !(k && (k.especes + k.cb + k.tpa + k.tr) > 0)) nbJoursVides++
}

// ─── 5. Résumé pré-écriture ─────────────────────────────────────────
const sumPopina = r2(vpsRows.reduce((s, v) => s + v.montant_ttc, 0))
const sumEsp = r2(pcRows.reduce((s, v) => s + v.especes, 0))
const sumCB = r2(pcRows.reduce((s, v) => s + v.cb, 0))
const sumTR = r2(pcRows.reduce((s, v) => s + v.tr, 0))
const datesVPS = vpsRows.map(v => v.date).sort()
const dateMin = datesVPS[0] || '(aucune)'
const dateMax = datesVPS[datesVPS.length - 1] || '(aucune)'

console.log()
console.log('━'.repeat(70))
console.log('  RÉSUMÉ PRÉ-ÉCRITURE')
console.log('━'.repeat(70))
console.log(`  Jours de la période parcourus : ${datesPeriode.length}`)
console.log(`  Jours sans aucune source      : ${nbJoursVides}`)
console.log()
console.log(`  ventes_par_source.popina à upsert : ${vpsRows.length}`)
console.log(`    via API                         : ${nbVpsPopinaApi}`)
console.log(`    via KS2 fantômes                : ${nbVpsPopinaKs2}`)
console.log(`    sum montant_ttc popina          : ${sumPopina.toFixed(2)} €`)
console.log(`    sum montant_ht  popina (total)  : ${r2(sumHtPopinaApi + sumHtPopinaKs2).toFixed(2)} €`)
console.log(`      dont via API                  : ${r2(sumHtPopinaApi).toFixed(2)} €`)
console.log(`      dont via KS2 fantômes         : ${r2(sumHtPopinaKs2).toFixed(2)} €`)
console.log()
console.log(`  paiements_caisse à upsert     : ${pcRows.length}`)
console.log(`    via API                     : ${nbPcApi}`)
console.log(`    via KS2 fantômes            : ${nbPcKs2}`)
console.log(`    sum especes                 : ${sumEsp.toFixed(2)} €`)
console.log(`    sum cb (avec TPA fusionné)  : ${sumCB.toFixed(2)} €`)
console.log(`    sum tr                      : ${sumTR.toFixed(2)} €`)
console.log(`    sum especes+cb+tr           : ${(sumEsp + sumCB + sumTR).toFixed(2)} €`)
console.log(`    Δ vs sum popina (≈ 0 si classifier exhaustif, sauf avoirs ignorés ~-19€) : ${(sumPopina - (sumEsp + sumCB + sumTR)).toFixed(2)} €`)
console.log()
console.log(`  Plage temporelle              : ${dateMin} → ${dateMax}`)
console.log('━'.repeat(70))

// ─── 5b. Garde-fou anti-drift API (cf. cadrage étape 3-ter Q4) ──────
console.log()
console.log('━'.repeat(70))
console.log('  GARDE-FOU ANTI-DRIFT API')
console.log('━'.repeat(70))

const [vpsExistRes, pcExistRes] = await Promise.all([
  supabase.from('ventes_par_source').select('montant_ttc')
    .eq('parametre_id', KROUSTY_ID).eq('source_id', SOURCE_POPINA_ID)
    .gte('date', PERIOD_START).lte('date', PERIOD_END),
  supabase.from('paiements_caisse').select('especes, cb, tr')
    .eq('parametre_id', KROUSTY_ID)
    .gte('date', PERIOD_START).lte('date', PERIOD_END),
])

const sumPopinaActuel = r2((vpsExistRes.data || []).reduce((s, x) => s + Number(x.montant_ttc || 0), 0))
const sumCaisseActuel = r2((pcExistRes.data || []).reduce((s, x) => s + Number(x.especes || 0) + Number(x.cb || 0) + Number(x.tr || 0), 0))
const sumCaisseNouveau = r2(sumEsp + sumCB + sumTR)
const deltaTtc = r2(sumPopina - sumPopinaActuel)
const deltaCaisse = r2(sumCaisseNouveau - sumCaisseActuel)
const driftAlert = Math.abs(deltaTtc) >= 100

console.log(`  sum popina TTC actuel    : ${sumPopinaActuel.toFixed(2)} €`)
console.log(`  sum popina TTC nouveau   : ${sumPopina.toFixed(2)} €`)
console.log(`  Δ TTC                    : ${deltaTtc.toFixed(2)} € → ${driftAlert ? '⚠️ DRIFT ≥ 100€ DÉTECTÉ' : '✅ < 100€'}`)
console.log(`  sum caisse actuel        : ${sumCaisseActuel.toFixed(2)} €`)
console.log(`  sum caisse nouveau       : ${sumCaisseNouveau.toFixed(2)} €`)
console.log(`  Δ caisse                 : ${deltaCaisse.toFixed(2)} € (attendu ≈ +421 855 € à l'étape 3-ter, après refacto classifier)`)
console.log('━'.repeat(70))

if (driftAlert) {
  console.error()
  console.error('🛑 STOP — drift API détecté (|Δ TTC popina| ≥ 100 €).')
  console.error('   Hypothèse : Popina a retraité des reports historiques entre étape 3 (initiale) et maintenant.')
  console.error('   Investigue avant relance. Aucune écriture lancée.')
  process.exit(1)
}

// ─── 6. Dry-run : STOP ici ──────────────────────────────────────────
if (DRY_RUN) {
  console.log()
  console.log('🟡 DRY-RUN terminé. Aucune écriture en BDD.')
  console.log('   Pour exécuter réellement : retirer --dry-run.')
  process.exit(0)
}

// ─── 7. Confirmation interactive ────────────────────────────────────
console.log()
console.log('🔴 ATTENTION : écriture réelle en BDD imminente.')
console.log(`   Tables affectées : ventes_par_source (+${vpsRows.length} rows), paiements_caisse (+${pcRows.length} rows)`)
console.log(`   Idempotence : ON CONFLICT DO UPDATE — relance possible sans corruption.`)
console.log()
const ans = await prompt('Tape "Oui" exactement pour confirmer (sinon abort) : ')
if (ans !== 'Oui') {
  console.log(`❌ Réponse "${ans}" ≠ "Oui" — abort. Aucune écriture.`)
  process.exit(0)
}

// ─── 8. Upsert ventes_par_source par batchs ─────────────────────────
console.log()
console.log('━'.repeat(70))
console.log('  ÉCRITURE EN COURS')
console.log('━'.repeat(70))

let vpsInserted = 0
const vpsErrors = []
for (let i = 0; i < vpsRows.length; i += BATCH_SIZE) {
  const batch = vpsRows.slice(i, i + BATCH_SIZE)
  const { error } = await supabase
    .from('ventes_par_source')
    .upsert(batch, { onConflict: 'parametre_id,date,source_id' })
  if (error) {
    vpsErrors.push({ batch_start: i, message: error.message })
    console.error(`  ✗ VPS batch ${i}-${i + batch.length - 1} : ${error.message}`)
  } else {
    vpsInserted += batch.length
    process.stdout.write(`  ✓ VPS ${vpsInserted}/${vpsRows.length}\r`)
  }
}
console.log()
console.log(`  ventes_par_source upsertés    : ${vpsInserted}/${vpsRows.length}`)
if (vpsErrors.length) console.log(`  ⚠ ${vpsErrors.length} batch(s) en erreur`)

// ─── 9. Upsert paiements_caisse par batchs ─────────────────────────
let pcInserted = 0
const pcErrors = []
for (let i = 0; i < pcRows.length; i += BATCH_SIZE) {
  const batch = pcRows.slice(i, i + BATCH_SIZE)
  const { error } = await supabase
    .from('paiements_caisse')
    .upsert(batch, { onConflict: 'parametre_id,date' })
  if (error) {
    pcErrors.push({ batch_start: i, message: error.message })
    console.error(`  ✗ PC batch ${i}-${i + batch.length - 1} : ${error.message}`)
  } else {
    pcInserted += batch.length
    process.stdout.write(`  ✓ PC  ${pcInserted}/${pcRows.length}\r`)
  }
}
console.log()
console.log(`  paiements_caisse upsertés     : ${pcInserted}/${pcRows.length}`)
if (pcErrors.length) console.log(`  ⚠ ${pcErrors.length} batch(s) en erreur`)

// ─── 10. Résumé final ───────────────────────────────────────────────
console.log()
console.log('━'.repeat(70))
console.log('  RÉSUMÉ POST-ÉCRITURE')
console.log('━'.repeat(70))
console.log(`  ventes_par_source : ${vpsInserted}/${vpsRows.length} (${vpsErrors.length} erreurs)`)
console.log(`  paiements_caisse  : ${pcInserted}/${pcRows.length} (${pcErrors.length} erreurs)`)

if (vpsErrors.length || pcErrors.length) {
  console.log()
  console.log('❌ Des erreurs ont eu lieu. Relancer le script (idempotent ON CONFLICT) après diagnostic.')
  console.log(JSON.stringify({ vpsErrors, pcErrors }, null, 2))
  process.exit(1)
}

console.log()
console.log('✅ Import terminé sans erreur.')
process.exit(0)
