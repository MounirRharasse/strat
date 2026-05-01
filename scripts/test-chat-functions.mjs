// Test manuel : lance dispatch sur chacune des 15 fonctions chat avec
// inputs réels Krousty. Vérifie que le retour est structuré et que les
// chiffres sont cohérents avec ce que je vois dans le dashboard.
//
// Lance avec :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/test-chat-functions.mjs

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

const KROUSTY = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'
const { dispatch, TOOLS } = await import('../lib/ia/chat-functions.js')

const sep = '═'.repeat(72)
const sub = '─'.repeat(72)

console.log()
console.log(sep)
console.log(`Test des 15 fonctions chat sur Krousty (${TOOLS.length} fonctions)`)
console.log(sep)

// Calculs dynamiques pour entrées
const today = new Date().toISOString().slice(0, 10)
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
const thisMonth = today.slice(0, 7)

// Plan des 15 appels avec inputs cohérents
const plan = [
  // général
  { name: 'getCAJour', input: { date: yesterday } },
  { name: 'getCASemaine', input: { semaine_iso: '2026-W17' } },
  { name: 'getCAMois', input: { mois_iso: '2026-04' } },
  { name: 'getFoodCost', input: { semaine_iso: '2026-W17' } },
  { name: 'getSeuilRentabilite', input: {} },
  // fournisseurs
  { name: 'getTopFournisseurs', input: { n: 5 } },
  { name: 'getTransactionsFournisseur', input: { fournisseur_nom: 'Metro' } },
  { name: 'getMedianeFournisseur', input: { fournisseur_nom: 'Metro' } },
  // anomalies
  { name: 'getAnomaliesJournal', input: {} },
  { name: 'getTrousSaisie', input: {} },
  // insights
  { name: 'getInsightsRecents', input: { n_jours: 7 } },
  { name: 'getBriefSemaine', input: { semaine_iso: '2026-W17' } },
  // meta
  { name: 'getParametres', input: {} },
  { name: 'getStatutSynchro', input: {} },
  { name: 'getDateAujourdhui', input: {} }
]

let nbOK = 0, nbErr = 0
const errs = []

for (const step of plan) {
  console.log()
  console.log(`▶ ${step.name}(${JSON.stringify(step.input)})`)
  console.log(sub)
  const t0 = Date.now()
  let r
  try {
    r = await dispatch({ name: step.name, input: step.input, parametre_id: KROUSTY })
  } catch (e) {
    r = { error: 'EXCEPTION: ' + e.message }
  }
  const dureeMs = Date.now() - t0

  if (r.error) {
    nbErr++
    errs.push({ fn: step.name, error: r.error })
    console.log(`✗ ERREUR (${dureeMs}ms) : ${r.error}`)
    continue
  }
  nbOK++
  console.log(`✓ ${dureeMs}ms${r.truncated ? ' [TRUNCATED]' : ''}`)
  // Affiche compact du result (max 1500 chars)
  const json = JSON.stringify(r.result, null, 2)
  console.log(json.length > 1500 ? json.slice(0, 1500) + '\n... [tronqué pour affichage]' : json)
}

console.log()
console.log(sep)
console.log('STATS')
console.log(sub)
console.log(`Total fonctions     : ${plan.length}`)
console.log(`OK                  : ${nbOK}`)
console.log(`Erreurs             : ${nbErr}`)
if (errs.length > 0) {
  console.log()
  console.log('Erreurs :')
  for (const e of errs) console.log(`  ${e.fn} : ${e.error}`)
}
console.log(sep)

process.exit(nbErr > 0 ? 1 : 0)
