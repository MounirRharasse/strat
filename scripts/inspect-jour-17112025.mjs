import { readFileSync, existsSync } from 'node:fs'
const envPath = '/Users/mRharasse/strat/.env.local'
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
const KROUSTY = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'
const { supabase } = await import('../lib/supabase.js')

const { data, error } = await supabase
  .from('historique_ca').select('*')
  .eq('parametre_id', KROUSTY).eq('date', '2025-11-17')
console.log(JSON.stringify(error ? { error: error.message } : { rows: data }, null, 2))
process.exit(0)
