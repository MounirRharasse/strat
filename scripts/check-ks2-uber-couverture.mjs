// Vérif KS2 Uber couverture pour la période étape 3 (16/01/2025 → 02/05/2026)
// + cohérence avec entrees source=uber_eats.
// LECTURE PURE.
import XLSX from 'xlsx'
import { readFileSync, existsSync } from 'node:fs'
const envPath = '/Users/mRharasse/strat/.env.local'
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
const { supabase } = await import('/Users/mRharasse/strat/lib/supabase.js')
const KROUSTY = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'

const PERIOD_START = '2025-01-16'
const PERIOD_END   = '2026-05-02'

// ─── KS2 ────────────────────────────────────────────────────────────
const KS2 = '/Users/mRharasse/Downloads/KS2 (1) (5).xlsx'
const wb = XLSX.readFile(KS2)
function serialToISO(n) {
  const epoch = new Date(Date.UTC(1899, 11, 30))
  return new Date(epoch.getTime() + n * 86400000).toISOString().slice(0, 10)
}
function num(v) { return Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0 }

function lireOnglet(name) {
  const ws = wb.Sheets[name]
  if (!ws) return {}
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: true })
  const out = {}
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const s = parseFloat(r[0])
    if (!Number.isFinite(s) || s < 40000) continue
    out[serialToISO(s)] = { uber: num(r[8]), caisse: num(r[4]) + num(r[5]) + num(r[6]) + num(r[7]) }
  }
  return out
}

const ks2_2025 = lireOnglet('Data_CA_N-1')
const ks2_2026 = lireOnglet('Data_CA')
const ks2 = { ...ks2_2025, ...ks2_2026 }

// ─── 1. Couverture KS2 sur la période ────────────────────────────────
const datesPeriode = []
const cur = new Date(PERIOD_START + 'T00:00:00Z')
const end = new Date(PERIOD_END + 'T00:00:00Z')
while (cur <= end) {
  datesPeriode.push(cur.toISOString().slice(0, 10))
  cur.setUTCDate(cur.getUTCDate() + 1)
}

let ks2_complet = 0, ks2_uber_zero = 0, ks2_absent = 0
const datesAbsentes = []
const datesUberZero = []
let sumUberKs2 = 0

for (const d of datesPeriode) {
  const k = ks2[d]
  if (!k) { ks2_absent++; if (datesAbsentes.length < 30) datesAbsentes.push(d); continue }
  if (k.uber === 0) { ks2_uber_zero++; if (datesUberZero.length < 30) datesUberZero.push(d); continue }
  ks2_complet++
  sumUberKs2 += k.uber
}

console.log()
console.log('═'.repeat(80))
console.log(`  COUVERTURE KS2 Uber sur ${PERIOD_START} → ${PERIOD_END} (${datesPeriode.length} jours)`)
console.log('═'.repeat(80))
console.log()
console.log(`  KS2 ligne présente avec uber > 0 : ${ks2_complet}`)
console.log(`  KS2 ligne présente avec uber = 0 : ${ks2_uber_zero}`)
console.log(`  KS2 ligne absente                 : ${ks2_absent}`)
console.log()
console.log(`  Sum KS2.uber sur les jours > 0 : ${sumUberKs2.toFixed(2)} €`)
console.log()
if (datesAbsentes.length > 0) {
  console.log(`  Dates absentes de KS2 (${ks2_absent} total, ${Math.min(30, datesAbsentes.length)} affichées) :`)
  for (const d of datesAbsentes) console.log(`    ${d}`)
}
if (datesUberZero.length > 0) {
  console.log(`  Dates avec KS2.uber = 0 (jours sans Uber, ${ks2_uber_zero} total, ${Math.min(30, datesUberZero.length)} affichées) :`)
  for (const d of datesUberZero) console.log(`    ${d}`)
}

// ─── 2. Cohérence overlap entrees ↔ KS2 (15/04/2026 → 01/05/2026) ────
const { data: entreesUber } = await supabase
  .from('entrees')
  .select('date, montant_ttc, nb_commandes')
  .eq('parametre_id', KROUSTY)
  .eq('source', 'uber_eats')
  .order('date', { ascending: true })

console.log()
console.log('═'.repeat(80))
console.log(`  COHÉRENCE entrees.uber_eats ↔ KS2.uber sur les 17 jours overlap`)
console.log('═'.repeat(80))
console.log()
console.log('| date       | entrees.ttc | KS2.uber  | Δ          | match |')
console.log('|------------|-------------|-----------|------------|-------|')
let ok = 0, ecart = 0
for (const e of entreesUber || []) {
  const k = ks2[e.date]
  const ks2u = k ? k.uber : 0
  const delta = (e.montant_ttc || 0) - ks2u
  const isMatch = Math.abs(delta) < 1
  if (isMatch) ok++; else ecart++
  console.log(`| ${e.date} | ${(e.montant_ttc || 0).toFixed(2).padStart(11)} | ${ks2u.toFixed(2).padStart(9)} | ${delta.toFixed(2).padStart(10)} | ${isMatch ? '✓' : '✗'}     |`)
}
console.log()
console.log(`  Match à l'euro près : ${ok}/${entreesUber?.length || 0}`)
console.log(`  Écart ≥ 1 €         : ${ecart}/${entreesUber?.length || 0}`)

process.exit(0)
