// Diagnostic : état du cron Popina /api/cron/nightly.
// Lance avec :
//   node --experimental-loader=./scripts/alias-loader.mjs scripts/check-cron-nightly.mjs

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

const sep = '═'.repeat(80)
const sub = '─'.repeat(80)

const now = new Date()
const todayISO = now.toISOString().slice(0, 10)
const nowParis = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))

console.log()
console.log(sep)
console.log(`DIAGNOSTIC CRON NIGHTLY — ${now.toISOString()}`)
console.log(`Heure Paris : ${nowParis.toLocaleString('fr-FR')}`)
console.log(sep)

// ─── 1. Dernière date dans historique_ca ─────────────────────────────
const { data: derniere, error: errDer } = await supabase
  .from('historique_ca')
  .select('date, created_at, ca_brut, uber, nb_commandes')
  .eq('parametre_id', KROUSTY_ID)
  .order('date', { ascending: false })
  .limit(1)
  .maybeSingle()

if (errDer) {
  console.error('Erreur lecture historique_ca:', errDer.message)
  process.exit(1)
}

console.log()
console.log('1. DERNIÈRE LIGNE historique_ca')
console.log(sub)
if (!derniere) {
  console.log('Aucune donnée.')
} else {
  console.log(`Date          : ${derniere.date}`)
  console.log(`Créée le      : ${derniere.created_at}`)
  console.log(`CA brut       : ${derniere.ca_brut} €`)
  console.log(`Uber          : ${derniere.uber} €`)
  console.log(`Nb commandes  : ${derniere.nb_commandes}`)
}

// ─── 2. 7 dernières lignes ───────────────────────────────────────────
const { data: dernieres7 } = await supabase
  .from('historique_ca')
  .select('date, created_at, ca_brut, uber, nb_commandes')
  .eq('parametre_id', KROUSTY_ID)
  .order('date', { ascending: false })
  .limit(7)

console.log()
console.log('2. 7 DERNIÈRES LIGNES historique_ca')
console.log(sub)
console.log('date         | created_at                       | ca_brut    | uber       | nb_cmd')
console.log(sub)
for (const r of dernieres7 || []) {
  const ca = String((r.ca_brut || 0).toFixed(2)).padStart(10)
  const ub = String((r.uber || 0).toFixed(2)).padStart(10)
  const nb = String(r.nb_commandes ?? '-').padStart(6)
  console.log(`${r.date} | ${r.created_at} | ${ca} | ${ub} | ${nb}`)
}

// ─── 3. Transactions 3 derniers jours ────────────────────────────────
const j3 = new Date(now)
j3.setDate(j3.getDate() - 3)
const since3jISO = j3.toISOString().slice(0, 10)

const { data: trans3j } = await supabase
  .from('transactions')
  .select('date, fournisseur_nom, montant_ttc, created_at')
  .eq('parametre_id', KROUSTY_ID)
  .gte('date', since3jISO)
  .order('created_at', { ascending: false })
  .limit(20)

console.log()
console.log(`3. TRANSACTIONS DES 3 DERNIERS JOURS (depuis ${since3jISO})`)
console.log(sub)
if (!trans3j || trans3j.length === 0) {
  console.log('Aucune transaction.')
} else {
  console.log('date       | fournisseur                | TTC      | created_at')
  console.log(sub)
  for (const t of trans3j) {
    const fn = (t.fournisseur_nom || '-').padEnd(26).slice(0, 26)
    const m = String((t.montant_ttc || 0).toFixed(2)).padStart(8)
    console.log(`${t.date} | ${fn} | ${m} | ${t.created_at}`)
  }
}

// ─── 4. Paramètres : connecteur + derniere_activite ──────────────────
const { data: params } = await supabase
  .from('parametres')
  .select('connecteur, derniere_activite')
  .eq('id', KROUSTY_ID)
  .single()

console.log()
console.log('4. PARAMÈTRES CONNECTEUR')
console.log(sub)
console.log(`Connecteur          : ${params?.connecteur ?? '-'}`)
console.log(`Dernière activité   : ${params?.derniere_activite ?? '-'}`)

// ─── 5. Diagnostic ───────────────────────────────────────────────────
console.log()
console.log('5. DIAGNOSTIC')
console.log(sep)

if (!derniere) {
  console.log('CRITICAL — Aucune donnée historique_ca.')
  process.exit(0)
}

const lastDate = new Date(derniere.date + 'T23:59:59Z')
const lastCreated = new Date(derniere.created_at)
const joursRetard = Math.floor((now - lastDate) / (24 * 3600 * 1000))
const heuresDepuisCreated = (now - lastCreated) / (3600 * 1000)

console.log(`Dernière date donnée : ${derniere.date}`)
console.log(`Aujourd'hui          : ${todayISO}`)
console.log(`Jours de retard      : ${joursRetard}`)
console.log(`Heures depuis créé   : ${heuresDepuisCreated.toFixed(1)} h`)
console.log()

// Le cron Popina nightly tourne 02:00 UTC = 04:00 Paris été.
// Il importe les données de hier (J-1) chaque nuit.
// Donc à 02:00+ UTC un jour J, on devrait avoir J-1 dans historique_ca.

const heureUTC = now.getUTCHours()
const cronAuraitDuTourner = heureUTC >= 2  // après 02:00 UTC aujourd'hui
const dateAttendueMin = new Date(now)
dateAttendueMin.setUTCDate(dateAttendueMin.getUTCDate() - (cronAuraitDuTourner ? 1 : 2))
const dateAttendueMinISO = dateAttendueMin.toISOString().slice(0, 10)

console.log(`Le cron tourne à 02:00 UTC (04:00 Paris été).`)
console.log(`Cron du jour ${cronAuraitDuTourner ? 'a déjà tourné' : 'pas encore tourné'} (heure UTC: ${heureUTC}h).`)
console.log(`Date min attendue dans historique_ca : ${dateAttendueMinISO}`)
console.log()

let status, hypotheses
if (derniere.date >= dateAttendueMinISO) {
  status = 'OK'
  hypotheses = ['Cron à jour, rien à faire.']
} else if (joursRetard <= 2) {
  status = 'WARNING'
  hypotheses = [
    `Le cron a 1-2 jours de retard. Possible : `,
    `  - Cron a tourné mais Popina API a renvoyé des données vides ou erreurs`,
    `  - Cron Vercel a échoué (à vérifier dans Vercel logs)`,
    `  - CRON_SECRET mal configuré`,
    `  - Période sans CA réel (week-end ferme = pas de ligne créée)`
  ]
} else {
  status = 'CRITICAL'
  hypotheses = [
    `Le cron est HS depuis ${joursRetard} jours. Pistes :`,
    `  - Vercel cron job désactivé ou erreur récurrente (regarder Vercel → Cron Jobs)`,
    `  - Popina API en panne ou credentials expirés`,
    `  - CRON_SECRET changé ou supprimé en env Vercel`,
    `  - Code crashé (bug introduit récemment dans /api/cron/nightly ?)`
  ]
}

console.log(`STATUS : ${status}`)
console.log()
console.log('Hypothèses :')
for (const h of hypotheses) console.log(h)

console.log()
console.log('ACTIONS À FAIRE')
console.log(sub)
console.log('1. Vercel dashboard → projet strat → Logs → filtrer sur /api/cron/nightly')
console.log('   Voir les invocations des 24-48 dernières heures (succès / erreur / timeout)')
console.log('2. Vercel → Settings → Environment Variables → vérifier CRON_SECRET présent')
console.log('3. Si tout vert côté Vercel, tester manuellement :')
console.log(`   curl -H "Authorization: Bearer $CRON_SECRET" https://strat-b8et.vercel.app/api/cron/nightly`)
console.log('4. Si crash : examiner /api/cron/nightly/route.js (dernier commit qui a touché ?)')

console.log()
process.exit(0)
