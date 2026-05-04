// Vérifications post-import Phase A étape 3-bis (Uber Eats).
// LECTURE PURE — aucune écriture.

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

const { supabase } = await import('../lib/supabase.js')

const KROUSTY = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'
const POPINA  = 'a4e92432-7d3c-4b3f-aafb-745d19e6b2f8'
const UBER    = '888b047c-54d9-4c05-a364-5e1a9c6a9409'

const r2 = n => Math.round(n * 100) / 100

async function pageAll(builder) {
  const all = []
  let from = 0
  const SIZE = 1000
  while (true) {
    const { data, error } = await builder().range(from, from + SIZE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < SIZE) break
    from += SIZE
  }
  return all
}

console.log('━'.repeat(80))
console.log('  PHASE 5 — VÉRIFICATIONS POST-IMPORT ÉTAPE 3-BIS')
console.log('━'.repeat(80))

const { count: vpsUberCount } = await supabase
  .from('ventes_par_source').select('*', { count: 'exact', head: true })
  .eq('parametre_id', KROUSTY).eq('source_id', UBER)
console.log()
console.log(`1. Count VPS uber_eats Krousty : ${vpsUberCount}`)
console.log(`   Attendu : 744 (272 étape 2 + 472 étape 3-bis)`)
console.log(`   Verdict : ${vpsUberCount === 744 ? '✅' : '❌'}`)

const { count: vpsPopinaCount } = await supabase
  .from('ventes_par_source').select('*', { count: 'exact', head: true })
  .eq('parametre_id', KROUSTY).eq('source_id', POPINA)
console.log()
console.log(`2. Count VPS popina Krousty : ${vpsPopinaCount}`)
console.log(`   Attendu : 744 (inchangé)`)
console.log(`   Verdict : ${vpsPopinaCount === 744 ? '✅' : '❌'}`)

const { count: pcCount } = await supabase
  .from('paiements_caisse').select('*', { count: 'exact', head: true })
  .eq('parametre_id', KROUSTY)
console.log()
console.log(`3. Count PC Krousty : ${pcCount}`)
console.log(`   Attendu : 744 (inchangé)`)
console.log(`   Verdict : ${pcCount === 744 ? '✅' : '❌'}`)

const vpsUberDates = await pageAll(() => supabase
  .from('ventes_par_source').select('date').eq('parametre_id', KROUSTY).eq('source_id', UBER)
  .order('date', { ascending: true }))
const dateMin = vpsUberDates[0]?.date
const dateMax = vpsUberDates[vpsUberDates.length - 1]?.date
console.log()
console.log(`4. Plage VPS uber_eats : ${dateMin} → ${dateMax}`)
console.log(`   Attendu : 2024-04-18 → 2026-05-02`)
console.log(`   Verdict : ${dateMin === '2024-04-18' && dateMax === '2026-05-02' ? '✅' : '❌'}`)

const vpsUberE3bis = await pageAll(() => supabase
  .from('ventes_par_source').select('montant_ttc, nb_commandes')
  .eq('parametre_id', KROUSTY).eq('source_id', UBER)
  .gte('date', '2025-01-16').lte('date', '2026-05-02'))
const sumTtcE3bis = r2(vpsUberE3bis.reduce((s, r) => s + Number(r.montant_ttc || 0), 0))
const nbWithCmd = vpsUberE3bis.filter(r => r.nb_commandes != null).length
const nbNullCmd = vpsUberE3bis.filter(r => r.nb_commandes == null).length
console.log()
console.log(`5. Sum montant_ttc uber_eats sur 2025-01-16 → 2026-05-02 : ${sumTtcE3bis.toFixed(2)} €`)
console.log(`   Attendu : 1 406 254.58 € (= dry-run)`)
console.log(`   Verdict : ${Math.abs(sumTtcE3bis - 1406254.58) < 0.05 ? '✅' : '❌'}`)
console.log()
console.log(`   Distribution nb_commandes : renseigné=${nbWithCmd}, NULL=${nbNullCmd} (total ${vpsUberE3bis.length})`)
console.log(`   Attendu : renseigné=336, NULL=136`)
console.log(`   Verdict : ${nbWithCmd === 336 && nbNullCmd === 136 ? '✅' : '❌'}`)

const { count: hcaCount } = await supabase
  .from('historique_ca').select('*', { count: 'exact', head: true })
  .eq('parametre_id', KROUSTY)
console.log()
console.log(`6. Count historique_ca Krousty : ${hcaCount}`)
console.log(`   Attendu : 488 (inchangé)`)
console.log(`   Verdict : ${hcaCount === 488 ? '✅' : '⚠️ vérifier'}`)

console.log()
console.log('━'.repeat(80))
process.exit(0)
