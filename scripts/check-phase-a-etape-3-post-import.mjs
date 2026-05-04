// Vérifications post-import Phase A étape 3.
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

async function pageAll(table, builder) {
  const all = []
  let from = 0
  const SIZE = 1000
  while (true) {
    const { data, error } = await builder().range(from, from + SIZE - 1)
    if (error) throw new Error(`${table} : ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < SIZE) break
    from += SIZE
  }
  return all
}

console.log('━'.repeat(80))
console.log('  PHASE 6 — VÉRIFICATIONS POST-IMPORT ÉTAPE 3')
console.log('━'.repeat(80))

// ─── 1. Count VPS popina ─────────────────────────────────────────
const { count: vpsPopinaCount } = await supabase
  .from('ventes_par_source').select('*', { count: 'exact', head: true })
  .eq('parametre_id', KROUSTY).eq('source_id', POPINA)
console.log()
console.log(`1. Count VPS popina pour Krousty : ${vpsPopinaCount}`)
console.log(`   Attendu : 744 (272 étape 2 KS2 + 472 étape 3 popina)`)
console.log(`   Verdict : ${vpsPopinaCount === 744 ? '✅' : '❌'}`)

// ─── 2. Count VPS uber_eats ──────────────────────────────────────
const { count: vpsUberCount } = await supabase
  .from('ventes_par_source').select('*', { count: 'exact', head: true })
  .eq('parametre_id', KROUSTY).eq('source_id', UBER)
console.log()
console.log(`2. Count VPS uber_eats pour Krousty : ${vpsUberCount}`)
console.log(`   Attendu : 272 (inchangé jusqu'à étape 3-bis)`)
console.log(`   Verdict : ${vpsUberCount === 272 ? '✅' : '❌'}`)

// ─── 3. Count PC ─────────────────────────────────────────────────
const { count: pcCount } = await supabase
  .from('paiements_caisse').select('*', { count: 'exact', head: true })
  .eq('parametre_id', KROUSTY)
console.log()
console.log(`3. Count PC pour Krousty : ${pcCount}`)
console.log(`   Attendu : 744 (272 étape 2 + 472 étape 3)`)
console.log(`   Verdict : ${pcCount === 744 ? '✅' : '❌'}`)

// ─── 4. Plage VPS popina ─────────────────────────────────────────
const vpsPopinaDates = await pageAll('vps_popina', () => supabase
  .from('ventes_par_source').select('date').eq('parametre_id', KROUSTY).eq('source_id', POPINA)
  .order('date', { ascending: true }))
const dateMin = vpsPopinaDates[0]?.date
const dateMax = vpsPopinaDates[vpsPopinaDates.length - 1]?.date
console.log()
console.log(`4. Plage VPS popina : ${dateMin} → ${dateMax}`)
console.log(`   Attendu : 2024-04-18 → 2026-05-02`)
console.log(`   Verdict : ${dateMin === '2024-04-18' && dateMax === '2026-05-02' ? '✅' : '❌'}`)

// ─── 5. Sum popina TTC sur étape 3 ───────────────────────────────
const vpsPopinaEtape3 = await pageAll('vps_popina_e3', () => supabase
  .from('ventes_par_source').select('montant_ttc, montant_ht')
  .eq('parametre_id', KROUSTY).eq('source_id', POPINA)
  .gte('date', '2025-01-16').lte('date', '2026-05-02'))
const sumTtcE3 = r2(vpsPopinaEtape3.reduce((s, r) => s + Number(r.montant_ttc || 0), 0))
const sumHtE3  = r2(vpsPopinaEtape3.reduce((s, r) => s + Number(r.montant_ht || 0), 0))
console.log()
console.log(`5. Sum popina TTC sur 2025-01-16 → 2026-05-02 : ${sumTtcE3.toFixed(2)} €`)
console.log(`   Attendu : 1 217 711.95 € (= dry-run)`)
console.log(`   Verdict : ${Math.abs(sumTtcE3 - 1217711.95) < 0.01 ? '✅' : '❌'}`)
console.log()
console.log(`6. Sum popina HT  sur 2025-01-16 → 2026-05-02 : ${sumHtE3.toFixed(2)} €`)
console.log(`   Attendu : 1 110 215.84 € (= dry-run)`)
console.log(`   Verdict : ${Math.abs(sumHtE3 - 1110215.84) < 0.01 ? '✅' : '❌'}`)

// ─── 7. Count historique_ca (smoke legacy) ────────────────────────
const { count: hcaCount } = await supabase
  .from('historique_ca').select('*', { count: 'exact', head: true })
  .eq('parametre_id', KROUSTY)
console.log()
console.log(`7. Count historique_ca pour Krousty : ${hcaCount}`)
console.log(`   Attendu : ~488 (peut être +1 si cron a tourné)`)
console.log(`   Verdict : ${hcaCount >= 488 && hcaCount <= 490 ? '✅' : '⚠️ à vérifier'}`)

console.log()
console.log('━'.repeat(80))
process.exit(0)
