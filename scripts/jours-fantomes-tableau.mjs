// Tableau VERBATIM des jours fantômes Popina sur 2025-01-16 → 2026-05-02.
// Définition : tous les jours où sum(report.totalSales) API Popina = 0.
// LECTURE PURE — aucune écriture nulle part.
//
// Colonnes : date | API_total | KS2_caisse_total | HCA_ca_brut | KS2_uber | HCA_uber
//   - API_total        : sum totalSales Popina (€)
//   - KS2_caisse_total : Espèce + CB + TPA + TR depuis KS2.xlsx (cols 4+5+6+7)
//   - HCA_ca_brut      : historique_ca.ca_brut Krousty
//   - KS2_uber         : KS2 col 8
//   - HCA_uber         : historique_ca.uber Krousty

import XLSX from 'xlsx'
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
const { getAllReports } = await import('../lib/popina.js')

const KS2_FILE = '/Users/mRharasse/Downloads/KS2 (1) (5).xlsx'
const KROUSTY_SLUG = 'krousty-sabaidi-montpellier-castelnau'
const PERIOD_START = '2025-01-16'
const PERIOD_END   = '2026-05-02'

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

// ─── 1. Krousty parametre_id ────────────────────────────────────────
const { data: paramRows } = await supabase
  .from('parametres').select('id').eq('slug', KROUSTY_SLUG)
const KROUSTY_ID = paramRows[0].id

// ─── 2. KS2 indexé par date ─────────────────────────────────────────
const wb = XLSX.readFile(KS2_FILE)
function lireOnglet(name) {
  const ws = wb.Sheets[name]
  if (!ws) return {}
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: true })
  const out = {}
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const s = parseFloat(r[0])
    if (!Number.isFinite(s) || s < 40000) continue
    out[serialToISO(s)] = {
      caisse: num(r[4]) + num(r[5]) + num(r[6]) + num(r[7]),
      uber: num(r[8]),
    }
  }
  return out
}
const ks2 = { ...lireOnglet('Data_CA_N-1'), ...lireOnglet('Data_CA') }

// ─── 3. historique_ca indexé par date ───────────────────────────────
const { data: hcaRows } = await supabase
  .from('historique_ca')
  .select('date, ca_brut, uber')
  .eq('parametre_id', KROUSTY_ID)
  .gte('date', PERIOD_START).lte('date', PERIOD_END)
const hca = Object.fromEntries((hcaRows || []).map(r => [r.date, r]))

// ─── 4. API Popina mois par mois ────────────────────────────────────
console.log()
console.log('Fetch API Popina mois par mois sur', PERIOD_START, '→', PERIOD_END)
const apiByDate = {}  // date → sum totalSales en € (ou null si absent)
for (const { since, until } of listMonths(PERIOD_START, PERIOD_END)) {
  process.stdout.write(`  ${since} → ${until} ... `)
  const t0 = Date.now()
  const reports = await getAllReports(since, until)
  for (const rep of reports) {
    const d = (rep.startedAt || '').slice(0, 10)
    if (!d) continue
    apiByDate[d] = (apiByDate[d] || 0) + toEuros(rep.totalSales || 0)
  }
  console.log(`${reports.length} reports (${Date.now() - t0}ms)`)
}

// ─── 5. Énumération de la période + détection fantômes ──────────────
const fantomes = []
const cur = new Date(PERIOD_START + 'T00:00:00Z')
const end = new Date(PERIOD_END + 'T00:00:00Z')
while (cur <= end) {
  const d = cur.toISOString().slice(0, 10)
  const apiTotal = apiByDate[d] || 0
  if (apiTotal === 0) {
    const k = ks2[d]
    const h = hca[d]
    fantomes.push({
      date: d,
      api_total: apiTotal,
      ks2_caisse_total: k ? r2(k.caisse) : null,
      hca_ca_brut: h ? num(h.ca_brut) : null,
      ks2_uber: k ? r2(k.uber) : null,
      hca_uber: h ? num(h.uber) : null,
    })
  }
  cur.setUTCDate(cur.getUTCDate() + 1)
}

// ─── 6. Affichage tableau ───────────────────────────────────────────
console.log()
console.log('═'.repeat(96))
console.log(`  JOURS FANTÔMES POPINA — API_total = 0 sur ${PERIOD_START} → ${PERIOD_END}`)
console.log(`  Total : ${fantomes.length} jours`)
console.log('═'.repeat(96))
console.log()
console.log('| date       | API_total | KS2_caisse_total | HCA_ca_brut | KS2_uber  | HCA_uber  |')
console.log('|------------|-----------|------------------|-------------|-----------|-----------|')
for (const f of fantomes) {
  const fmt = v => v == null ? '   (absent)' : v.toFixed(2).padStart(9)
  console.log(
    `| ${f.date} | ${f.api_total.toFixed(2).padStart(9)} | ${(f.ks2_caisse_total ?? '   (absent)').toString().padStart(16)} | ${fmt(f.hca_ca_brut)} | ${fmt(f.ks2_uber)} | ${fmt(f.hca_uber)} |`
  )
}
console.log()

// ─── 7. Sommaires ──────────────────────────────────────────────────
const sums = fantomes.reduce((s, f) => ({
  ks2_caisse: s.ks2_caisse + (f.ks2_caisse_total || 0),
  hca_brut:   s.hca_brut   + (f.hca_ca_brut || 0),
  ks2_uber:   s.ks2_uber   + (f.ks2_uber || 0),
  hca_uber:   s.hca_uber   + (f.hca_uber || 0),
}), { ks2_caisse: 0, hca_brut: 0, ks2_uber: 0, hca_uber: 0 })

const ks2_present = fantomes.filter(f => f.ks2_caisse_total != null).length
const ks2_caisse_pos = fantomes.filter(f => (f.ks2_caisse_total || 0) > 0).length
const hca_present = fantomes.filter(f => f.hca_ca_brut != null).length
const hca_brut_pos = fantomes.filter(f => (f.hca_ca_brut || 0) > 0).length

console.log('─'.repeat(96))
console.log('Couverture sur les jours fantômes :')
console.log(`  KS2 ligne présente            : ${ks2_present}/${fantomes.length}`)
console.log(`  KS2 caisse > 0                : ${ks2_caisse_pos}/${fantomes.length}`)
console.log(`  historique_ca présent         : ${hca_present}/${fantomes.length}`)
console.log(`  historique_ca.ca_brut > 0     : ${hca_brut_pos}/${fantomes.length}`)
console.log()
console.log('Sommes sur les jours fantômes :')
console.log(`  Sum KS2_caisse   : ${sums.ks2_caisse.toFixed(2)} €`)
console.log(`  Sum HCA_ca_brut  : ${sums.hca_brut.toFixed(2)} €`)
console.log(`  Sum KS2_uber     : ${sums.ks2_uber.toFixed(2)} €`)
console.log(`  Sum HCA_uber     : ${sums.hca_uber.toFixed(2)} €`)
console.log()

process.exit(0)
