// Sprint IA Phase 1 commit 2 — Build inputs structurés du Brief lundi.
//
// Construit l'objet `inputs` passé à Sonnet 4.6 lors de la génération
// du brief hebdomadaire. JAMAIS de calcul côté IA → tous les chiffres
// transitent par ce module.
//
// Cf. STRAT_IA.md §6 (chiffres en input, jamais inventés).

import {
  parseISO, format, addDays, subDays,
  getISOWeek, getISOWeekYear, setISOWeek, setISOWeekYear,
  startOfISOWeek, endOfISOWeek, getDay
} from 'date-fns'
import { supabase } from '@/lib/supabase'
import { getAnalysesKPIs } from '@/lib/data/analyses-kpis'
import { getCaBrutParJour, getRowsCompatHCA } from '@/lib/data/ventes'
import { auditerJournal } from '@/lib/audit-saisies'
import {
  calculerSeuil,
  filtrer30j,
  decomposerChargesFixes30j
} from '@/lib/seuil-rentabilite'
import { topFournisseursConsommations } from '@/lib/food-cost-decomposition'

// Helper : déballe la réponse Supabase, throw si error.
// Évite que les bugs de colonnes/typo passent silencieusement.
function unwrapData({ data, error }, table) {
  if (error) throw new Error(`[brief-inputs] ${table}: ${error.message}`)
  return data || []
}

// ─────────────────────────────────────────────────────────────────────
// Helpers semaine ISO (YYYY-Www, lundi → dimanche)
// ─────────────────────────────────────────────────────────────────────

const JOURS_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
const MOIS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']

/**
 * Parse 'YYYY-Wxx' en { since, until, label_humain, annee, semaine }.
 * since = lundi, until = dimanche (date strings YYYY-MM-DD).
 */
export function parseSemaineISO(semaine_iso) {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(semaine_iso)
  if (!m) throw new Error(`Format semaine_iso invalide: ${semaine_iso}`)
  const annee = parseInt(m[1], 10)
  const semaine = parseInt(m[2], 10)
  let d = new Date(annee, 0, 4)
  d = setISOWeekYear(d, annee)
  d = setISOWeek(d, semaine)
  const lundi = startOfISOWeek(d)
  const dimanche = endOfISOWeek(d)
  return {
    since: format(lundi, 'yyyy-MM-dd'),
    until: format(dimanche, 'yyyy-MM-dd'),
    label_humain: `du ${lundi.getDate()} ${MOIS_FR[lundi.getMonth()]} au ${dimanche.getDate()} ${MOIS_FR[dimanche.getMonth()]} ${dimanche.getFullYear()}`,
    annee,
    semaine
  }
}

/** Renvoie 'YYYY-Wxx' pour la date de référence (par défaut: maintenant). */
export function getSemaineCourante(refDate = new Date()) {
  const annee = getISOWeekYear(refDate)
  const semaine = getISOWeek(refDate)
  return `${annee}-W${String(semaine).padStart(2,'0')}`
}

/** Renvoie 'YYYY-Wxx' pour la semaine précédente (refDate - 7j). */
export function getSemainePrecedente(refDate = new Date()) {
  return getSemaineCourante(subDays(refDate, 7))
}

// ─────────────────────────────────────────────────────────────────────
// Helpers internes de calcul
// ─────────────────────────────────────────────────────────────────────

function fmtVariation(actuel, precedent) {
  if (precedent == null || precedent === 0) return null
  const v = ((actuel - precedent) / precedent) * 100
  const signe = v >= 0 ? '+' : ''
  return `${signe}${Math.round(v * 10) / 10}%`
}

function arrondi2(n) {
  return n == null ? null : Math.round(n * 100) / 100
}

async function getParametres(parametre_id) {
  const { data, error } = await supabase
    .from('parametres').select('*').eq('id', parametre_id).single()
  if (error) throw error
  return data
}

/** KPIs des 4 dernières semaines (sem-0 = semaine demandée, sem-1..3 = précédentes). */
async function _buildKPIs4Semaines(parametre_id, periode, parametres) {
  const debut0 = parseISO(periode.since)
  const semaines = []
  for (let i = 0; i < 4; i++) {
    const d = subDays(debut0, 7 * i)
    semaines.push({
      since: format(d, 'yyyy-MM-dd'),
      until: format(addDays(d, 6), 'yyyy-MM-dd')
    })
  }
  return Promise.all(
    semaines.map(s => getAnalysesKPIs({
      parametre_id, since: s.since, until: s.until, parametres
    }))
  )
}

/** CA par jour de la semaine + comparaison à même DOW sur 4 semaines précédentes. */
async function _buildCAParJour(parametre_id, periode) {
  const debut0 = parseISO(periode.since)
  const since4w = format(subDays(debut0, 28), 'yyyy-MM-dd')

  // 1 fetch agrégé via helper (popina + uber jour par jour)
  const rows = await getCaBrutParJour(parametre_id, since4w, periode.until)
  const caParDate = Object.fromEntries(rows.map(r => [r.date, r.ca_brut]))

  const result = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(debut0, i)
    const dateStr = format(d, 'yyyy-MM-dd')
    const ca = arrondi2(caParDate[dateStr] || 0)
    const memeDow = []
    for (let w = 1; w <= 4; w++) {
      const dPrev = format(subDays(d, 7 * w), 'yyyy-MM-dd')
      memeDow.push(caParDate[dPrev] || 0)
    }
    const moyDow = memeDow.reduce((a, b) => a + b, 0) / memeDow.length
    result.push({
      jour: `${JOURS_FR[getDay(d)]} ${d.getDate()} ${MOIS_FR[d.getMonth()]}`,
      ca,
      vs_meme_dow_4w: fmtVariation(ca, moyDow)
    })
  }
  return result
}

/** Top 5 fournisseurs cumul semaine + variation vs moyenne hebdo des 4 sem précédentes. */
async function _buildTopFournisseurs(parametre_id, periode) {
  const debut0 = parseISO(periode.since)
  const since4w = format(subDays(debut0, 28), 'yyyy-MM-dd')
  const finPrec = format(subDays(debut0, 1), 'yyyy-MM-dd')

  const trans = await supabase
    .from('transactions')
    .select('date, fournisseur_nom, montant_ttc, montant_ht, categorie_pl')
    .eq('parametre_id', parametre_id)
    .gte('date', since4w).lte('date', periode.until)
    .then(r => unwrapData(r, 'transactions'))

  const sem = trans.filter(t => t.date >= periode.since && t.date <= periode.until)
  const prec4w = trans.filter(t => t.date >= since4w && t.date <= finPrec)
  const top = topFournisseursConsommations(sem, prec4w, 5)

  return top.map(f => ({
    nom: f.nom,
    cumul_semaine: arrondi2(f.actuel),
    vs_4_dernieres_semaines: fmtVariation(f.actuel, (f.precedent || 0) / 4)
  }))
}

/** Anomalies du journal qui tombent dans la semaine, max 5. */
async function _buildAnomaliesSemaine(parametre_id, periode, parametres) {
  const debut0 = parseISO(periode.since)
  const since6m = format(subDays(debut0, 180), 'yyyy-MM-dd')

  // hist : adaptateur rétro-compat (reconstitue structure historique_ca depuis VPS+PC)
  // entrees : conservé tel quel (source FAB legacy jusqu'à étape 7)
  const [hist, trans, entrees, transHist, ignores] = await Promise.all([
    getRowsCompatHCA(parametre_id, since6m, periode.until),
    supabase.from('transactions').select('*').eq('parametre_id', parametre_id)
      .gte('date', periode.since).lte('date', periode.until)
      .then(r => unwrapData(r, 'transactions')),
    supabase.from('entrees').select('*').eq('parametre_id', parametre_id)
      .gte('date', periode.since).lte('date', periode.until)
      .then(r => unwrapData(r, 'entrees')),
    supabase.from('transactions').select('*').eq('parametre_id', parametre_id)
      .gte('date', since6m).lte('date', periode.until)
      .then(r => unwrapData(r, 'transactions_historique')),
    supabase.from('audits_ignores').select('*').eq('parametre_id', parametre_id)
      .then(r => unwrapData(r, 'audits_ignores'))
  ])

  const audit = auditerJournal({
    since: periode.since,
    today: periode.until,
    historique: hist,
    transactions: trans,
    entrees: entrees,
    transactionsHistorique: transHist,
    joursFermesSemaine: parametres?.jours_fermes_semaine || [],
    ignores: ignores
  })

  return audit.alertes.slice(0, 5).map(a => ({
    type: a.type,
    date: a.date,
    criticite: a.criticite,
    description: a.message || a.description || a.titre || ''
  }))
}

/** Contexte seuil de rentabilité sur la semaine (CA HT 30j réel via getAnalysesKPIs). */
async function _buildSeuilContext(parametre_id, periode, parametres, kpisSem0) {
  const finPeriode = parseISO(periode.until)
  const since30j = format(subDays(finPeriode, 29), 'yyyy-MM-dd')

  const [kpis30j, trans30j] = await Promise.all([
    getAnalysesKPIs({ parametre_id, since: since30j, until: periode.until, parametres }),
    supabase.from('transactions').select('*')
      .eq('parametre_id', parametre_id)
      .gte('date', since30j).lte('date', periode.until)
      .then(r => unwrapData(r, 'transactions'))
  ])

  const filtres = filtrer30j(trans30j, parseISO(periode.until))
  const charges = decomposerChargesFixes30j(filtres)
  const conso30j = filtres
    .filter(t => t.categorie_pl === 'consommations')
    .reduce((s, t) => s + (t.montant_ttc || 0), 0)
  const caHT30j = kpis30j.ca?.ht || 0
  const seuil = calculerSeuil({
    chargesFixes30j: charges.total,
    conso30j,
    caHT30j,
    periode: { nbJours: 7 }
  })
  const caHTSemaine = kpisSem0.ca?.ht || 0
  return {
    etat: seuil.etat,
    seuil_mensuel: arrondi2(seuil.seuilMensuel),
    seuil_semaine: arrondi2(seuil.seuilPeriode),
    marge_brute_pct: arrondi2(seuil.margeBrute30j),
    atteint: seuil.etat === 'ok' && caHTSemaine >= (seuil.seuilPeriode || Infinity)
  }
}

// ─────────────────────────────────────────────────────────────────────
// Build inputs principal
// ─────────────────────────────────────────────────────────────────────

/**
 * Construit l'objet inputs structuré pour le brief lundi.
 *
 * @param {Object} params
 * @param {string} params.parametre_id
 * @param {string} params.semaine_iso - 'YYYY-Wxx'
 * @returns {Promise<{ inputs: Object, periode: { since, until, label_humain } }>}
 */
export async function buildBriefInputs({ parametre_id, semaine_iso }) {
  const periode = parseSemaineISO(semaine_iso)
  const parametres = await getParametres(parametre_id)

  const [kpis4, caParJour, topFourn, anomalies, chargesCtx] = await Promise.all([
    _buildKPIs4Semaines(parametre_id, periode, parametres),
    _buildCAParJour(parametre_id, periode),
    _buildTopFournisseurs(parametre_id, periode),
    _buildAnomaliesSemaine(parametre_id, periode, parametres),
    _buildChargesContext(parametre_id),
  ])

  const [sem0, sem1, sem2, sem3] = kpis4
  const seuilCtx = await _buildSeuilContext(parametre_id, periode, parametres, sem0)

  const inputs = {
    semaine: {
      iso: semaine_iso,
      date_debut: periode.since,
      date_fin: periode.until,
      label_humain: periode.label_humain
    },
    ca_semaine: {
      brut: arrondi2(sem0.ca?.brut),
      ht: arrondi2(sem0.ca?.ht),
      vs_sem_1: fmtVariation(sem0.ca?.brut, sem1.ca?.brut),
      vs_sem_2: fmtVariation(sem0.ca?.brut, sem2.ca?.brut),
      vs_sem_3: fmtVariation(sem0.ca?.brut, sem3.ca?.brut)
    },
    ca_par_canal: {
      restaurant: arrondi2((sem0.ca?.caisse || 0) + (sem0.ca?.foxorder || 0)),
      plateformes: arrondi2(sem0.ca?.uber || 0)
    },
    ca_par_jour: caParJour,
    food_cost_semaine: {
      pct: arrondi2(sem0.foodCostP),
      mode: sem0.foodCostMode,
      vs_sem_precedente_pts: arrondi2((sem0.foodCostP || 0) - (sem1.foodCostP || 0))
    },
    seuil_rentabilite: seuilCtx,
    top_fournisseurs: topFourn,
    anomalies_journal: anomalies,
    panier_moyen: {
      semaine: arrondi2(sem0.panierMoyen),
      vs_sem_1: fmtVariation(sem0.panierMoyen, sem1.panierMoyen)
    },
    frequentation: {
      commandes: sem0.frequentation?.nbCommandes || 0,
      vs_sem_1: fmtVariation(
        sem0.frequentation?.nbCommandes,
        sem1.frequentation?.nbCommandes
      )
    },
    charges_recurrentes: chargesCtx,
  }

  return { inputs, periode }
}

/** Contexte charges récurrentes (Lot 10) — suggestions pending + oublis. */
async function _buildChargesContext(parametre_id) {
  const today = new Date().toISOString().slice(0, 10)
  const seuilDate = new Date(today + 'T00:00:00Z')
  seuilDate.setUTCDate(seuilDate.getUTCDate() - 5)
  const seuilISO = seuilDate.toISOString().slice(0, 10)

  const [pendingRes, oublisRes] = await Promise.all([
    supabase
      .from('charges_suggestions')
      .select('id, mois, date_attendue, montant_suggere, fournisseur_suggere, charges_recurrentes(libelle_personnalise)')
      .eq('parametre_id', parametre_id)
      .eq('statut', 'pending')
      .order('date_attendue', { ascending: true }),
    supabase
      .from('charges_suggestions')
      .select('id, date_attendue, montant_suggere, charges_recurrentes(libelle_personnalise)')
      .eq('parametre_id', parametre_id)
      .eq('statut', 'pending')
      .lte('date_attendue', seuilISO)
      .order('date_attendue', { ascending: true })
      .limit(10),
  ])

  const pending = unwrapData(pendingRes, 'charges_suggestions pending')
  const oublis = unwrapData(oublisRes, 'charges_suggestions oublis')

  return {
    nb_suggestions_pending: pending.length,
    total_pending_ttc: arrondi2(pending.reduce((s, o) => s + Number(o.montant_suggere || 0), 0)),
    nb_oublis: oublis.length,
    oublis: oublis.map(o => ({
      libelle: o.charges_recurrentes?.libelle_personnalise || '?',
      date_attendue: o.date_attendue,
      jours_de_retard: Math.floor((new Date(today + 'T00:00:00Z') - new Date(o.date_attendue + 'T00:00:00Z')) / 86400000),
      montant_ttc: arrondi2(Number(o.montant_suggere)),
    })),
  }
}
