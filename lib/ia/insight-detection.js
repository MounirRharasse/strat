// Sprint IA Phase 1 commit 5 — Détection déterministe insight quotidien.
//
// Évalue 6 triggers déterministes (le 7e — trou saisie — est skippé car
// déjà couvert par le bandeau journal). Renvoie au plus 1 signal, choisi
// selon l'ordre tier #2 > #3 > #6 > #4 > #5 > #1.
//
// Pure fonction : NE FAIT PAS d'INSERT en DB. Le commit 6 orchestre
// cron + INSERT ia_signaux + génération IA Haiku.

import {
  parseISO, format, subDays, startOfMonth, endOfMonth,
  getDay, differenceInCalendarDays, getISOWeek, getISOWeekYear
} from 'date-fns'
import { supabase } from '@/lib/supabase'
import { getAnalysesKPIs } from '@/lib/data/analyses-kpis'
import { getCaBrutParJour, getCaBrutSomme, getCaHtSomme } from '@/lib/data/ventes'
import {
  calculerSeuil,
  filtrer30j,
  decomposerChargesFixes30j
} from '@/lib/seuil-rentabilite'

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MIN_DOW_VALID = 3
const MIN_BASELINE_FOURNISSEUR = 3

// Ordre tier (du plus prioritaire au moins) — cf. cadrage 2026-05-01.
const TIER_ORDER = ['T1', 'T2', 'T3', 'T4']
// Ordre intra-tier (tie-break) : index dans l'array = priorité décroissante.
const INTRA_TIER_ORDER = {
  T1: ['drop_ca', 'food_cost_spike'],
  T2: ['seuil_decroche'],
  T3: ['fournisseur_hausse'],
  T4: ['seuil_atteint', 'spike_ca']
}

function unwrapData({ data, error }, table) {
  if (error) throw new Error(`[insight-detection] ${table}: ${error.message}`)
  return data || []
}

function arrondi2(n) {
  return n == null ? null : Math.round(n * 100) / 100
}

function isoWeekLabel(d) {
  const annee = getISOWeekYear(d)
  const sem = getISOWeek(d)
  return `${annee}-W${String(sem).padStart(2, '0')}`
}

// Helper interne : retourne une map { date: ca_brut } pour la fenêtre.
// Migration étape 5 Lot 2 : remplace l'ancien getCAJour qui faisait
// 2 fetchs DB par date (5 dates × 2 = 10 round-trips). Désormais 1 seul
// fetch agrégé pour toute la fenêtre.
async function getCABrutMapPourFenetre(parametre_id, dateMin, dateMax) {
  const rows = await getCaBrutParJour(parametre_id, dateMin, dateMax)
  return Object.fromEntries(rows.map(r => [r.date, r.ca_brut]))
}

// ─────────────────────────────────────────────────────────────────────
// Helpers d'évaluation par trigger
// ─────────────────────────────────────────────────────────────────────

/**
 * Évalue le CA d'hier (date_ref - 1) vs même DOW des 4 sem précédentes.
 * → drop_ca (T1) si variation ≤ -seuil_drop
 * → spike_ca (T4) si variation ≥ seuil_spike
 * → null sinon (incl. jour fermé, historique insuffisant, pas de data)
 */
export async function evaluerDropOuSpikeCA({ parametre_id, date_ref, parametres }) {
  const dateEvalObj = subDays(parseISO(date_ref), 1)
  const dateEval = format(dateEvalObj, 'yyyy-MM-dd')
  const nomJour = JOURS_FR[getDay(dateEvalObj)]
  const joursFermes = parametres?.jours_fermes_semaine || []
  if (joursFermes.includes(nomJour)) return null

  // 1 seul fetch pour les 5 dates (jour évalué + 4 mêmes DOW précédents)
  const dateMin = format(subDays(dateEvalObj, 28), 'yyyy-MM-dd')
  const caMap = await getCABrutMapPourFenetre(parametre_id, dateMin, dateEval)

  const caJour = caMap[dateEval] ?? null
  if (caJour == null) return null

  const sources = []
  for (let i = 1; i <= 4; i++) {
    const d = format(subDays(dateEvalObj, 7 * i), 'yyyy-MM-dd')
    const ca = caMap[d] ?? null
    if (ca != null && ca > 0) sources.push(ca)
  }
  if (sources.length < MIN_DOW_VALID) return null

  const moyenne = sources.reduce((a, b) => a + b, 0) / sources.length
  if (moyenne === 0) return null

  const variationPct = ((caJour - moyenne) / moyenne) * 100
  const absVar = Math.abs(variationPct)

  const seuilSpike = parametres?.seuil_insight_spike_ca_pct ?? 25
  const seuilDrop = parametres?.seuil_insight_drop_ca_pct ?? 25

  const contexteCommun = {
    date_jour: dateEval,
    jour_semaine: nomJour,
    ca_jour: arrondi2(caJour),
    moyenne_meme_dow_4w: arrondi2(moyenne),
    variation_pct: arrondi2(variationPct),
    nb_dow_valides: sources.length,
    unite: 'pct'
  }

  if (variationPct < 0 && absVar >= seuilDrop) {
    return {
      type_trigger: 'drop_ca',
      tier: 'T1',
      magnitude: arrondi2(absVar),
      contexte: { ...contexteCommun, seuil_pct_param: seuilDrop }
    }
  }
  if (variationPct > 0 && absVar >= seuilSpike) {
    return {
      type_trigger: 'spike_ca',
      tier: 'T4',
      magnitude: arrondi2(absVar),
      contexte: { ...contexteCommun, seuil_pct_param: seuilSpike }
    }
  }
  return null
}

/**
 * Évalue le food cost de la dernière semaine ISO complète.
 * → food_cost_spike (T1) si food_cost_pct > parametres.alerte_food_cost_max
 */
export async function evaluerFoodCostSpike({ parametre_id, date_ref, parametres }) {
  const dateRefObj = parseISO(date_ref)
  // Trouver le dimanche le plus récent strictement < date_ref
  let dimanche = subDays(dateRefObj, 1)
  while (getDay(dimanche) !== 0) {
    dimanche = subDays(dimanche, 1)
  }
  const lundi = subDays(dimanche, 6)
  const since = format(lundi, 'yyyy-MM-dd')
  const until = format(dimanche, 'yyyy-MM-dd')

  const seuil = parametres?.alerte_food_cost_max
  if (!seuil || seuil <= 0) return null

  let kpis
  try {
    kpis = await getAnalysesKPIs({ parametre_id, since, until, parametres })
  } catch {
    return null
  }
  const foodCost = kpis?.foodCostP || 0
  if (foodCost <= seuil) return null

  const delta = foodCost - seuil
  return {
    type_trigger: 'food_cost_spike',
    tier: 'T1',
    magnitude: arrondi2(delta),
    contexte: {
      semaine_iso: isoWeekLabel(dimanche),
      since,
      until,
      food_cost_pct: arrondi2(foodCost),
      food_cost_mode: kpis.foodCostMode,
      seuil_alerte_pct: seuil,
      delta_vs_seuil_pts: arrondi2(delta),
      unite: 'pts'
    }
  }
}

/**
 * Cherche un fournisseur dont le cumul 7j ≥ +seuil % vs moyenne hebdo
 * des 4 sem précédentes. Filtre les fournisseurs avec < 3 achats baseline.
 * → fournisseur_hausse (T3) avec le plus gros écart
 */
export async function evaluerFournisseurHausse({ parametre_id, date_ref, parametres }) {
  const dateEvalObj = subDays(parseISO(date_ref), 1)
  const dateEval = format(dateEvalObj, 'yyyy-MM-dd')
  const since7j = format(subDays(dateEvalObj, 6), 'yyyy-MM-dd')
  const since5w = format(subDays(parseISO(since7j), 28), 'yyyy-MM-dd')
  const finBaseline = format(subDays(parseISO(since7j), 1), 'yyyy-MM-dd')

  const trans = await supabase
    .from('transactions')
    .select('date, fournisseur_nom, montant_ttc')
    .eq('parametre_id', parametre_id)
    .gte('date', since5w)
    .lte('date', dateEval)
    .then(r => unwrapData(r, 'transactions'))

  const seuil = parametres?.seuil_insight_fournisseur_hausse_pct ?? 30

  const par = {}
  for (const t of trans) {
    const f = t.fournisseur_nom
    if (!f) continue
    if (!par[f]) par[f] = { sem: [], baseline: [] }
    if (t.date >= since7j && t.date <= dateEval) par[f].sem.push(t.montant_ttc || 0)
    else if (t.date >= since5w && t.date <= finBaseline) par[f].baseline.push(t.montant_ttc || 0)
  }

  let best = null
  for (const [nom, data] of Object.entries(par)) {
    if (data.baseline.length < MIN_BASELINE_FOURNISSEUR) continue
    if (data.sem.length === 0) continue
    const cumul7j = data.sem.reduce((a, b) => a + b, 0)
    const moyHebdo4w = data.baseline.reduce((a, b) => a + b, 0) / 4
    if (moyHebdo4w === 0) continue
    const variation = ((cumul7j - moyHebdo4w) / moyHebdo4w) * 100
    if (variation < seuil) continue
    if (!best || variation > best.variation) {
      best = { nom, variation, cumul7j, moyHebdo4w }
    }
  }

  if (!best) return null
  return {
    type_trigger: 'fournisseur_hausse',
    tier: 'T3',
    magnitude: arrondi2(best.variation),
    contexte: {
      fournisseur_nom: best.nom,
      cumul_7j: arrondi2(best.cumul7j),
      moyenne_hebdo_4w_prec: arrondi2(best.moyHebdo4w),
      variation_pct: arrondi2(best.variation),
      seuil_pct_param: seuil,
      unite: 'pct'
    }
  }
}

/**
 * Détecte une transition de la projection mensuelle au-dessus / en-dessous
 * du seuil de rentabilité entre date_ref - 2 et date_ref - 1.
 * → seuil_atteint (T4) si bascule positive
 * → seuil_decroche (T2) si bascule négative
 *
 * Skip si dateEval ≤ 2 du mois (projection trop instable).
 */
export async function evaluerTransitionSeuil({ parametre_id, date_ref, parametres }) {
  const dateEval = subDays(parseISO(date_ref), 1)
  if (dateEval.getDate() <= 2) return null

  const datePrev = subDays(dateEval, 1)
  const debutMois = startOfMonth(dateEval)
  const finMois = endOfMonth(dateEval)
  const joursTotal = finMois.getDate()

  const debut30j = format(subDays(dateEval, 30), 'yyyy-MM-dd')
  const finRef = format(dateEval, 'yyyy-MM-dd')

  const debutMoisISO = format(debutMois, 'yyyy-MM-dd')
  const datePrevISO = format(datePrev, 'yyyy-MM-dd')
  const dateEvalISO = format(dateEval, 'yyyy-MM-dd')

  const [trans30j, caHT30j, histMoisRows] = await Promise.all([
    supabase.from('transactions').select('*')
      .eq('parametre_id', parametre_id)
      .gte('date', debut30j).lte('date', finRef)
      .then(r => unwrapData(r, 'transactions')),
    getCaHtSomme(parametre_id, debut30j, finRef),
    getCaBrutParJour(parametre_id, debutMoisISO, finRef)
  ])

  // Calcul seuil mensuel via 30j roulants
  const transFiltres = filtrer30j(trans30j, dateEval)
  const charges = decomposerChargesFixes30j(transFiltres)
  const conso30j = transFiltres
    .filter(t => t.categorie_pl === 'consommations')
    .reduce((s, t) => s + (t.montant_ttc || 0), 0)

  const seuilCalc = calculerSeuil({
    chargesFixes30j: charges.total,
    conso30j,
    caHT30j,
    periode: { nbJours: 30 }
  })
  if (seuilCalc.etat !== 'ok' || !seuilCalc.seuilMensuel) return null
  const seuilMensuel = seuilCalc.seuilMensuel

  // Cumul CA mensuel jusqu'à dateEval et datePrev
  const caCumul = {
    eval: 0,
    prev: 0
  }
  for (const r of histMoisRows) {
    const v = r.ca_brut || 0
    if (r.date <= dateEvalISO) caCumul.eval += v
    if (r.date <= datePrevISO) caCumul.prev += v
  }

  const joursEcoulesEval = differenceInCalendarDays(dateEval, debutMois) + 1
  const joursEcoulesPrev = differenceInCalendarDays(datePrev, debutMois) + 1

  if (joursEcoulesEval <= 0 || joursEcoulesPrev <= 0) return null

  const projectionEval = (caCumul.eval / joursEcoulesEval) * joursTotal
  const projectionPrev = (caCumul.prev / joursEcoulesPrev) * joursTotal

  const contexteCommun = {
    date_bascule: dateEvalISO,
    projection_jour_j: arrondi2(projectionEval),
    projection_jour_j_moins_1: arrondi2(projectionPrev),
    seuil_mensuel: arrondi2(seuilMensuel),
    marge_brute_pct: arrondi2(seuilCalc.margeBrute30j),
    unite: 'eur'
  }

  if (projectionPrev < seuilMensuel && projectionEval >= seuilMensuel) {
    return {
      type_trigger: 'seuil_atteint',
      tier: 'T4',
      magnitude: arrondi2(Math.abs(projectionEval - seuilMensuel)),
      contexte: contexteCommun
    }
  }
  if (projectionPrev >= seuilMensuel && projectionEval < seuilMensuel) {
    return {
      type_trigger: 'seuil_decroche',
      tier: 'T2',
      magnitude: arrondi2(Math.abs(projectionEval - seuilMensuel)),
      contexte: contexteCommun
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────
// Cooldown global : si un signal a été retenu dans les N derniers jours
// (TOUS types confondus), on n'en émet pas de nouveau aujourd'hui.
// N est paramétrable par tenant via parametres.insight_cooldown_jours
// (DEFAULT 2 = 1 insight tous les 3 jours min).
// ─────────────────────────────────────────────────────────────────────

const COOLDOWN_JOURS_DEFAUT = 2

/**
 * Vrai si un signal QUELCONQUE a été retenu dans les N derniers jours
 * pour ce parametre_id (date_ref - n_jours ≤ date_detection ≤ date_ref - 1).
 * Fail-open : retourne false si erreur DB (ne bloque pas la détection).
 */
async function isInCooldown({ parametre_id, date_ref, n_jours = COOLDOWN_JOURS_DEFAUT }) {
  const since = format(subDays(parseISO(date_ref), n_jours), 'yyyy-MM-dd')
  const until = format(subDays(parseISO(date_ref), 1), 'yyyy-MM-dd')
  const { data, error } = await supabase
    .from('ia_signaux')
    .select('id')
    .eq('parametre_id', parametre_id)
    .gte('date_detection', since)
    .lte('date_detection', until)
    .limit(1)
    .maybeSingle()
  if (error) return false
  return data != null
}

// ─────────────────────────────────────────────────────────────────────
// Orchestration : sélection du meilleur candidat (avec cooldown)
// ─────────────────────────────────────────────────────────────────────

function trierCandidats(candidats) {
  // Trie par tier puis par ordre intra-tier puis par magnitude desc.
  return candidats
    .filter(Boolean)
    .sort((a, b) => {
      const tierA = TIER_ORDER.indexOf(a.tier)
      const tierB = TIER_ORDER.indexOf(b.tier)
      if (tierA !== tierB) return tierA - tierB
      const intraA = (INTRA_TIER_ORDER[a.tier] || []).indexOf(a.type_trigger)
      const intraB = (INTRA_TIER_ORDER[b.tier] || []).indexOf(b.type_trigger)
      if (intraA !== intraB) return intraA - intraB
      return (b.magnitude || 0) - (a.magnitude || 0)
    })
}

/**
 * Détecte le seul insight le plus prioritaire du jour, en sautant les
 * triggers en cooldown (même type vu dans les 2 derniers jours).
 *
 * @returns {Promise<null | { type_trigger, tier, magnitude, contexte }>}
 */
export async function detecterInsightDuJour({ parametre_id, date_ref }) {
  const dateRef = date_ref || format(new Date(), 'yyyy-MM-dd')

  const { data: parametres, error } = await supabase
    .from('parametres').select('*').eq('id', parametre_id).single()
  if (error || !parametres) return null

  // Early-return si cooldown global actif : on évite d'évaluer les 4 triggers.
  const nJours = parametres.insight_cooldown_jours ?? COOLDOWN_JOURS_DEFAUT
  const inCooldown = await isInCooldown({
    parametre_id,
    date_ref: dateRef,
    n_jours: nJours
  })
  if (inCooldown) return null

  const [r1, r2, r3, r4] = await Promise.all([
    evaluerDropOuSpikeCA({ parametre_id, date_ref: dateRef, parametres }),
    evaluerFoodCostSpike({ parametre_id, date_ref: dateRef, parametres }),
    evaluerFournisseurHausse({ parametre_id, date_ref: dateRef, parametres }),
    evaluerTransitionSeuil({ parametre_id, date_ref: dateRef, parametres })
  ])

  const tries = trierCandidats([r1, r2, r3, r4])
  return tries.length > 0 ? tries[0] : null
}

// Export pour tests unitaires
export const _internal = { trierCandidats, isoWeekLabel, JOURS_FR, isInCooldown, COOLDOWN_JOURS_DEFAUT }
