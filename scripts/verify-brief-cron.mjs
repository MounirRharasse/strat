// Vérifie que le cron lundi 06:00 UTC a bien généré le brief de la
// semaine précédente. Lit le cache + ia_usage des dernières 24h.
//
// Pas d'appel Anthropic, lecture seule.
//
// Lance avec :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/verify-brief-cron.mjs

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
const { getSemainePrecedente } = await import('../lib/ia/brief-inputs.js')

const semaine_iso = getSemainePrecedente()
const sep = '═'.repeat(60)

console.log()
console.log(sep)
console.log(`VÉRIFICATION CRON BRIEF — semaine ${semaine_iso}`)
console.log(sep)

// 1. Cache : ligne ia_explications_cache existe-t-elle ?
const { data: cache, error: cacheErr } = await supabase
  .from('ia_explications_cache')
  .select('contenu, modele, tokens_input, tokens_output, cout_estime_eur, created_at, expires_at, metadata')
  .eq('parametre_id', KROUSTY_ID)
  .eq('indicateur', 'brief_semaine')
  .eq('cle', semaine_iso)
  .maybeSingle()

if (cacheErr) {
  console.log()
  console.log(`✗ Erreur lecture cache : ${cacheErr.message}`)
  process.exit(1)
}

if (!cache) {
  console.log()
  console.log(`✗ AUCUN BRIEF EN CACHE pour ${semaine_iso}`)
  console.log('  → Le cron n\'a pas tourné OU il a échoué OU la ligne a été supprimée.')
} else {
  console.log()
  console.log(`✓ Brief en cache pour ${semaine_iso}`)
  console.log(`  Généré le      : ${cache.created_at}`)
  console.log(`  Expire le      : ${cache.expires_at}`)
  console.log(`  Modèle         : ${cache.modele}`)
  console.log(`  Tokens         : ${cache.tokens_input} / ${cache.tokens_output}`)
  console.log(`  Coût           : ${Number(cache.cout_estime_eur).toFixed(5)} €`)
  if (cache.metadata) {
    console.log(`  Période        : ${cache.metadata.periode_since} → ${cache.metadata.periode_until}`)
    console.log(`  CA brut sem    : ${cache.metadata.ca_brut} €`)
  }
  console.log()
  console.log('─'.repeat(60))
  console.log('CONTENU')
  console.log('─'.repeat(60))
  console.log(cache.contenu)
  console.log('─'.repeat(60))
}

// 2. ia_usage : trace de l'appel Sonnet dans les dernières 36h
const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString()
const { data: usage } = await supabase
  .from('ia_usage')
  .select('feature, modele, tokens_input, tokens_output, cout_estime_eur, succes, erreur, created_at')
  .eq('parametre_id', KROUSTY_ID)
  .eq('feature', 'brief')
  .gte('created_at', since)
  .order('created_at', { ascending: false })

console.log()
console.log(`TRACES ia_usage (feature='brief', dernières 36h)`)
console.log('─'.repeat(60))
if (!usage || usage.length === 0) {
  console.log('✗ Aucune trace d\'appel brief dans les dernières 36h.')
  console.log('  → Le cron n\'a pas exécuté callClaude pour ce parametre_id.')
} else {
  for (const u of usage) {
    const s = u.succes ? '✓' : '✗'
    const cout = Number(u.cout_estime_eur).toFixed(5)
    console.log(`${s} ${u.created_at} | ${u.modele} | ${u.tokens_input}/${u.tokens_output} | ${cout} €${u.erreur ? ' | err: ' + u.erreur.slice(0, 80) : ''}`)
  }
}

console.log()
console.log(sep)
process.exit(0)
