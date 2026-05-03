// Inspection lecture seule de la table `entrees` pour Krousty.
// Reproduit en JS (Supabase JS ne supporte pas GROUP BY direct) :
//   SELECT source, categorie, COUNT(*), MIN(date), MAX(date), SUM(montant_ttc)
//   FROM entrees
//   WHERE parametre_id = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'
//   GROUP BY source, categorie
//   ORDER BY nb_lignes DESC;

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
const { supabase } = await import('../lib/supabase.js')

const { data, error } = await supabase
  .from('entrees')
  .select('source, categorie, date, montant_ttc')
  .eq('parametre_id', KROUSTY)

if (error) {
  console.error(JSON.stringify({ error: error.message }, null, 2))
  process.exit(1)
}

const groupes = {}
for (const r of data || []) {
  const key = `${r.source ?? '(null)'}||${r.categorie ?? '(null)'}`
  if (!groupes[key]) {
    groupes[key] = {
      source: r.source ?? null,
      categorie: r.categorie ?? null,
      nb_lignes: 0,
      date_min: r.date,
      date_max: r.date,
      total_ttc: 0,
    }
  }
  const g = groupes[key]
  g.nb_lignes++
  if (r.date < g.date_min) g.date_min = r.date
  if (r.date > g.date_max) g.date_max = r.date
  g.total_ttc += (r.montant_ttc || 0)
}

const rows = Object.values(groupes)
  .map(g => ({ ...g, total_ttc: Math.round(g.total_ttc * 100) / 100 }))
  .sort((a, b) => b.nb_lignes - a.nb_lignes)

console.log(JSON.stringify({ nb_groupes: rows.length, total_lignes: data?.length || 0, rows }, null, 2))
process.exit(0)
