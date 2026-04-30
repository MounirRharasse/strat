// Test manuel : génère un vrai brief lundi via Sonnet 4.6 pour Krousty.
//
// Lance avec :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/test-brief.mjs
//
// Charge .env.local automatiquement (ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_*).
// Coût attendu : ~0.005-0.015€ (Sonnet 4.6, ~1500 tokens output max).
// Trace : ligne ia_usage feature='brief' + ligne ia_explications_cache.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as pathResolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = pathResolve(__dirname, '..')

// ─── Charge .env.local ────────────────────────────────────────────────
const envPath = pathResolve(projectRoot, '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY manquante (.env.local)')
  process.exit(1)
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquantes (.env.local)')
  process.exit(1)
}

// ─── Génération ───────────────────────────────────────────────────────
const KROUSTY_ID = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'
const SEMAINE_ISO = '2026-W17'

const { genererBriefSemaine } = await import('../lib/ia-brief.js')
const { parseSemaineISO } = await import('../lib/ia/brief-inputs.js')

const periode = parseSemaineISO(SEMAINE_ISO)
const t0 = Date.now()
const r = await genererBriefSemaine({ parametre_id: KROUSTY_ID, semaine_iso: SEMAINE_ISO })
const dureeMs = Date.now() - t0
const dureeS = (dureeMs / 1000).toFixed(2)

const sep = '═'.repeat(60)
const sub = '─'.repeat(60)

console.log()
if (r.error) {
  console.log(sep)
  console.log(`ERREUR — Brief ${SEMAINE_ISO}`)
  console.log(sep)
  console.log(JSON.stringify(r, null, 2))
  console.log(sub)
  console.log(`Durée : ${dureeS}s`)
  console.log(sep)
  process.exit(2)
}

console.log(sep)
console.log(`BRIEF SEMAINE ${SEMAINE_ISO} (${periode.label_humain})`)
console.log(sep)
console.log()
console.log(r.contenu)
console.log()
console.log(sub)
console.log(
  `Coût : ${r.cout_eur.toFixed(5)} € | Tokens : ${r.tokens_input}/${r.tokens_output}` +
  ` | Durée : ${dureeS}s | Modèle : claude-sonnet-4-6`
)
console.log(sep)

process.exit(0)
