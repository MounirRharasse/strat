// Backup JSON pré-Lot 1 étape 5 (création helper lib/data/ventes.js + script CI).
// LECTURE PURE.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
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

const TABLES = ['historique_ca', 'entrees', 'sources', 'ventes_par_source', 'paiements_caisse']
const PAGE_SIZE = 1000
const OUT_PATH = '/Users/mRharasse/Downloads/strat-backup-pre-phase-a-etape-5-lot-1-2026-05-04.json'

async function dumpTable(table) {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table).select('*').range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`[${table}] ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { exists: true, nb_rows: all.length, rows: all }
}

const dump = {
  metadata: {
    date: new Date().toISOString(),
    snapshot_phase: 'pre-phase-a-etape-5-lot-1',
    note: 'Backup avant commit Lot 1 étape 5 : helper lib/data/ventes.js + script CI + comblement trou 03/05',
  },
  tables: {},
}

console.log('Dump pré-Lot 1 étape 5')
console.log('='.repeat(60))
for (const t of TABLES) {
  process.stdout.write(`  ${t.padEnd(22)} ... `)
  const r = await dumpTable(t)
  dump.tables[t] = r
  console.log(`${r.nb_rows} rows`)
}
writeFileSync(OUT_PATH, JSON.stringify(dump, null, 2))
console.log()
console.log('='.repeat(60))
console.log(`✓ Backup écrit : ${OUT_PATH}`)
const totalRows = Object.values(dump.tables).reduce((s, t) => s + (t.nb_rows || 0), 0)
console.log(`  ${totalRows} rows total`)
process.exit(0)
