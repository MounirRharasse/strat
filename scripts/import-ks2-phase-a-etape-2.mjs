// Import KS2 → ventes_par_source + paiements_caisse — Phase A étape 2.
//
// Cf. STRAT_ARCHITECTURE.md §Décision #5, PLANNING_V1.md §Sprint Migration
// data layer Étape 2.
//
// Usage :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/import-ks2-phase-a-etape-2.mjs --dry-run
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/import-ks2-phase-a-etape-2.mjs
//
// --dry-run : parse, calcule, affiche résumé. AUCUNE écriture en BDD.
// Sans flag : prompt confirmation interactive ("Oui" exact requis), puis upsert.
//
// Source : /Users/mRharasse/Downloads/KS2 (1) (5).xlsx
// Période : 2024-04-18 → 2025-01-15 inclus (272 jours).
// Mapping : cf. brief Phase A étape 2.

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
const PERIOD_START = '2024-04-18'
const PERIOD_END   = '2025-01-15'
const BATCH_SIZE   = 200
const DRY_RUN = process.argv.includes('--dry-run')

// ─── Vérif env ──────────────────────────────────────────────────────
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('❌ Vars Supabase manquantes (NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY)')
  process.exit(1)
}

const { supabase } = await import('../lib/supabase.js')

// ─── Helpers ────────────────────────────────────────────────────────
function serialToISO(n) {
  if (!Number.isFinite(n) || n < 1000) return null
  const epoch = new Date(Date.UTC(1899, 11, 30))
  return new Date(epoch.getTime() + n * 86400000).toISOString().slice(0, 10)
}

function toNumber(cell) {
  if (cell === '' || cell === null || cell === undefined) return 0
  if (typeof cell === 'number') return cell
  // Normalise les whitespaces multiples internes en un seul + trim global
  // pour gérer les cellules Excel type '-   €' (3 espaces internes).
  const s = String(cell).replace(/\s+/g, ' ').trim()
  if (s === '' || s === '-' || /^-+\s*€?$/.test(s)) return 0
  const norm = s.replace(/\s/g, '').replace(',', '.').replace(/€/g, '')
  const f = parseFloat(norm)
  return Number.isFinite(f) ? f : 0
}

function r2(n) { return Math.round(n * 100) / 100 }

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans) }))
}

// ─── 1. Récupération parametre_id Krousty ───────────────────────────
console.log()
console.log('━'.repeat(70))
console.log(`  Import KS2 → ventes_par_source + paiements_caisse — Phase A étape 2`)
console.log(`  Mode : ${DRY_RUN ? '🟡 DRY-RUN (aucune écriture)' : '🔴 ÉCRITURE RÉELLE'}`)
console.log('━'.repeat(70))

const { data: paramRows, error: errParam } = await supabase
  .from('parametres').select('id').eq('slug', KROUSTY_SLUG)
if (errParam || !paramRows || paramRows.length !== 1) {
  console.error(`❌ Krousty introuvable via slug '${KROUSTY_SLUG}' (${paramRows?.length || 0} rows)`)
  process.exit(1)
}
const KROUSTY_ID = paramRows[0].id
console.log(`✓ parametre_id Krousty : ${KROUSTY_ID}`)

// ─── 2. Récupération source_ids ─────────────────────────────────────
const { data: sourceRows, error: errSrc } = await supabase
  .from('sources').select('id, slug').eq('parametre_id', KROUSTY_ID).in('slug', ['popina', 'uber_eats'])
if (errSrc || !sourceRows || sourceRows.length !== 2) {
  console.error(`❌ Sources Krousty incomplètes (attendu popina + uber_eats, reçu ${sourceRows?.length || 0})`)
  console.error('Détail :', sourceRows)
  process.exit(1)
}
const SOURCE_ID = Object.fromEntries(sourceRows.map(s => [s.slug, s.id]))
console.log(`✓ source_id popina    : ${SOURCE_ID.popina}`)
console.log(`✓ source_id uber_eats : ${SOURCE_ID.uber_eats}`)

// ─── 3. Lecture KS2 ─────────────────────────────────────────────────
if (!existsSync(KS2_FILE)) {
  console.error(`❌ Fichier KS2 introuvable : ${KS2_FILE}`)
  process.exit(1)
}
const wb = XLSX.readFile(KS2_FILE)

const vpsRows = []  // ventes_par_source
const pcRows  = []  // paiements_caisse
let totalRowsLues = 0
let totalRowsHorsPeriode = 0

for (const sheetName of ['Data_CA_N-2', 'Data_CA_N-1']) {
  const ws = wb.Sheets[sheetName]
  if (!ws) {
    console.error(`❌ Onglet absent : ${sheetName}`)
    process.exit(1)
  }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: true })
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const v0 = r[0]
    let iso = null
    if (typeof v0 === 'number') iso = serialToISO(v0)
    else if (typeof v0 === 'string' && /^(\d{2})\/(\d{2})\/(\d{4})/.test(v0)) {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v0)
      iso = `${m[3]}-${m[2]}-${m[1]}`
    } else if (typeof v0 === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v0)) {
      iso = v0
    }
    if (!iso) continue
    totalRowsLues++
    if (iso < PERIOD_START || iso > PERIOD_END) { totalRowsHorsPeriode++; continue }

    const especes = toNumber(r[4])
    const cb_brut = toNumber(r[5])
    const tpa     = toNumber(r[6])
    const tr      = toNumber(r[7])
    const uber    = toNumber(r[8])

    const ttc_caisse = especes + cb_brut + tpa + tr

    if (ttc_caisse > 0) {
      vpsRows.push({
        parametre_id:   KROUSTY_ID,
        date:           iso,
        source_id:      SOURCE_ID.popina,
        montant_ttc:    r2(ttc_caisse),
        montant_ht:     null,
        nb_commandes:   null,
        commission_ttc: null,
        commission_ht:  null,
      })
      pcRows.push({
        parametre_id: KROUSTY_ID,
        date:         iso,
        especes:      r2(especes),
        cb:           r2(cb_brut + tpa),  // fusion D3 : tpa → cb
        tr:           r2(tr),
      })
    }
    if (uber > 0) {
      vpsRows.push({
        parametre_id:   KROUSTY_ID,
        date:           iso,
        source_id:      SOURCE_ID.uber_eats,
        montant_ttc:    r2(uber),
        montant_ht:     null,
        nb_commandes:   null,
        commission_ttc: null,
        commission_ht:  null,
      })
    }
  }
}

// ─── 4. Résumé pré-écriture ─────────────────────────────────────────
const vpsPopina = vpsRows.filter(v => v.source_id === SOURCE_ID.popina)
const vpsUber   = vpsRows.filter(v => v.source_id === SOURCE_ID.uber_eats)
const sumPopina = r2(vpsPopina.reduce((s, v) => s + v.montant_ttc, 0))
const sumUber   = r2(vpsUber.reduce((s, v) => s + v.montant_ttc, 0))
const sumEsp    = r2(pcRows.reduce((s, v) => s + v.especes, 0))
const sumCB     = r2(pcRows.reduce((s, v) => s + v.cb, 0))
const sumTR     = r2(pcRows.reduce((s, v) => s + v.tr, 0))
const datesVPS  = vpsRows.map(v => v.date).sort()
const dateMin   = datesVPS[0] || '(aucune)'
const dateMax   = datesVPS[datesVPS.length - 1] || '(aucune)'

console.log()
console.log('━'.repeat(70))
console.log('  RÉSUMÉ PRÉ-ÉCRITURE')
console.log('━'.repeat(70))
console.log(`  Lignes Excel parsées          : ${totalRowsLues}`)
console.log(`  Lignes hors période (ignorées): ${totalRowsHorsPeriode}`)
console.log()
console.log(`  ventes_par_source à upsert    : ${vpsRows.length}`)
console.log(`    dont popina                 : ${vpsPopina.length} (sum montant_ttc = ${sumPopina.toFixed(2)} €)`)
console.log(`    dont uber_eats              : ${vpsUber.length}   (sum montant_ttc = ${sumUber.toFixed(2)} €)`)
console.log()
console.log(`  paiements_caisse à upsert     : ${pcRows.length}`)
console.log(`    sum especes                 : ${sumEsp.toFixed(2)} €`)
console.log(`    sum cb (avec TPA fusionné)  : ${sumCB.toFixed(2)} €`)
console.log(`    sum tr                      : ${sumTR.toFixed(2)} €`)
console.log()
console.log(`  Plage temporelle              : ${dateMin} → ${dateMax}`)
console.log('━'.repeat(70))

// ─── 5. Dry-run : STOP ici ──────────────────────────────────────────
if (DRY_RUN) {
  console.log()
  console.log('🟡 DRY-RUN terminé. Aucune écriture en BDD.')
  console.log('   Pour exécuter réellement : retirer --dry-run.')
  process.exit(0)
}

// ─── 6. Confirmation interactive ────────────────────────────────────
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

// ─── 7. Upsert ventes_par_source par batchs ─────────────────────────
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

// ─── 8. Upsert paiements_caisse par batchs ──────────────────────────
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

// ─── 9. Résumé final ────────────────────────────────────────────────
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
