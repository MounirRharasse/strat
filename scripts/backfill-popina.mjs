// Backfill manuel Popina pour rattraper les jours skippés par le cron nightly.
// Idempotent : UPSERT sur historique_ca + amplitude_horaire (mêmes contraintes que le cron).
//
// Usage :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/backfill-popina.mjs YYYY-MM-DD
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/backfill-popina.mjs YYYY-MM-DD YYYY-MM-DD
//
// Réplique fidèlement la logique de /api/cron/nightly et /api/admin/backfill-cron
// (sans le wrapper HTTP/auth NextAuth) pour permettre un appel CLI rapide.

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

// ─── Args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

if (args.length === 0 || !DATE_REGEX.test(args[0])) {
  console.error('Usage : backfill-popina.mjs YYYY-MM-DD [YYYY-MM-DD]')
  process.exit(1)
}
const since = args[0]
const until = args[1] && DATE_REGEX.test(args[1]) ? args[1] : args[0]

if (since > until) {
  console.error(`Erreur : date début (${since}) > date fin (${until})`)
  process.exit(1)
}

const dureeJours = Math.round((new Date(until) - new Date(since)) / 86400000) + 1
if (dureeJours > 31) {
  console.error(`Erreur : range trop large (${dureeJours} jours, max 31)`)
  process.exit(1)
}

// ─── Imports applicatifs ──────────────────────────────────────────────
const KROUSTY_ID = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'
const { getAllOrders, getAllReports } = await import('../lib/popina.js')
const { supabase } = await import('../lib/supabase.js')

// ─── Liste des dates ──────────────────────────────────────────────────
const jours = []
const debut = new Date(since + 'T12:00:00Z')
const fin = new Date(until + 'T12:00:00Z')
for (let d = new Date(debut); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
  jours.push(d.toISOString().split('T')[0])
}

console.log()
console.log(`Backfill Popina pour ${KROUSTY_ID}`)
console.log(`Range : ${since} → ${until} (${jours.length} jour${jours.length > 1 ? 's' : ''})`)
console.log('─'.repeat(60))

let nbAvecDonnees = 0
let nbVides = 0
const errors = []

for (const date of jours) {
  process.stdout.write(`${date} ... `)
  try {
    const [orders, reports] = await Promise.all([
      getAllOrders(date, date),
      getAllReports(date, date)
    ])

    const valides = orders.filter(o => !o.isCanceled && o.total > 0)

    // ─── amplitude_horaire ───────────────────────────────────────────
    const parHeure = {}
    for (const order of valides) {
      const dt = new Date(order.openedAt || order.createdAt)
      const hFrance = (dt.getUTCHours() + 2) % 24 // bug DST connu — préservé pour cohérence cron
      if (!parHeure[hFrance]) parHeure[hFrance] = { nb: 0, ca: 0 }
      parHeure[hFrance].nb += 1
      parHeure[hFrance].ca += order.total / 100
    }

    const amplitudeRecords = Object.entries(parHeure).map(([heure, data]) => ({
      parametre_id: KROUSTY_ID,
      date,
      heure: parseInt(heure),
      nb_commandes: data.nb,
      ca: Math.round(data.ca * 100) / 100,
      canal: 'popina'
    }))

    if (amplitudeRecords.length > 0) {
      const { error: errAmp } = await supabase
        .from('amplitude_horaire')
        .upsert(amplitudeRecords, { onConflict: 'parametre_id,date,heure,canal' })
      if (errAmp) errors.push({ date, step: 'amplitude', error: errAmp.message })
    }

    // ─── historique_ca ───────────────────────────────────────────────
    if (reports.length > 0) {
      const toEuros = (c) => Math.round(c) / 100
      const caBrut = reports.reduce((s, r) => s + toEuros(r.totalSales), 0)
      const tva = reports.reduce(
        (s, r) => s + (r.reportTaxes || []).reduce((t, x) => t + toEuros(x.taxAmount), 0),
        0
      )
      const caHT = caBrut - tva

      const allPayments = reports.flatMap(r => r.reportPayments || [])
      let especes = 0, cb = 0, tpa = 0, tr = 0
      for (const p of allPayments) {
        const nom = (p.paymentName || '').toLowerCase()
        const m = toEuros(p.paymentAmount)
        if (nom.includes('esp')) especes += m
        else if (nom.includes('carte') || nom.includes('credit')) cb += m
        else if (nom.includes('borne')) tpa += m
        else if (nom.includes('titre') || nom.includes('restaurant')) tr += m
      }

      const { error: errHist } = await supabase
        .from('historique_ca')
        .upsert({
          parametre_id: KROUSTY_ID,
          date,
          ca_brut: Math.round(caBrut * 100) / 100,
          ca_ht: Math.round(caHT * 100) / 100,
          especes: Math.round(especes * 100) / 100,
          cb: Math.round(cb * 100) / 100,
          tpa: Math.round(tpa * 100) / 100,
          tr: Math.round(tr * 100) / 100,
          nb_commandes: valides.length
        }, { onConflict: 'parametre_id,date' })

      if (errHist) {
        errors.push({ date, step: 'historique_ca', error: errHist.message })
        console.log(`✗ historique_ca error: ${errHist.message}`)
      } else {
        nbAvecDonnees++
        console.log(`✓ ca_brut=${caBrut.toFixed(2)}€ · ${valides.length} cmd · ${amplitudeRecords.length} heures`)
      }
    } else {
      nbVides++
      console.log(`∅ aucun report Popina pour cette date (jour fermé ?)`)
    }
  } catch (e) {
    errors.push({ date, step: 'fetch', error: e.message })
    console.log(`✗ ${e.message}`)
  }
}

console.log('─'.repeat(60))
console.log(`Résumé : ${nbAvecDonnees} jour(s) importé(s), ${nbVides} vide(s), ${errors.length} erreur(s)`)
if (errors.length > 0) {
  console.log()
  console.log('Erreurs :')
  for (const e of errors) console.log(`  ${e.date} | ${e.step} | ${e.error}`)
  process.exit(2)
}
process.exit(0)
