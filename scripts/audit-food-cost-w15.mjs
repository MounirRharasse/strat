// Audit food_cost W15 (6-12 avril 2026) à 73.62% — suspecté trop haut.
// Lance avec :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/audit-food-cost-w15.mjs

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
const SINCE = '2026-04-06'
const UNTIL = '2026-04-12'

const { supabase } = await import('../lib/supabase.js')
const { getAnalysesKPIs } = await import('../lib/data/analyses-kpis.js')

const sep = '═'.repeat(72)
const sub = '─'.repeat(72)

console.log()
console.log(sep)
console.log(`AUDIT 2 — food_cost W15 (${SINCE} → ${UNTIL})`)
console.log(sep)

// ─── 1. CA semaine W15 ────────────────────────────────────────────────
const { data: hist } = await supabase
  .from('historique_ca')
  .select('date, ca_brut, ca_ht, uber, nb_commandes')
  .eq('parametre_id', KROUSTY)
  .gte('date', SINCE).lte('date', UNTIL)
  .order('date', { ascending: true })

const { data: entrees } = await supabase
  .from('entrees')
  .select('date, montant_ttc')
  .eq('parametre_id', KROUSTY)
  .gte('date', SINCE).lte('date', UNTIL)
  .eq('source', 'uber_eats')

const ca_brut_hist = (hist || []).reduce((s, r) => s + (r.ca_brut || 0), 0)
const ca_ht_hist = (hist || []).reduce((s, r) => s + (r.ca_ht || 0), 0)
const ca_uber_hist = (hist || []).reduce((s, r) => s + (r.uber || 0), 0)
const ca_uber_entrees = (entrees || []).reduce((s, e) => s + (e.montant_ttc || 0), 0)
const ca_brut_total = ca_brut_hist + ca_uber_hist + ca_uber_entrees
const ca_ht_total = ca_ht_hist + (ca_uber_hist + ca_uber_entrees) / 1.1

console.log()
console.log('CA SEMAINE W15')
console.log(sub)
console.log(`historique_ca.ca_brut       : ${ca_brut_hist.toFixed(2)} €`)
console.log(`historique_ca.ca_ht         : ${ca_ht_hist.toFixed(2)} €`)
console.log(`historique_ca.uber          : ${ca_uber_hist.toFixed(2)} €`)
console.log(`entrees(uber_eats).montant  : ${ca_uber_entrees.toFixed(2)} €`)
console.log(`-------- TOTAL TTC          : ${ca_brut_total.toFixed(2)} €`)
console.log(`-------- TOTAL HT (uber/1.1): ${ca_ht_total.toFixed(2)} €`)

// ─── 2. Consommations semaine W15 ─────────────────────────────────────
const { data: trans } = await supabase
  .from('transactions')
  .select('date, fournisseur_nom, sous_categorie, categorie_pl, montant_ht, montant_ttc')
  .eq('parametre_id', KROUSTY)
  .gte('date', SINCE).lte('date', UNTIL)
  .order('montant_ht', { ascending: false })

const consoTrans = (trans || []).filter(t => t.categorie_pl === 'consommations')
const consoHT = consoTrans.reduce((s, t) => s + (t.montant_ht || 0), 0)
const consoTTC = consoTrans.reduce((s, t) => s + (t.montant_ttc || 0), 0)

console.log()
console.log('CONSOMMATIONS SEMAINE W15')
console.log(sub)
console.log(`Nb transactions consommations : ${consoTrans.length}`)
console.log(`Total HT                      : ${consoHT.toFixed(2)} €`)
console.log(`Total TTC                     : ${consoTTC.toFixed(2)} €`)

// ─── 3. Calcul food cost manuel ───────────────────────────────────────
const fcManuelHT = ca_ht_total > 0 ? (consoHT / ca_ht_total) * 100 : 0
const fcManuelTTC = ca_brut_total > 0 ? (consoTTC / ca_brut_total) * 100 : 0

console.log()
console.log('FOOD COST CALCULÉ MANUELLEMENT')
console.log(sub)
console.log(`food_cost (HT/HT)   = ${consoHT.toFixed(2)} / ${ca_ht_total.toFixed(2)} = ${fcManuelHT.toFixed(2)}%`)
console.log(`food_cost (TTC/TTC) = ${consoTTC.toFixed(2)} / ${ca_brut_total.toFixed(2)} = ${fcManuelTTC.toFixed(2)}%`)

// ─── 4. Lancer getAnalysesKPIs pour comparer ─────────────────────────
const { data: parametres } = await supabase
  .from('parametres').select('*').eq('id', KROUSTY).single()

const kpis = await getAnalysesKPIs({
  parametre_id: KROUSTY, since: SINCE, until: UNTIL, parametres
})

console.log()
console.log('VS getAnalysesKPIs (la fonction utilisée par insight-detection)')
console.log(sub)
console.log(`foodCostP   : ${kpis.foodCostP}%`)
console.log(`foodCostMode: ${kpis.foodCostMode}`)
console.log(`ca.brut     : ${kpis.ca?.brut} €`)
console.log(`ca.ht       : ${kpis.ca?.ht} €`)
console.log(`consommations (sortie) : ${kpis.consommations} €`)

// ─── 5. Top 10 transactions consommations W15 ────────────────────────
console.log()
console.log('TOP 10 TRANSACTIONS consommations W15')
console.log(sub)
const top10 = consoTrans.slice(0, 10)
console.log('date       | fournisseur                | sous_cat                 | HT       | TTC')
console.log(sub)
for (const t of top10) {
  const fn = (t.fournisseur_nom || '-').padEnd(26).slice(0, 26)
  const sc = (t.sous_categorie || '-').padEnd(24).slice(0, 24)
  const ht = String((t.montant_ht || 0).toFixed(2)).padStart(8)
  const ttc = String((t.montant_ttc || 0).toFixed(2)).padStart(8)
  console.log(`${t.date} | ${fn} | ${sc} | ${ht} | ${ttc}`)
}

// ─── 6. Diagnostic ────────────────────────────────────────────────────
console.log()
console.log(sep)
console.log('DIAGNOSTIC')
console.log(sep)
const ecartFc = Math.abs(kpis.foodCostP - 73.62)
if (ecartFc < 1) {
  console.log(`✓ Détection food cost cohérente avec getAnalysesKPIs (${kpis.foodCostP}%)`)
} else {
  console.log(`✗ Détection 73.62% vs getAnalysesKPIs ${kpis.foodCostP}% : Δ=${ecartFc.toFixed(2)}pts`)
}

console.log()
console.log(`Calcul manuel HT      : ${fcManuelHT.toFixed(2)}%`)
console.log(`getAnalysesKPIs       : ${kpis.foodCostP}%`)
console.log(`Mode                  : ${kpis.foodCostMode}`)

if (kpis.foodCostMode === 'estime') {
  console.log()
  console.log('Mode "estime" : food cost basé sur achats / CA HT, sans inventaire.')
  console.log('Typique d\'un food cost surévalué si :')
  console.log('  - Gros achat de stock (Metro, Transgourmet) cette semaine non écoulé')
  console.log('  - Faible CA (semaine ferme/calme)')
  console.log('  - Catégorisation : transactions non-conso classées en "consommations"')
}

console.log()
process.exit(0)
