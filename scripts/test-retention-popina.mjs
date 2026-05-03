// Test de profondeur de rétention de l'API Popina via getAllReports().
// LECTURE PURE — aucune écriture en BDD, aucune écriture côté Popina.
//
// Usage :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/test-retention-popina.mjs
//
// Méthode :
//   1. Smoke test limite haute (2026-05-01 → 2026-05-02) pour valider que l'API
//      répond toujours.
//   2. Test fenêtres mensuelles : 2025-01, 2025-04, 2025-07, 2025-10, 2024-07,
//      2024-01 — pour situer où la rétention commence.
//   3. Si une frontière nette apparaît dans un mois donné, échantillonnage jour
//      par jour autour de la frontière pour vérifier coupure nette vs progressive.

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

function bizarrerie(reports, since, until) {
  if (!Array.isArray(reports)) return 'reports n\'est pas un tableau'
  return null
}

function resumeFenetre(reports, since, until) {
  const dates = new Set()
  let totalSales = 0
  let nbReports = reports.length
  for (const r of reports || []) {
    const d = (r.startedAt || r.finalizedAt || '').slice(0, 10)
    if (d) dates.add(d)
    totalSales += (r.totalSales || 0)
  }
  const datesTriees = [...dates].sort()
  return {
    since, until,
    nb_reports: nbReports,
    nb_jours_distincts: dates.size,
    date_min_observee: datesTriees[0] || null,
    date_max_observee: datesTriees[datesTriees.length - 1] || null,
    total_sales_centimes: totalSales,
    total_sales_eur: Math.round(totalSales) / 100,
  }
}

const t0 = Date.now()
const trace = []

async function tester(since, until, label) {
  const start = Date.now()
  let result, error
  try {
    const reports = await getAllReports(since, until)
    const dureeMs = Date.now() - start
    const r = resumeFenetre(reports, since, until)
    const biz = bizarrerie(reports, since, until)
    result = { ...r, duree_ms: dureeMs, ...(biz ? { bizarrerie: biz } : {}) }
  } catch (e) {
    error = { since, until, error_message: e.message, stack: (e.stack || '').split('\n').slice(0, 4) }
  }
  const entry = { label, ...(result || error) }
  trace.push(entry)
  console.error(`[${label}] ${since} → ${until} : ${error ? 'ERREUR ' + error.error_message : `${result.nb_reports} reports, ${result.nb_jours_distincts} jours, ${result.total_sales_eur}€`}`)
  return entry
}

// ─── 1. Smoke test limite haute (vérifie que l'API marche aujourd'hui) ──
await tester('2026-05-01', '2026-05-02', 'smoke-haut')

// ─── 2. Fenêtres mensuelles dichotomique ────────────────────────────────
await tester('2025-01-01', '2025-01-31', 'mois-2025-01')
await tester('2025-04-01', '2025-04-30', 'mois-2025-04')
await tester('2025-07-01', '2025-07-31', 'mois-2025-07')
await tester('2025-10-01', '2025-10-31', 'mois-2025-10')
await tester('2024-07-01', '2024-07-31', 'mois-2024-07')
await tester('2024-01-01', '2024-01-31', 'mois-2024-01')
await tester('2023-07-01', '2023-07-31', 'mois-2023-07')

// ─── 3. Échantillonnage trimestriel autour de toute frontière potentielle ─
// (on regarde aussi sept 2024, février 2024 pour combler entre les fenêtres)
await tester('2024-09-01', '2024-09-30', 'mois-2024-09')
await tester('2024-04-01', '2024-04-30', 'mois-2024-04')

// ─── Synthèse ───────────────────────────────────────────────────────────
const dureeTotaleMs = Date.now() - t0
console.log(JSON.stringify({
  duree_totale_ms: dureeTotaleMs,
  nb_appels: trace.length,
  fenetres: trace,
}, null, 2))

process.exit(0)
