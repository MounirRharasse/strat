// Investigation : anomalie Appart City du 26 avril 2026 remontée par le brief.
// Lance avec :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/check-appart-city.mjs

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

const { supabase } = await import('../lib/supabase.js')

// 6 derniers mois (depuis 2025-10-30 → today)
const SINCE = '2025-10-30'
const UNTIL = '2026-04-30'

function mediane(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

console.log()
console.log(`Investigation transactions Appart City — ${SINCE} → ${UNTIL}`)
console.log('═'.repeat(80))

// Récupération large : on filtre côté JS pour insensible casse + contient "appart"
const { data: trans, error } = await supabase
  .from('transactions')
  .select('date, fournisseur_nom, montant_ttc, montant_ht, categorie_pl, sous_categorie')
  .eq('parametre_id', KROUSTY_ID)
  .gte('date', SINCE)
  .lte('date', UNTIL)
  .order('date', { ascending: true })

if (error) {
  console.error('Erreur :', error)
  process.exit(1)
}

const apparts = (trans || []).filter(t =>
  (t.fournisseur_nom || '').toLowerCase().includes('appart')
)

if (apparts.length === 0) {
  console.log('Aucune transaction Appart City trouvée sur la période.')
  process.exit(0)
}

console.log()
console.log(`${apparts.length} transaction(s) trouvée(s) sur 6 mois`)
console.log('─'.repeat(80))
console.log('date         | fournisseur               | TTC       | HT        | catégorie / sous-catégorie')
console.log('─'.repeat(80))

const cible = apparts.find(t => t.date === '2026-04-26')
const montants = apparts.map(t => t.montant_ttc || 0)
const med = mediane(montants)

for (const t of apparts) {
  const isCible = t.date === '2026-04-26'
  const flag = isCible ? '★' : ' '
  const fn = (t.fournisseur_nom || '').padEnd(25).slice(0, 25)
  const ttc = String((t.montant_ttc || 0).toFixed(2)).padStart(9)
  const ht = String((t.montant_ht || 0).toFixed(2)).padStart(9)
  const cat = (t.categorie_pl || '-') + (t.sous_categorie ? '/' + t.sous_categorie : '')
  console.log(`${flag} ${t.date} | ${fn} | ${ttc} | ${ht} | ${cat}`)
}

console.log('─'.repeat(80))
console.log()
console.log('STATISTIQUES')
console.log('─'.repeat(80))
const total = montants.reduce((a, b) => a + b, 0)
const moyenne = total / montants.length
const min = Math.min(...montants)
const max = Math.max(...montants)
const nbMois = 6
const freqParMois = (apparts.length / nbMois).toFixed(1)
console.log(`Nombre transactions   : ${apparts.length}`)
console.log(`Cumul 6 mois          : ${total.toFixed(2)} €`)
console.log(`Médiane TTC           : ${med.toFixed(2)} €`)
console.log(`Moyenne TTC           : ${moyenne.toFixed(2)} €`)
console.log(`Min / Max             : ${min.toFixed(2)} € / ${max.toFixed(2)} €`)
console.log(`Fréquence             : ${freqParMois} transactions / mois`)

if (cible) {
  console.log()
  console.log('★ TRANSACTION CIBLE — 26 avril 2026')
  console.log('─'.repeat(80))
  console.log(`Montant TTC          : ${cible.montant_ttc} €`)
  console.log(`Catégorie            : ${cible.categorie_pl}${cible.sous_categorie ? ' / ' + cible.sous_categorie : ''}`)
  const ecartEur = (cible.montant_ttc || 0) - med
  const ecartPct = med > 0 ? ((cible.montant_ttc - med) / med * 100) : null
  console.log(`Écart vs médiane     : ${ecartEur >= 0 ? '+' : ''}${ecartEur.toFixed(2)} € (${ecartPct !== null ? (ecartPct >= 0 ? '+' : '') + ecartPct.toFixed(1) + '%' : 'N/A'})`)
} else {
  console.log()
  console.log('★ Aucune transaction Appart City trouvée le 26 avril 2026')
  console.log('   → l\'alerte du brief vient peut-être d\'une autre logique (date approximative, sous-string, etc.)')
}

console.log()
console.log('CATÉGORIES VUES')
console.log('─'.repeat(80))
const parCat = {}
for (const t of apparts) {
  const k = `${t.categorie_pl || '-'}${t.sous_categorie ? ' / ' + t.sous_categorie : ''}`
  parCat[k] = (parCat[k] || 0) + 1
}
for (const [k, n] of Object.entries(parCat)) {
  console.log(`  ${k} : ${n} transactions`)
}

console.log()
process.exit(0)
