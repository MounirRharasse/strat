// Diagnostic : composition de la classe 'autre' dans les paiements Popina.
// Période : 2025-01-16 → 2026-05-02 (alignée sur étape 3).
// LECTURE PURE — aucune écriture BDD, aucun appel d'écriture API.
//
// Sortie : tableau des paymentName distincts classifiés 'autre' par
//   classifyPayment() (verbatim, copié-collé du script d'import principal).
//   Trié par sum décroissant, top 20 + ligne AUTRES.

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

const { getAllReports } = await import('../lib/popina.js')

const PERIOD_START = '2025-01-16'
const PERIOD_END   = '2026-05-02'

// VERBATIM depuis scripts/import-popina-phase-a-etape-3.mjs (ne pas modifier)
function classifyPayment(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('esp')) return 'especes'
  if (n.includes('carte') || n.includes('credit') || n.includes('crédit')) return 'cb'
  if (n.includes('borne')) return 'tpa'
  if (n.includes('titre') || n.includes('restaurant')) return 'tr'
  return 'autre'
}

const toEuros = c => Math.round(c) / 100
const r2 = n => Math.round(n * 100) / 100

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

console.log()
console.log('Fetch API Popina mois par mois sur', PERIOD_START, '→', PERIOD_END)

const autreParName = {}      // paymentName verbatim → { nb, sum }
const totalParCategorie = { especes: 0, cb: 0, tpa: 0, tr: 0, autre: 0 }
const months = listMonths(PERIOD_START, PERIOD_END)

for (const month of months) {
  process.stdout.write(`  ${month.since} → ${month.until} ... `)
  const t0 = Date.now()
  const reports = await getAllReports(month.since, month.until)
  let monthAutre = 0
  for (const rep of reports || []) {
    const date = (rep.startedAt || '').slice(0, 10)
    if (!date || date < PERIOD_START || date > PERIOD_END) continue
    for (const p of (rep.reportPayments || [])) {
      const cat = classifyPayment(p.paymentName)
      const amount = toEuros(p.paymentAmount || 0)
      totalParCategorie[cat] += amount
      if (cat === 'autre') {
        const key = p.paymentName ?? '(null)'
        if (!autreParName[key]) autreParName[key] = { nb: 0, sum: 0 }
        autreParName[key].nb++
        autreParName[key].sum += amount
        monthAutre += amount
      }
    }
  }
  console.log(`${reports?.length || 0} reports, ${r2(monthAutre)}€ autre (${Date.now() - t0}ms)`)
}

// ─── Tri + top 20 ────────────────────────────────────────────────────
const allRows = Object.entries(autreParName)
  .map(([name, v]) => ({ name, nb: v.nb, sum: r2(v.sum) }))
  .sort((a, b) => b.sum - a.sum)

const totalAutre = r2(totalParCategorie.autre)
const top20 = allRows.slice(0, 20)
const reste = allRows.slice(20)
const sumReste = r2(reste.reduce((s, r) => s + r.sum, 0))
const nbReste = reste.reduce((s, r) => s + r.nb, 0)

// ─── Affichage ───────────────────────────────────────────────────────
console.log()
console.log('═'.repeat(110))
console.log(`  COMPOSITION DE LA CATÉGORIE 'autre' — Total : ${totalAutre.toFixed(2)} € sur la période`)
console.log(`  ${allRows.length} paymentName distincts classés 'autre' (top 20 affichés + AUTRES)`)
console.log('═'.repeat(110))
console.log()
console.log('| #  | paymentName (verbatim)                               | nb_occur. | sum_amount (€) | % du Δ autre |')
console.log('|----|-------------------------------------------------------|-----------|----------------|--------------|')
top20.forEach((r, i) => {
  const pct = totalAutre > 0 ? (r.sum / totalAutre * 100) : 0
  const nameTrunc = r.name.length > 53 ? r.name.slice(0, 50) + '...' : r.name
  console.log(`| ${String(i + 1).padStart(2)} | ${nameTrunc.padEnd(53)} | ${String(r.nb).padStart(9)} | ${r.sum.toFixed(2).padStart(14)} | ${pct.toFixed(2).padStart(11)}% |`)
})
if (reste.length > 0) {
  const pctReste = totalAutre > 0 ? (sumReste / totalAutre * 100) : 0
  console.log(`| -- | AUTRES (${reste.length} paymentName distincts agrégés)`.padEnd(56) + ` | ${String(nbReste).padStart(9)} | ${sumReste.toFixed(2).padStart(14)} | ${pctReste.toFixed(2).padStart(11)}% |`)
}
console.log()

// ─── Récap toutes catégories pour vérif ─────────────────────────────
console.log('─'.repeat(110))
console.log('Vérif sums par catégorie classifyPayment :')
console.log(`  especes : ${r2(totalParCategorie.especes).toFixed(2)} €`)
console.log(`  cb      : ${r2(totalParCategorie.cb).toFixed(2)} €`)
console.log(`  tpa     : ${r2(totalParCategorie.tpa).toFixed(2)} €  (fusionné dans cb au push pcRows)`)
console.log(`  tr      : ${r2(totalParCategorie.tr).toFixed(2)} €`)
console.log(`  autre   : ${r2(totalParCategorie.autre).toFixed(2)} €`)
console.log(`  TOTAL   : ${r2(totalParCategorie.especes + totalParCategorie.cb + totalParCategorie.tpa + totalParCategorie.tr + totalParCategorie.autre).toFixed(2)} €`)
console.log()
console.log('Doit matcher dry-run :')
console.log(`  especes  : 230 982.28 €`)
console.log(`  cb (+tpa): 550 344.69 €`)
console.log(`  tr       : 14 530.29 €`)
console.log(`  autre    : 421 854.69 €`)
console.log()

process.exit(0)
