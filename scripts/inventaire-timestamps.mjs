// Pour chaque table connue, récupère 1 row et liste les colonnes timestamp probables.
// Les tables sont identifiées via :
//   - migrations CREATE TABLE (6 récentes)
//   - migrations ALTER TABLE (10 préexistantes)

import { readFileSync, existsSync } from 'node:fs'
const envPath = '/Users/mRharasse/strat/.env.local'
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
const { supabase } = await import('../lib/supabase.js')

const tables = [
  'admins', 'amplitude_horaire', 'audits_ignores', 'entrees', 'fournisseurs',
  'historique_ca', 'ia_explications_cache', 'ia_memoire', 'ia_signaux', 'ia_usage',
  'import_mappings', 'inventaires', 'parametres', 'transactions', 'uber_orders',
]

const candidates = ['created_at', 'cree_le', 'date_creation', 'created', 'inserted_at', 'createdAt']
const out = []
for (const t of tables) {
  const { data, error } = await supabase.from(t).select('*').limit(1)
  if (error) { out.push({ table: t, error: error.message }); continue }
  if (!data || data.length === 0) { out.push({ table: t, vide: true, colonne_timestamp_creation: '— (table vide)' }); continue }
  const cols = Object.keys(data[0])
  const found = candidates.filter(c => cols.includes(c))
  out.push({ table: t, colonne_timestamp_creation: found.length > 0 ? found.join(', ') : '—', toutes_colonnes: cols })
}
console.log(JSON.stringify(out, null, 2))
process.exit(0)
