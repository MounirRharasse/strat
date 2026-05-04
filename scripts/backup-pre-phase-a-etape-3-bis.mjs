// Backup JSON local pré-import Phase A étape 3-bis (backfill Uber Eats).
// LECTURE PURE — aucune écriture nulle part.
//
// Tables à dumper :
//   - historique_ca, entrees (legacy non touchés mais backupés par défense en profondeur)
//   - sources (devrait avoir 2 rows seed Krousty)
//   - ventes_par_source (devrait avoir 1016 rows post-étape 3 popina)
//   - paiements_caisse (devrait avoir 744 rows post-étape 3)
//
// Sortie :
//   /Users/mRharasse/Downloads/strat-backup-pre-phase-a-etape-3-bis-2026-05-04.json

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
const OUT_PATH = '/Users/mRharasse/Downloads/strat-backup-pre-phase-a-etape-3-bis-2026-05-04.json'

async function dumpTable(table) {
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table).select('*').range(from, from + PAGE_SIZE - 1)
    if (error) {
      const msg = String(error.message || '')
      const code = String(error.code || '')
      const isMissing =
        code === '42P01' || code === 'PGRST205' ||
        msg.includes('does not exist') || msg.includes('Could not find the table') ||
        (msg.includes('relation') && msg.includes('not exist'))
      if (isMissing) return { exists: false, nb_rows: 0, rows: [], note: 'table inexistante' }
      throw new Error(`[${table}] ${code} — ${msg}`)
    }
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
    snapshot_phase: 'pre-phase-a-etape-3-bis',
    note: 'Backup avant backfill Uber Eats (16/01/2025 → 02/05/2026) vers ventes_par_source.uber_eats',
  },
  tables: {},
}

console.log('Dump pré-import Phase A étape 3-bis')
console.log('='.repeat(60))

for (const t of TABLES) {
  process.stdout.write(`  ${t.padEnd(22)} ... `)
  try {
    const r = await dumpTable(t)
    dump.tables[t] = r
    console.log(r.exists ? `${r.nb_rows} rows` : '(inexistante)')
  } catch (e) {
    console.log(`ERREUR : ${e.message}`)
    dump.tables[t] = { exists: 'unknown', nb_rows: 0, rows: [], error: e.message }
  }
}

writeFileSync(OUT_PATH, JSON.stringify(dump, null, 2))
console.log()
console.log('='.repeat(60))
console.log(`✓ Backup écrit : ${OUT_PATH}`)
const totalRows = Object.values(dump.tables).reduce((s, t) => s + (t.nb_rows || 0), 0)
console.log(`  ${totalRows} rows total`)
process.exit(0)
