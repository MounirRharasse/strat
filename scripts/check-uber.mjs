// Investigation : pourquoi Uber Eats à 0 € les 20, 21, 22 avril 2026 ?
// Lance avec :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/check-uber.mjs

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

// Periode : sem-1 (du 13 au 26 avril) pour avoir le contexte avant/après
const SINCE = '2026-04-13'
const UNTIL = '2026-04-26'

console.log()
console.log(`Investigation Uber Eats du ${SINCE} au ${UNTIL}`)
console.log('═'.repeat(80))

// ─── Source 1 : historique_ca ─────────────────────────────────────────
const { data: hist } = await supabase
  .from('historique_ca')
  .select('date, ca_brut, uber, nb_commandes, commission_uber')
  .eq('parametre_id', KROUSTY_ID)
  .gte('date', SINCE)
  .lte('date', UNTIL)
  .order('date', { ascending: true })

console.log()
console.log('SOURCE 1 — historique_ca')
console.log('─'.repeat(80))
console.log('date         | ca_brut    | uber       | nb_cmd | commission')
console.log('─'.repeat(80))
for (const r of hist || []) {
  const d = r.date
  const ca = String((r.ca_brut || 0).toFixed(2)).padStart(10)
  const ub = String((r.uber || 0).toFixed(2)).padStart(10)
  const nb = String(r.nb_commandes ?? '-').padStart(6)
  const co = String((r.commission_uber || 0).toFixed(2)).padStart(10)
  console.log(`${d} | ${ca} | ${ub} | ${nb} | ${co}`)
}

// ─── Source 2 : entrees source='uber_eats' ────────────────────────────
const { data: entrees } = await supabase
  .from('entrees')
  .select('date, source, montant_ttc, nb_commandes, created_at')
  .eq('parametre_id', KROUSTY_ID)
  .eq('source', 'uber_eats')
  .gte('date', SINCE)
  .lte('date', UNTIL)
  .order('date', { ascending: true })

console.log()
console.log('SOURCE 2 — entrees (source=uber_eats, saisie FAB)')
console.log('─'.repeat(80))
if ((entrees || []).length === 0) {
  console.log('Aucune entrée FAB sur cette période.')
} else {
  console.log('date         | montant_ttc | nb_cmd | created_at')
  console.log('─'.repeat(80))
  for (const e of entrees) {
    const m = String((e.montant_ttc || 0).toFixed(2)).padStart(11)
    const nb = String(e.nb_commandes ?? '-').padStart(6)
    console.log(`${e.date} | ${m} | ${nb} | ${e.created_at}`)
  }
}

// ─── Source 3 : entrees autres sources sur ces dates ───────────────────
const { data: entreesAutres } = await supabase
  .from('entrees')
  .select('date, source, montant_ttc, nb_commandes')
  .eq('parametre_id', KROUSTY_ID)
  .gte('date', SINCE)
  .lte('date', UNTIL)
  .neq('source', 'uber_eats')
  .order('date', { ascending: true })

console.log()
console.log('SOURCE 3 — entrees (autres sources, pour info)')
console.log('─'.repeat(80))
if ((entreesAutres || []).length === 0) {
  console.log('Aucune autre entrée sur cette période.')
} else {
  for (const e of entreesAutres) {
    console.log(`${e.date} | source=${e.source} | ${e.montant_ttc} € | ${e.nb_commandes ?? '-'} cmd`)
  }
}

// ─── Diagnostic ────────────────────────────────────────────────────────
console.log()
console.log('DIAGNOSTIC')
console.log('═'.repeat(80))

const dates3jours = ['2026-04-20', '2026-04-21', '2026-04-22']
for (const d of dates3jours) {
  const histRow = (hist || []).find(h => h.date === d)
  const entrRow = (entrees || []).find(e => e.date === d)
  const total = (histRow?.uber || 0) + (entrRow?.montant_ttc || 0)
  console.log(`${d} : historique_ca.uber=${histRow?.uber ?? '∅'}, entrees=${entrRow?.montant_ttc ?? '∅'}, TOTAL=${total} €`)
}

// Comparaison : qu'est-ce qui se passe le 18, 19, 23, 24, 25, 26 avril ?
console.log()
console.log('Pour contexte (jours encadrants) :')
const datesContexte = ['2026-04-18', '2026-04-19', '2026-04-23', '2026-04-24', '2026-04-25', '2026-04-26']
for (const d of datesContexte) {
  const histRow = (hist || []).find(h => h.date === d)
  const entrRow = (entrees || []).find(e => e.date === d)
  const total = (histRow?.uber || 0) + (entrRow?.montant_ttc || 0)
  console.log(`${d} : historique_ca.uber=${histRow?.uber ?? '∅'}, entrees=${entrRow?.montant_ttc ?? '∅'}, TOTAL=${total} €`)
}

console.log()
process.exit(0)
