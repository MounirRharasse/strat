// Audit food_cost mois d'avril 2026.
// Le chat a retourné 52,22% en mode exact. Cohérent avec W17 à 41,8% ?

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
const SINCE = '2026-04-01'
const UNTIL = '2026-04-30'

const { supabase } = await import('../lib/supabase.js')
const { getAnalysesKPIs } = await import('../lib/data/analyses-kpis.js')
const { TVA_UBER_EATS } = await import('../lib/data/constants.js')

const sep = '═'.repeat(72)
const sub = '─'.repeat(72)

console.log()
console.log(sep)
console.log(`AUDIT food_cost AVRIL 2026 (${SINCE} → ${UNTIL})`)
console.log(sep)

const [{ data: hist }, { data: entrees }, { data: trans }, { data: inventaires }, { data: parametres }] = await Promise.all([
  supabase.from('historique_ca')
    .select('date, ca_brut, ca_ht, uber, nb_commandes')
    .eq('parametre_id', KROUSTY)
    .gte('date', SINCE).lte('date', UNTIL),
  supabase.from('entrees')
    .select('date, source, montant_ttc')
    .eq('parametre_id', KROUSTY).eq('source', 'uber_eats')
    .gte('date', SINCE).lte('date', UNTIL),
  supabase.from('transactions')
    .select('date, fournisseur_nom, montant_ttc, montant_ht, categorie_pl')
    .eq('parametre_id', KROUSTY)
    .gte('date', SINCE).lte('date', UNTIL),
  supabase.from('inventaires')
    .select('date, valeur_totale')
    .eq('parametre_id', KROUSTY)
    .order('date', { ascending: true }),
  supabase.from('parametres').select('*').eq('id', KROUSTY).single().then(r => ({ data: [r.data] }))
])

const params = parametres[0]

// ─── 1. CA total ─────────────────────────────────────────────────────
const ca_brut_hist = (hist || []).reduce((s, r) => s + (r.ca_brut || 0), 0)
const ca_ht_hist = (hist || []).reduce((s, r) => s + (r.ca_ht || 0), 0)
const uber_hist = (hist || []).reduce((s, r) => s + (r.uber || 0), 0)
const uber_entrees = (entrees || []).reduce((s, e) => s + (e.montant_ttc || 0), 0)
const ca_total_ttc = ca_brut_hist + uber_hist + uber_entrees
const ca_total_ht = ca_ht_hist + (uber_hist + uber_entrees) / TVA_UBER_EATS

console.log()
console.log('CA AVRIL')
console.log(sub)
console.log(`ca_brut historique_ca         : ${ca_brut_hist.toFixed(2)} €`)
console.log(`ca_ht historique_ca           : ${ca_ht_hist.toFixed(2)} €`)
console.log(`uber historique_ca            : ${uber_hist.toFixed(2)} €`)
console.log(`entrees uber_eats             : ${uber_entrees.toFixed(2)} €`)
console.log(`────`)
console.log(`CA TTC total (avec Uber TTC)  : ${ca_total_ttc.toFixed(2)} €`)
console.log(`CA HT total (avec Uber HT)    : ${ca_total_ht.toFixed(2)} €`)

// ─── 2. Conso ─────────────────────────────────────────────────────────
const conso = (trans || []).filter(t => t.categorie_pl === 'consommations')
const totalConsoHT = conso.reduce((s, t) => s + (t.montant_ht || 0), 0)
const totalConsoTTC = conso.reduce((s, t) => s + (t.montant_ttc || 0), 0)

console.log()
console.log('CONSOMMATIONS AVRIL')
console.log(sub)
console.log(`Nb transactions consommations : ${conso.length}`)
console.log(`Total HT                      : ${totalConsoHT.toFixed(2)} €`)
console.log(`Total TTC                     : ${totalConsoTTC.toFixed(2)} €`)

// Top 10 par montant
console.log()
console.log('Top 10 fournisseurs avril (consommations)')
console.log(sub)
const parFourn = {}
for (const t of conso) {
  const f = t.fournisseur_nom || '(sans nom)'
  parFourn[f] = (parFourn[f] || 0) + (t.montant_ht || 0)
}
const top = Object.entries(parFourn).sort((a, b) => b[1] - a[1]).slice(0, 10)
for (const [nom, total] of top) {
  console.log(`  ${nom.padEnd(30).slice(0, 30)} : ${total.toFixed(2)} € HT`)
}

// ─── 3. Inventaires ──────────────────────────────────────────────────
console.log()
console.log('INVENTAIRES (proximité avril)')
console.log(sub)
for (const i of (inventaires || [])) {
  const dateOk = i.date >= '2026-03-15' && i.date <= '2026-05-15'
  if (dateOk) console.log(`  ${i.date} : ${i.valeur_totale} €`)
}

// ─── 4. Calculs food cost ────────────────────────────────────────────
const fcManuelEstime = ca_total_ht > 0 ? (totalConsoHT / ca_total_ht) * 100 : 0

console.log()
console.log('FOOD COST CALCULÉ MANUELLEMENT (mode estimé)')
console.log(sub)
console.log(`(conso HT) / (CA HT total avec Uber) = ${totalConsoHT.toFixed(2)} / ${ca_total_ht.toFixed(2)}`)
console.log(`= ${fcManuelEstime.toFixed(2)}%`)

// ─── 5. getAnalysesKPIs (ce que le chat a vu) ────────────────────────
const kpis = await getAnalysesKPIs({
  parametre_id: KROUSTY, since: SINCE, until: UNTIL, parametres: params
})

console.log()
console.log('VS getAnalysesKPIs')
console.log(sub)
console.log(`foodCostP retourné            : ${kpis.foodCostP}%`)
console.log(`foodCostMode                  : ${kpis.foodCostMode}`)
console.log(`foodCostPeriode               : ${JSON.stringify(kpis.foodCostPeriode)}`)
console.log(`ca.brut (kpis)                : ${kpis.ca?.brut}`)
console.log(`ca.ht (kpis)                  : ${kpis.ca?.ht}`)
console.log(`consommations (kpis)          : ${kpis.consommations}`)

// ─── 6. Diagnostic ────────────────────────────────────────────────────
console.log()
console.log('DIAGNOSTIC')
console.log(sep)

if (kpis.foodCostMode === 'exact') {
  console.log('Mode exact : food cost calculé via inventaires (variation stock).')
  console.log('Le calcul manuel "estimé" diffère par construction (ne tient pas compte du stock).')
  console.log()
  if (Math.abs(kpis.foodCostP - fcManuelEstime) > 5) {
    console.log(`Écart entre exact (${kpis.foodCostP}%) et estimé manuel (${fcManuelEstime.toFixed(1)}%) :`)
    console.log('Cohérent si la variation stock est forte sur la période.')
  }
}

console.log()
console.log('Comparaison W17 (commit 5/6) :')
console.log('  W17 food_cost = 41.8% mode exact')
console.log(`  Avril food_cost = ${kpis.foodCostP}% mode ${kpis.foodCostMode}`)
console.log()

if (kpis.foodCostP > 60) {
  console.log('⚠ Food cost avril > 60% : signal anormal')
  console.log('  Causes possibles :')
  console.log('  - Inventaire fin de mois plus bas que début (stock consommé)')
  console.log('  - Catégorisation : transactions non-conso classées en "consommations"')
  console.log('  - Bug branche `exact` dans getAnalysesKPIs')
}

console.log()
process.exit(0)
