// Test manuel : génère une vraie explication IA pour une transaction donnée.
// Lance avec :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/test-anomalie.mjs <transaction_id>
//
// Ou avec un raccourci par fournisseur+date (cherche la transaction) :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/test-anomalie.mjs --find Metro 2026-04-21
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/test-anomalie.mjs --find "Appart City" 2026-04-26

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

const KROUSTY_ID = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'
const args = process.argv.slice(2)

const { supabase } = await import('../lib/supabase.js')
const { genererExplicationAnomalie } = await import('../lib/ia-anomalies.js')
const { buildAnomalieInputs } = await import('../lib/ia/anomalie-inputs.js')

let transaction_id

if (args[0] === '--find') {
  const fournisseur = args[1]
  const date = args[2]
  if (!fournisseur || !date) {
    console.error('Usage : --find <fournisseur> <YYYY-MM-DD>')
    process.exit(1)
  }
  const { data } = await supabase
    .from('transactions')
    .select('id, fournisseur_nom, date, montant_ttc')
    .eq('parametre_id', KROUSTY_ID)
    .ilike('fournisseur_nom', `%${fournisseur}%`)
    .eq('date', date)
    .order('montant_ttc', { ascending: false })
  if (!data || data.length === 0) {
    console.error(`Aucune transaction trouvée pour ${fournisseur} ${date}`)
    process.exit(1)
  }
  console.log(`Trouvé ${data.length} transaction(s) :`)
  for (const t of data) {
    console.log(`  ${t.id} | ${t.fournisseur_nom} | ${t.date} | ${t.montant_ttc} €`)
  }
  // Prend la 1re (plus gros montant si plusieurs)
  transaction_id = data[0].id
} else if (args[0]) {
  transaction_id = args[0]
} else {
  console.error('Usage : test-anomalie.mjs <transaction_id>')
  console.error('  ou : test-anomalie.mjs --find <fournisseur> <date>')
  process.exit(1)
}

const sep = '═'.repeat(70)
const sub = '─'.repeat(70)

console.log()
console.log(sep)
console.log(`TEST EXPLICATION ANOMALIE — transaction_id: ${transaction_id}`)
console.log(sep)

// 1. Affiche les inputs qui seront envoyés
console.log()
console.log('INPUTS')
console.log(sub)
let inputs
try {
  inputs = await buildAnomalieInputs({ parametre_id: KROUSTY_ID, transaction_id })
  console.log(JSON.stringify(inputs, null, 2))
} catch (e) {
  console.error(`Erreur build inputs : ${e.message}`)
  process.exit(2)
}

// 2. Génère l'explication
console.log()
console.log('GÉNÉRATION IA')
console.log(sub)
const t0 = Date.now()
const r = await genererExplicationAnomalie({ parametre_id: KROUSTY_ID, transaction_id })
const dureeMs = Date.now() - t0

if (r.error) {
  console.error(`✗ Erreur : ${r.error}`)
  if (r.chiffres) console.error(`  Chiffres hallucines : ${r.chiffres.join(', ')}`)
  process.exit(3)
}

console.log()
console.log(sep)
console.log(`EXPLICATION (depuis_cache=${r.depuis_cache})`)
console.log(sep)
console.log()
console.log(r.contenu)
console.log()
console.log(sub)
if (r.cout_eur != null) {
  console.log(`Coût : ${r.cout_eur.toFixed(5)} € | Tokens : ${r.tokens_input}/${r.tokens_output} | Durée : ${(dureeMs/1000).toFixed(2)}s`)
} else {
  console.log(`Cache hit (gratuit) | Généré le : ${r.generee_le}`)
}
console.log(sep)

process.exit(0)
