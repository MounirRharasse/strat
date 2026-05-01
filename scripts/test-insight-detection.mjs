// Test manuel : lance detecterInsightDuJour sur 1 jour ou une plage de jours.
// Lance avec :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/test-insight-detection.mjs YYYY-MM-DD
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/test-insight-detection.mjs YYYY-MM-DD YYYY-MM-DD
//
// Affiche un tableau résumé puis le contexte JSON détaillé pour chaque
// jour ayant un trigger actif.

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

const args = process.argv.slice(2)
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

if (args.length === 0 || !DATE_REGEX.test(args[0])) {
  console.error('Usage : test-insight-detection.mjs YYYY-MM-DD [YYYY-MM-DD]')
  process.exit(1)
}
const since = args[0]
const until = args[1] && DATE_REGEX.test(args[1]) ? args[1] : args[0]

if (since > until) {
  console.error(`Erreur : ${since} > ${until}`)
  process.exit(1)
}

const KROUSTY_ID = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'

const { detecterInsightDuJour } = await import('../lib/ia/insight-detection.js')
const { supabase } = await import('../lib/supabase.js')

// ─── Pré-check : lignes ia_signaux existantes dans la plage ──────────
const { count: existing } = await supabase
  .from('ia_signaux')
  .select('id', { count: 'exact', head: true })
  .eq('parametre_id', KROUSTY_ID)
  .gte('date_detection', since)
  .lte('date_detection', until)

if (existing && existing > 0) {
  console.error()
  console.error(`⚠️  ${existing} ligne(s) ia_signaux déjà présente(s) pour Krousty entre ${since} et ${until}.`)
  console.error('    Le script va échouer sur la contrainte UNIQUE(parametre_id, date_detection).')
  console.error('    Purge d\'abord via Supabase Studio :')
  console.error()
  console.error(`DELETE FROM ia_signaux`)
  console.error(`WHERE parametre_id = '${KROUSTY_ID}'`)
  console.error(`AND date_detection BETWEEN '${since}' AND '${until}';`)
  console.error()
  process.exit(1)
}

// Liste des dates
const jours = []
const debut = new Date(since + 'T12:00:00Z')
const fin = new Date(until + 'T12:00:00Z')
for (let d = new Date(debut); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
  jours.push(d.toISOString().split('T')[0])
}

console.log()
console.log(`Test detecterInsightDuJour pour ${KROUSTY_ID}`)
console.log(`Range : ${since} → ${until} (${jours.length} jour${jours.length > 1 ? 's' : ''})`)
console.log()

// ─── Boucle évaluation + INSERT live (simule cron commit 6) ──────────
const resultats = []
let nbInserts = 0
for (const date of jours) {
  process.stdout.write(`${date} ... `)
  try {
    const r = await detecterInsightDuJour({ parametre_id: KROUSTY_ID, date_ref: date })
    resultats.push({ date, trigger: r })
    if (r) {
      // INSERT immédiat pour que le cooldown du jour suivant le voie.
      const { error: errIns } = await supabase.from('ia_signaux').insert({
        parametre_id: KROUSTY_ID,
        date_detection: date,
        type_trigger: r.type_trigger,
        tier: r.tier,
        magnitude: r.magnitude,
        contexte: r.contexte
      })
      if (errIns) {
        console.log(`✓ détecté mais ✗ INSERT : ${errIns.message}`)
      } else {
        nbInserts++
        const sgn = r.contexte?.unite === 'pct' && r.contexte?.variation_pct < 0 ? '-' : '+'
        const u = r.contexte?.unite === 'pts' ? 'pts' : r.contexte?.unite === 'eur' ? '€' : '%'
        console.log(`✓ ${r.type_trigger.padEnd(20)} ${r.tier} ${sgn}${r.magnitude}${u}`)
      }
    } else {
      console.log('∅')
    }
  } catch (e) {
    resultats.push({ date, error: e.message })
    console.log(`✗ ${e.message}`)
  }
}

// ─── Tableau résumé ───────────────────────────────────────────────────
const sep = '═'.repeat(72)
const sub = '─'.repeat(72)

console.log()
console.log(sep)
console.log('RÉSUMÉ')
console.log(sep)
console.log('Date       | Type trigger        | Tier | Magnitude')
console.log(sub)
for (const r of resultats) {
  const date = r.date
  if (r.error) {
    console.log(`${date} | ERREUR              | -    | ${r.error.slice(0, 40)}`)
    continue
  }
  if (!r.trigger) {
    console.log(`${date} | -                   | -    | -`)
    continue
  }
  const t = r.trigger
  const u = t.contexte?.unite === 'pts' ? 'pts' : t.contexte?.unite === 'eur' ? '€' : '%'
  const sgn = t.contexte?.variation_pct < 0 ? '-' : '+'
  const mag = `${sgn}${t.magnitude}${u}`
  console.log(
    `${date} | ${t.type_trigger.padEnd(20)} | ${t.tier.padEnd(4)} | ${mag}`
  )
}

// ─── Détail JSON par trigger actif ────────────────────────────────────
const avecTrigger = resultats.filter(r => r.trigger)
if (avecTrigger.length > 0) {
  console.log()
  console.log(sep)
  console.log('CONTEXTES DÉTAILLÉS')
  console.log(sep)
  for (const r of avecTrigger) {
    console.log()
    console.log(`▶ ${r.date} — ${r.trigger.type_trigger} (${r.trigger.tier})`)
    console.log(sub)
    console.log(JSON.stringify(r.trigger.contexte, null, 2))
  }
}

// ─── Stats globales ───────────────────────────────────────────────────
console.log()
console.log(sep)
const nbActifs = avecTrigger.length
const nbVides = resultats.filter(r => !r.trigger && !r.error).length
const nbErreurs = resultats.filter(r => r.error).length
const tauxActif = ((nbActifs / jours.length) * 100).toFixed(0)
console.log(`STATS : ${nbActifs} jour(s) avec trigger / ${nbVides} sans / ${nbErreurs} erreur(s)`)
console.log(`        Taux d'activation : ${tauxActif}%`)

// Distribution par type
const parType = {}
for (const r of avecTrigger) {
  parType[r.trigger.type_trigger] = (parType[r.trigger.type_trigger] || 0) + 1
}
if (Object.keys(parType).length > 0) {
  console.log()
  console.log('Distribution par trigger :')
  for (const [k, n] of Object.entries(parType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} : ${n} jour(s)`)
  }
}
console.log(sep)

// ─── Purge SQL prête à copier-coller ──────────────────────────────────
if (nbInserts > 0) {
  console.log()
  console.log(`${nbInserts} ligne(s) ia_signaux insérée(s) pendant ce run.`)
  console.log('Pour purger après audit dans Supabase Studio :')
  console.log()
  console.log(`DELETE FROM ia_signaux`)
  console.log(`WHERE parametre_id = '${KROUSTY_ID}'`)
  console.log(`AND date_detection BETWEEN '${since}' AND '${until}';`)
  console.log()
}

process.exit(0)
