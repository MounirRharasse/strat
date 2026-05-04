// Import KS2 Uber + entrees fallback → ventes_par_source.uber_eats — Phase A étape 3-bis.
//
// Cf. STRAT_ARCHITECTURE.md §Décision #5, PLANNING_V1.md §Sprint Migration data layer Étape 3-bis (v1.4).
// Période : 2025-01-16 → 2026-05-02 inclus (472 jours).
//
// SOURCES PAR CIBLE :
//   ventes_par_source.uber_eats : KS2.col_I (uber) sur 470 jours
//                                 + entrees.source='uber_eats' fallback sur les 2 jours
//                                   où KS2.uber = 0 (01-02/05/2026 d'après diagnostic
//                                   scripts/check-ks2-uber-couverture.mjs).
//
// nb_commandes Uber (cf. F4 IRRITANTS) :
//   - depuis 2025-06-01 ET KS2.col_W (Nb tickets Uber) > 0 : KS2.col_W
//   - sinon depuis fallback entrees ET entrees.nb_commandes IS NOT NULL : entrees.nb_commandes
//   - sinon NULL (pas de tracking nb VSP/Uber avant 2025-06-01)
//
// Mapping figé :
//   - montant_ttc      = KS2.uber (€) ou entrees.montant_ttc en fallback
//   - montant_ht       = NULL (KS2 ne donne pas un HT Uber fiable, entrees idem côté TVA Uber)
//   - commission_ttc   = NULL
//   - commission_ht    = NULL
//
// Idempotence : ON CONFLICT (parametre_id, date, source_id) DO UPDATE.
// Pas de touche à popina, paiements_caisse, historique_ca, entrees.

import XLSX from 'xlsx'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as pathResolve } from 'node:path'
import { createInterface } from 'node:readline'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = pathResolve(__dirname, '..')

const envPath = pathResolve(projectRoot, '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

// ─── Constantes ─────────────────────────────────────────────────────
const KS2_FILE = '/Users/mRharasse/Downloads/KS2 (1) (5).xlsx'
const KROUSTY_SLUG = 'krousty-sabaidi-montpellier-castelnau'
const PERIOD_START = '2025-01-16'
const PERIOD_END   = '2026-05-02'
const KS2_NB_COMMANDES_DEPUIS = '2025-06-01'  // cf. F4 IRRITANTS
const BATCH_SIZE   = 200
const DRY_RUN = process.argv.includes('--dry-run')

// ─── Vérif env ──────────────────────────────────────────────────────
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('❌ Vars Supabase manquantes (NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY)')
  process.exit(1)
}

const { supabase } = await import('../lib/supabase.js')

// ─── Helpers ────────────────────────────────────────────────────────
const r2 = n => Math.round(n * 100) / 100

function serialToISO(n) {
  const epoch = new Date(Date.UTC(1899, 11, 30))
  return new Date(epoch.getTime() + n * 86400000).toISOString().slice(0, 10)
}

function num(v) { return Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0 }

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans) }))
}

// ─── 1. Récupération parametre_id Krousty + source_id uber_eats ─────
console.log()
console.log('━'.repeat(70))
console.log(`  Import KS2 Uber + entrees fallback → ventes_par_source.uber_eats — Phase A étape 3-bis`)
console.log(`  Période : ${PERIOD_START} → ${PERIOD_END}`)
console.log(`  Mode : ${DRY_RUN ? '🟡 DRY-RUN (aucune écriture)' : '🔴 ÉCRITURE RÉELLE'}`)
console.log('━'.repeat(70))

const { data: paramRows, error: errParam } = await supabase
  .from('parametres').select('id').eq('slug', KROUSTY_SLUG)
if (errParam || !paramRows || paramRows.length !== 1) {
  console.error(`❌ Krousty introuvable via slug '${KROUSTY_SLUG}'`)
  process.exit(1)
}
const KROUSTY_ID = paramRows[0].id
console.log(`✓ parametre_id Krousty : ${KROUSTY_ID}`)

const { data: sourceRows, error: errSrc } = await supabase
  .from('sources').select('id, slug').eq('parametre_id', KROUSTY_ID).eq('slug', 'uber_eats')
if (errSrc || !sourceRows || sourceRows.length !== 1) {
  console.error(`❌ Source 'uber_eats' Krousty introuvable`)
  process.exit(1)
}
const SOURCE_UBER_ID = sourceRows[0].id
console.log(`✓ source_id uber_eats : ${SOURCE_UBER_ID}`)

// ─── 2. Lecture KS2 (uber + nb_uber) ────────────────────────────────
console.log()
console.log('━'.repeat(70))
console.log('  FETCH KS2 (Excel local, col I uber + col W nb_uber)')
console.log('━'.repeat(70))

if (!existsSync(KS2_FILE)) {
  console.error(`❌ Fichier KS2 introuvable : ${KS2_FILE}`)
  process.exit(1)
}
const wb = XLSX.readFile(KS2_FILE)
const ks2 = {}  // ISO → { uber, nb_uber }
for (const sheetName of ['Data_CA_N-1', 'Data_CA']) {
  const ws = wb.Sheets[sheetName]
  if (!ws) continue
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: true })
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const s = parseFloat(r[0])
    if (!Number.isFinite(s) || s < 40000) continue
    const iso = serialToISO(s)
    if (iso < PERIOD_START || iso > PERIOD_END) continue
    ks2[iso] = {
      uber: num(r[8]),       // col I
      nb_uber: num(r[22]),   // col W : Nb de tickets Uber (rempli depuis 2025-06-01)
    }
  }
}
console.log(`  → ${Object.keys(ks2).length} jours avec data KS2`)

// ─── 3. Lecture entrees source=uber_eats (fallback) ─────────────────
console.log()
console.log('━'.repeat(70))
console.log('  FETCH entrees source=uber_eats (fallback pour jours KS2.uber=0)')
console.log('━'.repeat(70))
const { data: entreesUber, error: errEnt } = await supabase
  .from('entrees').select('date, montant_ttc, nb_commandes')
  .eq('parametre_id', KROUSTY_ID).eq('source', 'uber_eats')
  .gte('date', PERIOD_START).lte('date', PERIOD_END)
if (errEnt) {
  console.error(`❌ Lecture entrees échouée : ${errEnt.message}`)
  process.exit(1)
}
const entreesParJour = {}
for (const e of entreesUber || []) entreesParJour[e.date] = e
console.log(`  → ${Object.keys(entreesParJour).length} jours avec entrees uber_eats sur la période`)

// ─── 4. Construction des rows à upsert ──────────────────────────────
console.log()
console.log('━'.repeat(70))
console.log('  CONSTRUCTION DES ROWS')
console.log('━'.repeat(70))

const vpsRows = []

const datesPeriode = []
const cur = new Date(PERIOD_START + 'T00:00:00Z')
const endD = new Date(PERIOD_END + 'T00:00:00Z')
while (cur <= endD) {
  datesPeriode.push(cur.toISOString().slice(0, 10))
  cur.setUTCDate(cur.getUTCDate() + 1)
}

let nbViaKs2 = 0, nbViaEntrees = 0, nbJoursVides = 0
let nbNbCommandesRenseigne = 0, nbNbCommandesNull = 0
let sumTtc = 0

for (const date of datesPeriode) {
  const k = ks2[date]
  const e = entreesParJour[date]

  let uberTtc = 0, sourceTag = null, nbCommandes = null

  if (k && k.uber > 0) {
    uberTtc = k.uber
    sourceTag = 'ks2'
    if (date >= KS2_NB_COMMANDES_DEPUIS && k.nb_uber > 0) {
      nbCommandes = Math.round(k.nb_uber)
    }
    nbViaKs2++
  } else if (e && e.montant_ttc > 0) {
    uberTtc = e.montant_ttc
    sourceTag = 'entrees'
    if (e.nb_commandes) nbCommandes = e.nb_commandes
    nbViaEntrees++
  } else {
    nbJoursVides++
    continue
  }

  vpsRows.push({
    parametre_id: KROUSTY_ID, date,
    source_id: SOURCE_UBER_ID,
    montant_ttc: r2(uberTtc),
    montant_ht: null,
    nb_commandes: nbCommandes,
    commission_ttc: null, commission_ht: null,
  })
  sumTtc += uberTtc
  if (nbCommandes != null) nbNbCommandesRenseigne++
  else nbNbCommandesNull++
}

// ─── 5. Résumé pré-écriture ─────────────────────────────────────────
const datesVPS = vpsRows.map(v => v.date).sort()
const dateMin = datesVPS[0] || '(aucune)'
const dateMax = datesVPS[datesVPS.length - 1] || '(aucune)'

console.log()
console.log('━'.repeat(70))
console.log('  RÉSUMÉ PRÉ-ÉCRITURE')
console.log('━'.repeat(70))
console.log(`  Jours de la période parcourus  : ${datesPeriode.length}`)
console.log(`  Jours sans aucune source Uber  : ${nbJoursVides}`)
console.log()
console.log(`  ventes_par_source.uber_eats à upsert : ${vpsRows.length}`)
console.log(`    via KS2.col_I (uber)               : ${nbViaKs2}`)
console.log(`    via entrees fallback               : ${nbViaEntrees}`)
console.log(`    sum montant_ttc                    : ${r2(sumTtc).toFixed(2)} €`)
console.log()
console.log(`  nb_commandes (cf. F4) :`)
console.log(`    renseigné                          : ${nbNbCommandesRenseigne} (depuis ${KS2_NB_COMMANDES_DEPUIS} via KS2.col_W ou entrees.nb_commandes)`)
console.log(`    NULL                               : ${nbNbCommandesNull} (avant ${KS2_NB_COMMANDES_DEPUIS}, F4 connu)`)
console.log()
console.log(`  Plage temporelle                : ${dateMin} → ${dateMax}`)
console.log()
console.log(`  Échantillon nb_commandes (3 dates de contrôle) :`)
const SAMPLES = ['2025-01-20', '2025-06-15', '2026-05-01']
for (const d of SAMPLES) {
  const row = vpsRows.find(v => v.date === d)
  if (!row) { console.log(`    ${d} : (absent — jour sans source)`); continue }
  const k = ks2[d]
  const e = entreesParJour[d]
  let src = '?'
  if (k && k.uber > 0 && r2(k.uber) === row.montant_ttc) src = 'KS2.col_I'
  else if (e && e.montant_ttc > 0) src = 'entrees fallback'
  console.log(`    ${d} : ttc=${row.montant_ttc.toFixed(2)} €, nb_commandes=${row.nb_commandes ?? 'NULL'}, via=${src}`)
}
console.log('━'.repeat(70))

// ─── 6. Dry-run : STOP ici ──────────────────────────────────────────
if (DRY_RUN) {
  console.log()
  console.log('🟡 DRY-RUN terminé. Aucune écriture en BDD.')
  console.log('   Pour exécuter réellement : retirer --dry-run.')
  process.exit(0)
}

// ─── 7. Confirmation interactive ────────────────────────────────────
console.log()
console.log('🔴 ATTENTION : écriture réelle en BDD imminente.')
console.log(`   Tables affectées : ventes_par_source.uber_eats (+${vpsRows.length} rows)`)
console.log(`   Idempotence : ON CONFLICT DO UPDATE — relance possible sans corruption.`)
console.log()
const ans = await prompt('Tape "Oui" exactement pour confirmer (sinon abort) : ')
if (ans !== 'Oui') {
  console.log(`❌ Réponse "${ans}" ≠ "Oui" — abort. Aucune écriture.`)
  process.exit(0)
}

// ─── 8. Upsert ventes_par_source par batchs ─────────────────────────
console.log()
console.log('━'.repeat(70))
console.log('  ÉCRITURE EN COURS')
console.log('━'.repeat(70))

let vpsInserted = 0
const vpsErrors = []
for (let i = 0; i < vpsRows.length; i += BATCH_SIZE) {
  const batch = vpsRows.slice(i, i + BATCH_SIZE)
  const { error } = await supabase
    .from('ventes_par_source')
    .upsert(batch, { onConflict: 'parametre_id,date,source_id' })
  if (error) {
    vpsErrors.push({ batch_start: i, message: error.message })
    console.error(`  ✗ VPS batch ${i}-${i + batch.length - 1} : ${error.message}`)
  } else {
    vpsInserted += batch.length
    process.stdout.write(`  ✓ VPS ${vpsInserted}/${vpsRows.length}\r`)
  }
}
console.log()
console.log(`  ventes_par_source.uber_eats upsertés : ${vpsInserted}/${vpsRows.length}`)
if (vpsErrors.length) console.log(`  ⚠ ${vpsErrors.length} batch(s) en erreur`)

// ─── 9. Résumé final ────────────────────────────────────────────────
console.log()
console.log('━'.repeat(70))
console.log('  RÉSUMÉ POST-ÉCRITURE')
console.log('━'.repeat(70))
console.log(`  ventes_par_source.uber_eats : ${vpsInserted}/${vpsRows.length} (${vpsErrors.length} erreurs)`)

if (vpsErrors.length) {
  console.log()
  console.log('❌ Des erreurs ont eu lieu. Relancer le script (idempotent ON CONFLICT) après diagnostic.')
  console.log(JSON.stringify({ vpsErrors }, null, 2))
  process.exit(1)
}

console.log()
console.log('✅ Import terminé sans erreur.')
process.exit(0)
