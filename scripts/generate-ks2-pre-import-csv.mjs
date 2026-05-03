// Génère un CSV de pré-validation pour l'import KS2 → ventes_par_source + paiements_caisse.
// LECTURE PURE : aucune écriture Supabase, aucune modification du fichier Excel.
//
// Usage :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/generate-ks2-pre-import-csv.mjs
//
// Sortie : /Users/mRharasse/Downloads/ks2-pre-import-validation.csv

import XLSX from 'xlsx'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
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

const KROUSTY = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'
const KS2_FILE = '/Users/mRharasse/Downloads/KS2 (1) (5).xlsx'
const PERIOD_START = '2024-04-18'
const PERIOD_END   = '2025-01-15'
const OUT_CSV      = '/Users/mRharasse/Downloads/ks2-pre-import-validation.csv'

const { supabase } = await import('../lib/supabase.js')

// ─── Helpers ────────────────────────────────────────────────────────
function serialToISO(n) {
  if (!Number.isFinite(n) || n < 1000) return null
  const epoch = new Date(Date.UTC(1899, 11, 30))
  return new Date(epoch.getTime() + n * 86400000).toISOString().slice(0, 10)
}

// Convertit une cellule Excel en nombre. Retourne :
//  { val: number, bizarre: false } → cellule vide ou '-   €' → 0 (non bizarre)
//  { val: number, bizarre: false } → number direct ou parseFloat OK
//  { val: 0, bizarre: true }       → string non monétaire interprétable
function toNumber(cell) {
  if (cell === '' || cell === null || cell === undefined) return { val: 0, bizarre: false }
  if (typeof cell === 'number') return { val: cell, bizarre: false }
  const s = String(cell).trim()
  if (s === '' || s === '-' || /^-+\s*€?$/.test(s)) return { val: 0, bizarre: false }
  // Tentative parseFloat (gère '123.45', '123', mais pas '123,45' avec virgule FR)
  const norm = s.replace(/\s/g, '').replace(',', '.').replace(/€/g, '')
  const f = parseFloat(norm)
  if (Number.isFinite(f)) return { val: f, bizarre: false }
  return { val: 0, bizarre: true }
}

function r2(n) { return Math.round(n * 100) / 100 }

// ─── 1. Lecture KS2 ─────────────────────────────────────────────────
const wb = XLSX.readFile(KS2_FILE)
function readSheetRows(name) {
  const ws = wb.Sheets[name]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: true })
}

const ks2ParJour = {}      // ISO → { especes, cb, tpa, tr, uber, bizarreries: {col: rawVal} }
const datesInattendues = []  // dates hors période rencontrées (info)
const datesProblematiques = []  // dates dans période avec souci

for (const sheetName of ['Data_CA_N-2', 'Data_CA_N-1']) {
  const rows = readSheetRows(sheetName)
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
    if (iso < PERIOD_START || iso > PERIOD_END) continue

    const cE = toNumber(r[4])
    const cF = toNumber(r[5])
    const cG = toNumber(r[6])
    const cH = toNumber(r[7])
    const cI = toNumber(r[8])
    const bizarreries = {}
    if (cE.bizarre) bizarreries.E = r[4]
    if (cF.bizarre) bizarreries.F = r[5]
    if (cG.bizarre) bizarreries.G = r[6]
    if (cH.bizarre) bizarreries.H = r[7]
    if (cI.bizarre) bizarreries.I = r[8]

    if (ks2ParJour[iso]) {
      datesProblematiques.push({ iso, raison: `doublon onglet, sheet=${sheetName}, row=${i}` })
      continue
    }
    ks2ParJour[iso] = {
      sheet: sheetName,
      row: i,
      especes: cE.val, cb: cF.val, tpa: cG.val, tr: cH.val, uber: cI.val,
      bizarreries,
    }
  }
}

// ─── 2. Lecture historique_ca legacy ─────────────────────────────────
const { data: legacyRows, error: errLegacy } = await supabase
  .from('historique_ca')
  .select('date, ca_brut, especes, cb, tpa, tr, uber')
  .eq('parametre_id', KROUSTY)
  .gte('date', PERIOD_START).lte('date', PERIOD_END)
  .order('date', { ascending: true })
if (errLegacy) {
  console.error('Erreur lecture historique_ca :', errLegacy.message)
  process.exit(1)
}
const legacyParJour = {}
for (const r of legacyRows || []) legacyParJour[r.date] = r

// ─── 3. Construction des lignes CSV ──────────────────────────────────
const lignes = []
const datesKs2Triees = Object.keys(ks2ParJour).sort()

for (const iso of datesKs2Triees) {
  const k = ks2ParJour[iso]
  const ks2_total_caisse = r2(k.especes + k.cb + k.tpa + k.tr)
  const ks2_total_uber = r2(k.uber)

  const target_vps_popina_ttc = ks2_total_caisse  // créée si > 0
  const target_vps_uber_ttc = ks2_total_uber       // ligne créée si > 0
  const target_pc_especes = r2(k.especes)
  const target_pc_cb = r2(k.cb + k.tpa)
  const target_pc_tr = r2(k.tr)

  const legacy = legacyParJour[iso] || null

  let ecart_caisse = ''
  let ecart_uber = ''
  if (legacy) {
    ecart_caisse = r2(ks2_total_caisse - (legacy.ca_brut || 0))
    ecart_uber = r2(ks2_total_uber - (legacy.uber || 0))
  }

  // ─── Calcul flags ───
  const flags = []
  const ks2Vide = (k.especes === 0 && k.cb === 0 && k.tpa === 0 && k.tr === 0 && k.uber === 0)
  if (ks2Vide) flags.push('KS2_VIDE')

  if (legacy) {
    const ecartCaisseSig = Math.abs(ecart_caisse) >= 1
    const ecartUberSig = Math.abs(ecart_uber) >= 1
    if (ecartCaisseSig) flags.push('ECART_CAISSE')
    if (ecartUberSig) flags.push('ECART_UBER')
    if (!ecartCaisseSig && !ecartUberSig) flags.push('OK_LEGACY_PRESENT')
  } else {
    flags.push('OK_LEGACY_ABSENT')
  }

  if (k.tpa > 0) flags.push('TPA_PRESENT')

  for (const colLetter of Object.keys(k.bizarreries)) {
    flags.push(`CELL_BIZARRE_${colLetter}`)
  }

  lignes.push({
    date: iso,
    ks2_especes: k.especes, ks2_cb: k.cb, ks2_tpa: k.tpa, ks2_tr: k.tr, ks2_uber: k.uber,
    ks2_total_caisse, ks2_total_uber,
    target_vps_popina_ttc, target_vps_uber_ttc,
    target_pc_especes, target_pc_cb, target_pc_tr,
    legacy_hca_ca_brut: legacy ? (legacy.ca_brut ?? '') : '',
    legacy_hca_especes: legacy ? (legacy.especes ?? '') : '',
    legacy_hca_cb:      legacy ? (legacy.cb ?? '')      : '',
    legacy_hca_tpa:     legacy ? (legacy.tpa ?? '')     : '',
    legacy_hca_tr:      legacy ? (legacy.tr ?? '')      : '',
    legacy_hca_uber:    legacy ? (legacy.uber ?? '')    : '',
    ecart_caisse_ks2_vs_hca: ecart_caisse,
    ecart_uber_ks2_vs_hca: ecart_uber,
    flag: flags.join('|'),
  })
}

// ─── 4. Écriture CSV ────────────────────────────────────────────────
const HEADER = [
  'date',
  'ks2_especes', 'ks2_cb', 'ks2_tpa', 'ks2_tr', 'ks2_uber',
  'ks2_total_caisse', 'ks2_total_uber',
  'target_vps_popina_ttc', 'target_vps_uber_ttc',
  'target_pc_especes', 'target_pc_cb', 'target_pc_tr',
  'legacy_hca_ca_brut', 'legacy_hca_especes', 'legacy_hca_cb', 'legacy_hca_tpa', 'legacy_hca_tr', 'legacy_hca_uber',
  'ecart_caisse_ks2_vs_hca', 'ecart_uber_ks2_vs_hca',
  'flag',
]
const csvRows = [HEADER.join(',')]
for (const l of lignes) {
  csvRows.push(HEADER.map(h => {
    const v = l[h]
    if (v === '' || v === null || v === undefined) return ''
    if (typeof v === 'number') return String(v)
    return String(v)
  }).join(','))
}
writeFileSync(OUT_CSV, csvRows.join('\n') + '\n', 'utf-8')

// ─── 5. Résumé stdout ────────────────────────────────────────────────
console.log()
console.log(`✓ CSV écrit : ${OUT_CSV}`)
console.log(`  ${lignes.length} lignes générées`)
console.log()

// Décompte par flag (chaque flag compté une fois par ligne où il apparaît)
const decompte = {}
for (const l of lignes) {
  for (const f of l.flag.split('|')) decompte[f] = (decompte[f] || 0) + 1
}
console.log('Décompte par flag :')
for (const [f, n] of Object.entries(decompte).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)} × ${f}`)
}

// Top 5 |écart_caisse|
const avecEcartCaisse = lignes.filter(l => l.ecart_caisse_ks2_vs_hca !== '')
  .map(l => ({ date: l.date, ecart: l.ecart_caisse_ks2_vs_hca }))
  .sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart))
console.log()
console.log('Top 5 dates par |écart caisse KS2 vs HCA| :')
for (const e of avecEcartCaisse.slice(0, 5)) {
  console.log(`  ${e.date} : ${e.ecart >= 0 ? '+' : ''}${e.ecart.toFixed(2)} €`)
}

// Top 5 |écart_uber|
const avecEcartUber = lignes.filter(l => l.ecart_uber_ks2_vs_hca !== '')
  .map(l => ({ date: l.date, ecart: l.ecart_uber_ks2_vs_hca }))
  .sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart))
console.log()
console.log('Top 5 dates par |écart uber KS2 vs HCA| :')
for (const e of avecEcartUber.slice(0, 5)) {
  console.log(`  ${e.date} : ${e.ecart >= 0 ? '+' : ''}${e.ecart.toFixed(2)} €`)
}

// Nombre de jours TPA > 0
const nbTpa = lignes.filter(l => (l.ks2_tpa || 0) > 0).length
console.log()
console.log(`Jours TPA > 0 : ${nbTpa} sur ${lignes.length}`)

// Dates problématiques signalées
if (datesProblematiques.length > 0) {
  console.log()
  console.log(`⚠ Dates problématiques (${datesProblematiques.length}) :`)
  for (const dp of datesProblematiques) console.log(`  ${dp.iso} : ${dp.raison}`)
}

// Dates de la période attendues mais absentes du KS2 (au cas où)
const attendues = []
const cur = new Date(PERIOD_START + 'T00:00:00Z')
const end = new Date(PERIOD_END + 'T00:00:00Z')
while (cur <= end) { attendues.push(cur.toISOString().slice(0, 10)); cur.setUTCDate(cur.getUTCDate() + 1) }
const absentes = attendues.filter(d => !ks2ParJour[d])
if (absentes.length > 0) {
  console.log()
  console.log(`Info — dates de la période [${PERIOD_START}..${PERIOD_END}] absentes du fichier KS2 (${absentes.length}) :`)
  for (const d of absentes.slice(0, 30)) console.log(`  ${d}`)
  if (absentes.length > 30) console.log(`  ... et ${absentes.length - 30} autres`)
}

process.exit(0)
