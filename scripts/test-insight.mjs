// Test manuel : génère un vrai insight IA pour 1 jour ou une plage.
// Lance avec :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/test-insight.mjs YYYY-MM-DD
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/test-insight.mjs YYYY-MM-DD YYYY-MM-DD

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

const args = process.argv.slice(2)
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

if (args.length === 0 || !DATE_REGEX.test(args[0])) {
  console.error('Usage : test-insight.mjs YYYY-MM-DD [YYYY-MM-DD]')
  process.exit(1)
}
const since = args[0]
const until = args[1] && DATE_REGEX.test(args[1]) ? args[1] : args[0]

if (since > until) {
  console.error(`Erreur : ${since} > ${until}`)
  process.exit(1)
}

const KROUSTY_ID = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'

const { genererInsightDuJour } = await import('../lib/ia-insight.js')
const { supabase } = await import('../lib/supabase.js')

// Liste des dates
const jours = []
const debut = new Date(since + 'T12:00:00Z')
const fin = new Date(until + 'T12:00:00Z')
for (let d = new Date(debut); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
  jours.push(d.toISOString().split('T')[0])
}

const sep = '═'.repeat(72)
const sub = '─'.repeat(72)

console.log()
console.log(sep)
console.log(`Test genererInsightDuJour pour Krousty`)
console.log(`Range : ${since} → ${until} (${jours.length} jour${jours.length > 1 ? 's' : ''})`)
console.log(sep)

let totalCout = 0
let nbGen = 0
let nbCache = 0
let nbSkipped = 0
let nbError = 0

for (const date of jours) {
  console.log()
  console.log(`▶ ${date}`)
  console.log(sub)
  const t0 = Date.now()
  let r
  try {
    r = await genererInsightDuJour({ parametre_id: KROUSTY_ID, date_ref: date })
  } catch (e) {
    console.log(`✗ Exception : ${e.message}`)
    nbError++
    continue
  }
  const dureeS = ((Date.now() - t0) / 1000).toFixed(2)

  if (r.skipped) {
    console.log(`∅ Aucun trigger détecté (${r.raison}). Pas d'INSERT.`)
    nbSkipped++
    continue
  }
  if (r.error) {
    console.log(`✗ Erreur : ${r.error}`)
    if (r.chiffres) console.log(`  Chiffres hallucines : ${r.chiffres.join(', ')}`)
    if (r.signal_inserted) console.log(`  Signal inserted en DB mais traite_par_ia=false (cron retentera)`)
    nbError++
    continue
  }
  if (r.depuis_cache) {
    console.log(`✓ Depuis cache (déjà traité)`)
    console.log(`  Signal : ${r.signal.type_trigger} magnitude=${r.signal.magnitude}`)
    console.log(`  Contenu : ${r.contenu}`)
    nbCache++
    continue
  }

  // Génération réussie
  console.log(`✓ Généré en ${dureeS}s`)
  console.log(`  Signal : ${r.signal.type_trigger} (${r.signal.tier}) · magnitude=${r.signal.magnitude}`)
  console.log(`  Tokens : ${r.tokens_input}/${r.tokens_output} · Coût : ${r.cout_eur.toFixed(5)} €`)
  console.log()
  console.log(`  ${r.contenu}`)
  totalCout += r.cout_eur
  nbGen++
}

console.log()
console.log(sep)
console.log('STATS')
console.log(sub)
console.log(`Générés       : ${nbGen}`)
console.log(`Depuis cache  : ${nbCache}`)
console.log(`Skipped       : ${nbSkipped}`)
console.log(`Erreurs       : ${nbError}`)
console.log(`Coût cumulé   : ${totalCout.toFixed(5)} €`)
console.log()

const nbInserts = nbGen + nbError
if (nbInserts > 0) {
  console.log(`${nbInserts} ligne(s) ia_signaux insérée(s) ou tentées pendant ce run.`)
  console.log('Pour purger après audit dans Supabase Studio :')
  console.log()
  console.log(`DELETE FROM ia_signaux`)
  console.log(`WHERE parametre_id = '${KROUSTY_ID}'`)
  console.log(`AND date_detection BETWEEN '${since}' AND '${until}';`)
  console.log()
}
console.log(sep)

process.exit(0)
