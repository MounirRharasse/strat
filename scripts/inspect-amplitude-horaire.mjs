// Lecture seule : DISTINCT canal + COUNT sur amplitude_horaire pour Krousty.
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

// On lit avec pagination car amplitude_horaire peut dépasser 1000 rows
async function fetchAll() {
  const out = []
  let from = 0
  const size = 1000
  while (true) {
    const { data, error } = await supabase
      .from('amplitude_horaire').select('canal')
      .eq('parametre_id', KROUSTY).range(from, from + size - 1)
    if (error) return { error: error.message }
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < size) break
    from += size
  }
  return { data: out }
}

const { data, error } = await fetchAll()
if (error) {
  console.log(JSON.stringify({ error }, null, 2))
  process.exit(1)
}

const counts = {}
for (const r of data) {
  const k = r.canal ?? '(null)'
  counts[k] = (counts[k] || 0) + 1
}
const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([canal, count]) => ({ canal, count }))
console.log(JSON.stringify({ total_lignes: data.length, par_canal: rows }, null, 2))
process.exit(0)
