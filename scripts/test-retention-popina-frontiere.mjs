// Affine la frontière de rétention API Popina détectée par test-retention-popina.mjs.
// Le premier run a montré : data dès 2025-01-14, vide en 2024-09 et antérieur.
// On teste ici les mois manquants (2024-10/11/12) puis jour par jour autour du 14/01/2025.

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

function resume(reports) {
  const dates = new Set()
  let totalSales = 0
  for (const r of reports || []) {
    const d = (r.startedAt || r.finalizedAt || '').slice(0, 10)
    if (d) dates.add(d)
    totalSales += (r.totalSales || 0)
  }
  const triees = [...dates].sort()
  return {
    nb_reports: (reports || []).length,
    nb_jours_distincts: dates.size,
    date_min_observee: triees[0] || null,
    date_max_observee: triees[triees.length - 1] || null,
    total_sales_eur: Math.round(totalSales) / 100,
  }
}

const trace = []
async function tester(since, until, label) {
  const start = Date.now()
  try {
    const r = await getAllReports(since, until)
    const out = { label, since, until, ...resume(r), duree_ms: Date.now() - start }
    trace.push(out)
    console.error(`[${label}] ${since} → ${until} : ${out.nb_reports} reports, ${out.nb_jours_distincts} jours, min=${out.date_min_observee || '—'}, ${out.total_sales_eur}€`)
    return out
  } catch (e) {
    const out = { label, since, until, error_message: e.message }
    trace.push(out)
    console.error(`[${label}] ERREUR : ${e.message}`)
    return out
  }
}

// ─── Mois manquants entre frontière nulle (2024-09) et donnée (2025-01) ─
await tester('2024-10-01', '2024-10-31', 'mois-2024-10')
await tester('2024-11-01', '2024-11-30', 'mois-2024-11')
await tester('2024-12-01', '2024-12-31', 'mois-2024-12')

// ─── Frontière jour par jour autour du 14/01/2025 ─────────────────────
//  - 2025-01-08 → 2025-01-13 : on s'attend à 0 reports si la rétention démarre au 14
//  - 2025-01-14 → 2025-01-20 : on s'attend à des données
for (const d of ['2025-01-08', '2025-01-09', '2025-01-10', '2025-01-11', '2025-01-12', '2025-01-13', '2025-01-14']) {
  await tester(d, d, `jour-${d}`)
}

// ─── Sécurité : tester aussi les bornes extrêmes connues comme OK ────
await tester('2025-01-15', '2025-01-15', 'jour-2025-01-15')

console.log(JSON.stringify({ nb_appels: trace.length, fenetres: trace }, null, 2))
process.exit(0)
