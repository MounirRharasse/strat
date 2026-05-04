// CSV de pré-validation pour l'import API Popina → ventes_par_source + paiements_caisse.
// LECTURE PURE : aucune écriture Supabase, aucun appel API d'écriture.
//
// Fetch API Popina mois par mois sur 2025-01-16 → 2026-05-02 (≈17 appels),
// agrégation par jour, comparaison avec historique_ca legacy.
//
// Sortie : /Users/mRharasse/Downloads/popina-pre-import-validation.csv

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
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
const PERIOD_START = '2025-01-16'
const PERIOD_END   = '2026-05-02'
const OUT_CSV      = '/Users/mRharasse/Downloads/popina-pre-import-validation.csv'

const { supabase } = await import('../lib/supabase.js')
const { getAllReports, getAllOrders } = await import('../lib/popina.js')

// ─── Helpers ────────────────────────────────────────────────────────
const toEuros = c => Math.round(c) / 100
const r2 = n => Math.round(n * 100) / 100

function classifyPayment(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('esp')) return 'especes'
  if (n.includes('carte') || n.includes('credit') || n.includes('crédit')) return 'cb'
  if (n.includes('borne')) return 'tpa'
  if (n.includes('titre') || n.includes('restaurant')) return 'tr'
  return 'autre'  // Edenred, Lunchr, Apple Pay, etc.
}

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
    // Borner sur la période globale
    out.push({
      since: monthSince < since ? since : monthSince,
      until: monthUntil > until ? until : monthUntil,
    })
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  return out
}

// ─── 1. Fetch API Popina mois par mois ──────────────────────────────
console.log()
console.log('Fetch API Popina mois par mois sur', PERIOD_START, '→', PERIOD_END)
console.log('─'.repeat(70))

const apiParJour = {} // ISO → { ttc, ht, nb_orders, paiements: { especes, cb, tpa, tr, autre } }
const months = listMonths(PERIOD_START, PERIOD_END)

for (const month of months) {
  process.stdout.write(`  ${month.since} → ${month.until} ... `)
  const t0 = Date.now()
  const [reports, orders] = await Promise.all([
    getAllReports(month.since, month.until),
    getAllOrders(month.since, month.until),
  ])
  const dureeMs = Date.now() - t0

  // Indexer reports par jour (startedAt)
  for (const r of reports || []) {
    const date = (r.startedAt || r.finalizedAt || '').slice(0, 10)
    if (!date || date < PERIOD_START || date > PERIOD_END) continue
    if (!apiParJour[date]) {
      apiParJour[date] = { ttc: 0, ht: 0, nb_orders: 0, paiements: { especes: 0, cb: 0, tpa: 0, tr: 0, autre: 0 } }
    }
    const ttc = toEuros(r.totalSales || 0)
    const tva = (r.reportTaxes || []).reduce((s, t) => s + toEuros(t.taxAmount || 0), 0)
    apiParJour[date].ttc += ttc
    apiParJour[date].ht += (ttc - tva)
    for (const p of (r.reportPayments || [])) {
      const cat = classifyPayment(p.paymentName)
      apiParJour[date].paiements[cat] += toEuros(p.paymentAmount || 0)
    }
  }
  // Indexer orders par jour pour nb_commandes
  for (const o of orders || []) {
    if (o.isCanceled) continue
    if ((o.total || 0) <= 0) continue
    const date = (o.openedAt || o.createdAt || '').slice(0, 10)
    if (!date || date < PERIOD_START || date > PERIOD_END) continue
    if (!apiParJour[date]) {
      apiParJour[date] = { ttc: 0, ht: 0, nb_orders: 0, paiements: { especes: 0, cb: 0, tpa: 0, tr: 0, autre: 0 } }
    }
    apiParJour[date].nb_orders++
  }

  console.log(`${reports?.length || 0} reports, ${orders?.length || 0} orders (${dureeMs}ms)`)
}

console.log(`  → ${Object.keys(apiParJour).length} jours avec data API sur ${months.length} mois`)

// ─── 2. Lecture historique_ca legacy ─────────────────────────────────
const { data: legacyRows, error: errLegacy } = await supabase
  .from('historique_ca')
  .select('date, ca_brut, ca_ht, especes, cb, tpa, tr, nb_commandes')
  .eq('parametre_id', KROUSTY)
  .gte('date', PERIOD_START).lte('date', PERIOD_END)
  .order('date', { ascending: true })
if (errLegacy) {
  console.error('Erreur lecture historique_ca :', errLegacy.message)
  process.exit(1)
}
const legacyParJour = {}
for (const r of legacyRows || []) legacyParJour[r.date] = r

console.log(`  → ${(legacyRows || []).length} rows historique_ca legacy sur la période`)

// ─── 3. Construction des lignes CSV ──────────────────────────────────
const datesAll = new Set([...Object.keys(apiParJour), ...Object.keys(legacyParJour)])
const datesTriees = [...datesAll].sort()

const lignes = []
for (const iso of datesTriees) {
  const a = apiParJour[iso] || null
  const l = legacyParJour[iso] || null

  const api_ttc = a ? r2(a.ttc) : 0
  const api_ht = a ? r2(a.ht) : 0
  const api_nb = a ? a.nb_orders : 0
  const api_esp = a ? r2(a.paiements.especes) : 0
  const api_cb = a ? r2(a.paiements.cb) : 0
  const api_tpa = a ? r2(a.paiements.tpa) : 0
  const api_tr = a ? r2(a.paiements.tr) : 0
  const api_autre = a ? r2(a.paiements.autre) : 0

  const hca_ttc = l ? (l.ca_brut || 0) : 0
  const hca_ht = l ? (l.ca_ht || 0) : 0
  const hca_nb = l ? (l.nb_commandes || 0) : 0
  const hca_esp = l ? (l.especes || 0) : 0
  const hca_cb = l ? (l.cb || 0) : 0
  const hca_tpa = l ? (l.tpa || 0) : 0
  const hca_tr = l ? (l.tr || 0) : 0

  const ecart_ttc = r2(api_ttc - hca_ttc)
  const ecart_paiements = r2((api_esp + api_cb + api_tpa + api_tr) - (hca_esp + hca_cb + hca_tpa + hca_tr))

  const flags = []
  if (!a && l) flags.push('API_VIDE_HCA_PRESENT')
  else if (a && !l) flags.push('API_PRESENT_HCA_ABSENT')
  else if (a && l) {
    const ecartCaisse = Math.abs(ecart_ttc) >= 1
    const ecartPaiements = Math.abs(ecart_paiements) >= 1
    if (ecartCaisse) flags.push('ECART_TTC')
    if (ecartPaiements) flags.push('ECART_PAIEMENTS')
    if (!ecartCaisse && !ecartPaiements) flags.push('OK_MATCH')
  }
  if (api_autre > 0) flags.push('PAIEMENTS_AUTRE')

  lignes.push({
    date: iso,
    api_ttc, api_ht, api_nb_orders: api_nb,
    api_especes: api_esp, api_cb, api_tpa, api_tr, api_autre,
    hca_ca_brut: hca_ttc, hca_ca_ht: hca_ht, hca_nb_commandes: hca_nb,
    hca_especes: hca_esp, hca_cb, hca_tpa, hca_tr,
    ecart_ttc, ecart_paiements,
    flag: flags.join('|'),
  })
}

// ─── 4. Écriture CSV ────────────────────────────────────────────────
const HEADER = [
  'date',
  'api_ttc', 'api_ht', 'api_nb_orders',
  'api_especes', 'api_cb', 'api_tpa', 'api_tr', 'api_autre',
  'hca_ca_brut', 'hca_ca_ht', 'hca_nb_commandes',
  'hca_especes', 'hca_cb', 'hca_tpa', 'hca_tr',
  'ecart_ttc', 'ecart_paiements',
  'flag',
]
const csvRows = [HEADER.join(',')]
for (const l of lignes) {
  csvRows.push(HEADER.map(h => {
    const v = l[h]
    if (v === '' || v === null || v === undefined) return ''
    return String(v)
  }).join(','))
}
writeFileSync(OUT_CSV, csvRows.join('\n') + '\n', 'utf-8')

// ─── 5. Résumé stdout ───────────────────────────────────────────────
console.log()
console.log('═'.repeat(70))
console.log(`✓ CSV écrit : ${OUT_CSV}`)
console.log(`  ${lignes.length} lignes générées`)
console.log()

const decompte = {}
for (const l of lignes) {
  for (const f of l.flag.split('|')) decompte[f] = (decompte[f] || 0) + 1
}
console.log('Décompte par flag :')
for (const [f, n] of Object.entries(decompte).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)} × ${f}`)
}

// Top 5 |ecart_ttc|
const avecEcartTtc = lignes.filter(l => l.flag.includes('ECART_TTC'))
  .map(l => ({ date: l.date, ecart: l.ecart_ttc, api: l.api_ttc, hca: l.hca_ca_brut }))
  .sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart))
console.log()
console.log('Top 10 dates par |ecart_ttc| (API vs HCA) :')
for (const e of avecEcartTtc.slice(0, 10)) {
  console.log(`  ${e.date} : api=${e.api.toFixed(2)} hca=${e.hca.toFixed(2)} → Δ ${e.ecart >= 0 ? '+' : ''}${e.ecart.toFixed(2)} €`)
}

// Total API vs total HCA
const sumApi = r2(lignes.reduce((s, l) => s + l.api_ttc, 0))
const sumHca = r2(lignes.reduce((s, l) => s + l.hca_ca_brut, 0))
console.log()
console.log('TOTAUX caisse TTC sur la période :')
console.log(`  API Popina       : ${sumApi.toFixed(2)} €`)
console.log(`  historique_ca    : ${sumHca.toFixed(2)} €`)
console.log(`  Écart API - HCA  : ${(sumApi - sumHca).toFixed(2)} € (${((sumApi - sumHca) / sumHca * 100).toFixed(2)}%)`)
console.log()

// Cas particuliers
const apiPresentHcaAbsent = lignes.filter(l => l.flag.includes('API_PRESENT_HCA_ABSENT'))
const apiVideHcaPresent = lignes.filter(l => l.flag.includes('API_VIDE_HCA_PRESENT'))
const paiementsAutre = lignes.filter(l => l.flag.includes('PAIEMENTS_AUTRE'))
console.log(`Jours avec API présent ET historique_ca absent : ${apiPresentHcaAbsent.length}`)
if (apiPresentHcaAbsent.length > 0 && apiPresentHcaAbsent.length <= 20) {
  for (const l of apiPresentHcaAbsent) console.log(`  ${l.date} : api=${l.api_ttc.toFixed(2)} €`)
}
console.log(`Jours avec API VIDE mais historique_ca présent : ${apiVideHcaPresent.length}`)
if (apiVideHcaPresent.length > 0 && apiVideHcaPresent.length <= 20) {
  for (const l of apiVideHcaPresent) console.log(`  ${l.date} : hca=${l.hca_ca_brut.toFixed(2)} € (jours fantômes connus ?)`)
}
console.log(`Jours avec paiements 'autre' (Edenred/Lunchr/...) : ${paiementsAutre.length}`)

process.exit(0)
