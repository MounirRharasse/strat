// Audit drop_ca : compare CA réel du 23 avril vs 4 jeudis précédents.
// Lance avec :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/audit-drop-ca.mjs

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

async function caJour(date) {
  const [{ data: hist }, { data: entrees }] = await Promise.all([
    supabase.from('historique_ca')
      .select('ca_brut, uber, ca_ht, nb_commandes')
      .eq('parametre_id', KROUSTY).eq('date', date),
    supabase.from('entrees')
      .select('montant_ttc')
      .eq('parametre_id', KROUSTY).eq('date', date).eq('source', 'uber_eats')
  ])
  const histRow = (hist || [])[0] || {}
  const ca_brut = histRow.ca_brut || 0
  const uber_hist = histRow.uber || 0
  const uber_entrees = (entrees || []).reduce((s, e) => s + (e.montant_ttc || 0), 0)
  return {
    date,
    ca_brut,
    uber_hist,
    uber_entrees,
    total: ca_brut + uber_hist + uber_entrees,
    nb_commandes: histRow.nb_commandes || null
  }
}

const sep = '═'.repeat(72)
const sub = '─'.repeat(72)

console.log()
console.log(sep)
console.log('AUDIT 1 — drop_ca du 23 avril 2026')
console.log(sep)

// 23 avril (jeudi cible) + 4 jeudis précédents
const cible = await caJour('2026-04-23')
const jeudis = [
  await caJour('2026-04-16'),
  await caJour('2026-04-09'),
  await caJour('2026-04-02'),
  await caJour('2026-03-26')
]

console.log()
console.log('Jeudi cible + 4 jeudis précédents (= baseline)')
console.log(sub)
console.log('date       | ca_brut    | uber_hist | uber_entrees | TOTAL      | nb_cmd')
console.log(sub)
const fmt = (x, n = 10) => String((x ?? 0).toFixed(2)).padStart(n)
const ligne = (j) =>
  `${j.date} | ${fmt(j.ca_brut)} | ${fmt(j.uber_hist, 9)} | ${fmt(j.uber_entrees, 12)} | ${fmt(j.total)} | ${String(j.nb_commandes ?? '-').padStart(6)}`
console.log('★ ' + ligne(cible).slice(2))
for (const j of jeudis) console.log('  ' + ligne(j).slice(2))

const moyJeudisReels = jeudis.reduce((s, j) => s + j.total, 0) / jeudis.length
const variationReelle = ((cible.total - moyJeudisReels) / moyJeudisReels) * 100

console.log()
console.log('CALCUL RÉEL')
console.log(sub)
console.log(`Total 23 avril       : ${cible.total.toFixed(2)} €`)
console.log(`Moyenne 4 jeudis     : ${moyJeudisReels.toFixed(2)} €`)
console.log(`Delta                : ${(cible.total - moyJeudisReels).toFixed(2)} €`)
console.log(`Variation            : ${variationReelle.toFixed(2)} %`)

console.log()
console.log('VS DÉTECTION')
console.log(sub)
console.log('Détection a affiché  : ca_jour=3400.30, moyenne_dow=7627.95, variation=-55.42%')
console.log(`Réel calculé ici     : ca_jour=${cible.total.toFixed(2)}, moyenne_dow=${moyJeudisReels.toFixed(2)}, variation=${variationReelle.toFixed(2)}%`)

const deltaCA = Math.abs(cible.total - 3400.30)
const deltaMoy = Math.abs(moyJeudisReels - 7627.95)
console.log()
if (deltaCA < 1 && deltaMoy < 1) {
  console.log('✓ Calcul détection cohérent avec données réelles → vrai signal métier')
} else {
  console.log(`✗ Différence calcul : ca_jour Δ=${deltaCA.toFixed(2)}€, moy Δ=${deltaMoy.toFixed(2)}€`)
  console.log('  → Possible bug dans evaluerDropOuSpikeCA')
}

// ─── Semaine W17 complète ─────────────────────────────────────────────
console.log()
console.log(sep)
console.log('SEMAINE W17 (20-26 avril) — pour contexte global')
console.log(sep)
console.log('date       | jour      | ca_brut    | uber_hist | uber_entrees | TOTAL')
console.log(sub)
const JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
const dates = ['2026-04-20','2026-04-21','2026-04-22','2026-04-23','2026-04-24','2026-04-25','2026-04-26']
let totalW17 = 0
for (let i = 0; i < dates.length; i++) {
  const j = await caJour(dates[i])
  totalW17 += j.total
  console.log(`${j.date} | ${JOURS[i].padEnd(9)} | ${fmt(j.ca_brut)} | ${fmt(j.uber_hist, 9)} | ${fmt(j.uber_entrees, 12)} | ${fmt(j.total)}`)
}
console.log(sub)
console.log(`TOTAL W17           : ${totalW17.toFixed(2)} €`)

// ─── Sources Uber sem 17 ──────────────────────────────────────────────
console.log()
console.log('Note : transition import auto Uber → saisie FAB autour du 15 avril.')
console.log('Si avant 15/04 Uber dans historique_ca.uber, après dans entrees(uber_eats).')

console.log()
process.exit(0)
