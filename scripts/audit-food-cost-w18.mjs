// Audit food_cost W18 (28 avril → 4 mai 2026, en cours).
// Le chat a retourné 124,55% en mode estimé — vérifier réalité vs bug.

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
const SINCE = '2026-04-27' // lundi W18
const UNTIL = '2026-05-03' // dimanche W18 (full)

const { supabase } = await import('../lib/supabase.js')
const { getAnalysesKPIs } = await import('../lib/data/analyses-kpis.js')
const { TVA_UBER_EATS } = await import('../lib/data/constants.js')

const sep = '═'.repeat(72)
const sub = '─'.repeat(72)

console.log()
console.log(sep)
console.log(`AUDIT food_cost W18 (${SINCE} → ${UNTIL}, semaine en cours)`)
console.log(sep)

// ─── 1. Données brutes par jour ───────────────────────────────────────
const { data: hist } = await supabase
  .from('historique_ca')
  .select('date, ca_brut, ca_ht, uber, nb_commandes')
  .eq('parametre_id', KROUSTY)
  .gte('date', SINCE).lte('date', UNTIL)
  .order('date', { ascending: true })

const { data: entrees } = await supabase
  .from('entrees')
  .select('date, source, montant_ttc')
  .eq('parametre_id', KROUSTY)
  .eq('source', 'uber_eats')
  .gte('date', SINCE).lte('date', UNTIL)

const { data: trans } = await supabase
  .from('transactions')
  .select('date, fournisseur_nom, montant_ttc, montant_ht, categorie_pl, sous_categorie')
  .eq('parametre_id', KROUSTY)
  .gte('date', SINCE).lte('date', UNTIL)
  .order('montant_ht', { ascending: false })

console.log()
console.log('CA W18 — par jour')
console.log(sub)
console.log('date       | ca_brut    | ca_ht      | uber       | entrees uber')
console.log(sub)
for (const r of hist || []) {
  const e = (entrees || []).filter(x => x.date === r.date).reduce((s, x) => s + (x.montant_ttc || 0), 0)
  console.log(`${r.date} | ${(r.ca_brut || 0).toFixed(2).padStart(10)} | ${(r.ca_ht || 0).toFixed(2).padStart(10)} | ${(r.uber || 0).toFixed(2).padStart(10)} | ${e.toFixed(2).padStart(11)}`)
}
const ca_brut_hist = (hist || []).reduce((s, r) => s + (r.ca_brut || 0), 0)
const ca_ht_hist = (hist || []).reduce((s, r) => s + (r.ca_ht || 0), 0)
const uber_hist = (hist || []).reduce((s, r) => s + (r.uber || 0), 0)
const uber_entrees = (entrees || []).reduce((s, e) => s + (e.montant_ttc || 0), 0)
const ca_total_ht = ca_ht_hist + (uber_hist + uber_entrees) / TVA_UBER_EATS

console.log(sub)
console.log(`SUM ca_brut historique_ca  : ${ca_brut_hist.toFixed(2)} €`)
console.log(`SUM ca_ht historique_ca    : ${ca_ht_hist.toFixed(2)} €`)
console.log(`SUM uber historique_ca     : ${uber_hist.toFixed(2)} €`)
console.log(`SUM entrees uber_eats TTC  : ${uber_entrees.toFixed(2)} €`)
console.log(`CA HT total (avec Uber HT) : ${ca_total_ht.toFixed(2)} €`)

// ─── 2. Consommations W18 ────────────────────────────────────────────
console.log()
console.log('TRANSACTIONS consommations W18')
console.log(sub)
const conso = (trans || []).filter(t => t.categorie_pl === 'consommations')
console.log(`Nb transactions : ${conso.length}`)
let consoHT = 0, consoTTC = 0
for (const t of conso.slice(0, 15)) {
  consoHT += (t.montant_ht || 0)
  consoTTC += (t.montant_ttc || 0)
  const fn = (t.fournisseur_nom || '-').padEnd(28).slice(0, 28)
  console.log(`${t.date} | ${fn} | ht=${(t.montant_ht || 0).toFixed(2).padStart(8)} | ttc=${(t.montant_ttc || 0).toFixed(2).padStart(8)}`)
}
const totalConsoHT = conso.reduce((s, t) => s + (t.montant_ht || 0), 0)
const totalConsoTTC = conso.reduce((s, t) => s + (t.montant_ttc || 0), 0)
console.log(sub)
console.log(`Total HT consommations  : ${totalConsoHT.toFixed(2)} €`)
console.log(`Total TTC consommations : ${totalConsoTTC.toFixed(2)} €`)

// ─── 3. Calculs food cost manuel ─────────────────────────────────────
const fcManuelHT = ca_total_ht > 0 ? (totalConsoHT / ca_total_ht) * 100 : 0
const fcSansUber = ca_ht_hist > 0 ? (totalConsoHT / ca_ht_hist) * 100 : 0

console.log()
console.log('FOOD COST CALCULÉ MANUELLEMENT')
console.log(sub)
console.log(`HT/CA HT (avec Uber HT)   : ${fcManuelHT.toFixed(2)}% ← reference correcte`)
console.log(`HT/CA HT (sans Uber HT)   : ${fcSansUber.toFixed(2)}% ← bug si appliqué`)

// ─── 4. getAnalysesKPIs (ce que le chat a vu) ────────────────────────
const { data: parametres } = await supabase
  .from('parametres').select('*').eq('id', KROUSTY).single()

const kpis = await getAnalysesKPIs({
  parametre_id: KROUSTY, since: SINCE, until: UNTIL, parametres
})

console.log()
console.log('VS getAnalysesKPIs')
console.log(sub)
console.log(`foodCostP retourné : ${kpis.foodCostP}%`)
console.log(`foodCostMode       : ${kpis.foodCostMode}`)
console.log(`ca.brut            : ${kpis.ca?.brut} €`)
console.log(`ca.ht              : ${kpis.ca?.ht} €`)
console.log(`consommations      : ${kpis.consommations} €`)

// ─── 5. Diagnostic ────────────────────────────────────────────────────
console.log()
console.log('DIAGNOSTIC')
console.log(sep)

const aujourdhui = new Date().toISOString().slice(0, 10)
const joursCompletes = (hist || []).filter(r => r.date < aujourdhui).length
const joursTotal = 7
console.log(`Jours complétés dans W18 : ${joursCompletes}/${joursTotal} (today=${aujourdhui})`)

if (Math.abs((kpis.foodCostP || 0) - fcManuelHT) < 1) {
  console.log(`✓ getAnalysesKPIs cohérent avec calcul manuel (~${fcManuelHT.toFixed(1)}%)`)
} else {
  console.log(`✗ DIVERGENCE : getAnalysesKPIs ${kpis.foodCostP}% vs manuel ${fcManuelHT.toFixed(2)}%`)
}

console.log()
if (fcManuelHT > 100) {
  console.log('CAUSE : conso > CA, plausible si :')
  console.log('  - achats massifs en début de semaine non encore "consommés"')
  console.log('  - semaine en cours, données partielles')
  console.log('  - gros achat de stock anticipé')
} else if (kpis.foodCostP > 100) {
  console.log('✗ BUG : getAnalysesKPIs retourne > 100% mais le calcul manuel correct est < 100%')
  console.log('  → investigation requise dans getAnalysesKPIs')
}

console.log()
process.exit(0)
