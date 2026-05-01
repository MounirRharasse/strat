// Sprint IA Phase 1 commit 8 — Functions chat domaine "general".
//
// Wrappers fins autour de getAnalysesKPIs et calculerSeuil pour exposer
// les KPIs de base à Claude via function calling.

import { format, startOfMonth, endOfMonth, parseISO, subDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { getAnalysesKPIs } from '@/lib/data/analyses-kpis'
import {
  calculerSeuil,
  filtrer30j,
  decomposerChargesFixes30j
} from '@/lib/seuil-rentabilite'
import { TVA_UBER_EATS } from '@/lib/data/constants'
import { parseSemaineISO } from '@/lib/ia/brief-inputs'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const SEMAINE_REGEX = /^\d{4}-W\d{1,2}$/
const MOIS_REGEX = /^\d{4}-\d{2}$/

async function getParametresDB(parametre_id) {
  const { data } = await supabase.from('parametres').select('*').eq('id', parametre_id).single()
  return data
}

async function getSynchroAgeHours(parametre_id) {
  const { data } = await supabase
    .from('historique_ca')
    .select('date')
    .eq('parametre_id', parametre_id)
    .order('date', { ascending: false })
    .limit(1).maybeSingle()
  if (!data?.date) return null
  const finJourSaisi = new Date(data.date).getTime() + 24 * 3600 * 1000
  const ageH = (Date.now() - finJourSaisi) / 3600000
  return Math.max(0, Math.round(ageH * 10) / 10)
}

function arrondi2(n) {
  return n == null ? null : Math.round(n * 100) / 100
}

export async function getCAJour({ parametre_id, date }) {
  if (!DATE_REGEX.test(date || '')) throw new Error('date invalide (YYYY-MM-DD requis)')
  const parametres = await getParametresDB(parametre_id)
  const kpis = await getAnalysesKPIs({ parametre_id, since: date, until: date, parametres })
  return {
    date,
    ca_brut: arrondi2(kpis.ca?.brut),
    ca_ht: arrondi2(kpis.ca?.ht),
    nb_commandes: kpis.frequentation?.nbCommandes || 0,
    panier_moyen: arrondi2(kpis.panierMoyen),
    canaux: {
      restaurant: arrondi2((kpis.ca?.caisse || 0) + (kpis.ca?.foxorder || 0)),
      plateformes: arrondi2(kpis.ca?.uber)
    },
    synchro_age_hours: await getSynchroAgeHours(parametre_id)
  }
}

export async function getCASemaine({ parametre_id, semaine_iso }) {
  if (!SEMAINE_REGEX.test(semaine_iso || '')) throw new Error('semaine_iso invalide (YYYY-Wxx requis)')
  const periode = parseSemaineISO(semaine_iso)
  const parametres = await getParametresDB(parametre_id)
  const kpis = await getAnalysesKPIs({
    parametre_id, since: periode.since, until: periode.until, parametres
  })
  return {
    semaine_iso,
    since: periode.since,
    until: periode.until,
    label_humain: periode.label_humain,
    ca_brut: arrondi2(kpis.ca?.brut),
    ca_ht: arrondi2(kpis.ca?.ht),
    nb_commandes: kpis.frequentation?.nbCommandes || 0,
    panier_moyen: arrondi2(kpis.panierMoyen),
    food_cost_pct: arrondi2(kpis.foodCostP),
    food_cost_mode: kpis.foodCostMode,
    synchro_age_hours: await getSynchroAgeHours(parametre_id)
  }
}

export async function getCAMois({ parametre_id, mois_iso }) {
  if (!MOIS_REGEX.test(mois_iso || '')) throw new Error('mois_iso invalide (YYYY-MM requis)')
  const debut = format(startOfMonth(parseISO(mois_iso + '-01')), 'yyyy-MM-dd')
  const finCalendaire = format(endOfMonth(parseISO(mois_iso + '-01')), 'yyyy-MM-dd')
  const today = new Date().toISOString().slice(0, 10)
  // Si mois en cours, on s'arrête à aujourd'hui (pas de futur)
  const until = finCalendaire > today ? today : finCalendaire
  const parametres = await getParametresDB(parametre_id)
  const kpis = await getAnalysesKPIs({ parametre_id, since: debut, until, parametres })
  return {
    mois_iso,
    since: debut,
    until,
    mois_complet: finCalendaire <= today,
    ca_brut: arrondi2(kpis.ca?.brut),
    ca_ht: arrondi2(kpis.ca?.ht),
    nb_commandes: kpis.frequentation?.nbCommandes || 0,
    panier_moyen: arrondi2(kpis.panierMoyen),
    food_cost_pct: arrondi2(kpis.foodCostP),
    food_cost_mode: kpis.foodCostMode,
    synchro_age_hours: await getSynchroAgeHours(parametre_id)
  }
}

export async function getFoodCost({ parametre_id, semaine_iso }) {
  if (!SEMAINE_REGEX.test(semaine_iso || '')) throw new Error('semaine_iso invalide (YYYY-Wxx requis)')
  const periode = parseSemaineISO(semaine_iso)
  const parametres = await getParametresDB(parametre_id)
  const kpis = await getAnalysesKPIs({
    parametre_id, since: periode.since, until: periode.until, parametres
  })
  return {
    semaine_iso,
    since: periode.since,
    until: periode.until,
    food_cost_pct: arrondi2(kpis.foodCostP),
    food_cost_mode: kpis.foodCostMode,
    seuil_alerte_pct: parametres?.alerte_food_cost_max ?? 32,
    consommations_ht: arrondi2(kpis.consommations),
    ca_ht: arrondi2(kpis.ca?.ht)
  }
}

export async function getSeuilRentabilite({ parametre_id }) {
  const now = new Date()
  const debut30j = format(subDays(now, 30), 'yyyy-MM-dd')
  const today = format(now, 'yyyy-MM-dd')

  const [transRes, histRes, entreesRes] = await Promise.all([
    supabase.from('transactions').select('*')
      .eq('parametre_id', parametre_id).gte('date', debut30j).lte('date', today),
    supabase.from('historique_ca').select('date, ca_ht, uber')
      .eq('parametre_id', parametre_id).gte('date', debut30j).lte('date', today),
    supabase.from('entrees').select('date, source, montant_ttc')
      .eq('parametre_id', parametre_id).eq('source', 'uber_eats')
      .gte('date', debut30j).lte('date', today)
  ])

  const trans = filtrer30j(transRes.data || [], now)
  const charges = decomposerChargesFixes30j(trans)
  const conso = trans.filter(t => t.categorie_pl === 'consommations')
    .reduce((s, t) => s + (t.montant_ht || 0), 0)
  const caHT = (histRes.data || []).reduce(
    (s, r) => s + (r.ca_ht || 0) + (r.uber || 0) / TVA_UBER_EATS, 0
  ) + (entreesRes.data || []).reduce(
    (s, e) => s + (e.montant_ttc || 0) / TVA_UBER_EATS, 0
  )

  const seuil = calculerSeuil({
    chargesFixes30j: charges.total,
    conso30j: conso,
    caHT30j: caHT,
    periode: { nbJours: 30 }
  })

  return {
    etat: seuil.etat,
    seuil_mensuel: arrondi2(seuil.seuilMensuel),
    marge_brute_pct: arrondi2(seuil.margeBrute30j),
    charges_fixes_30j_ht: arrondi2(charges.total),
    consommations_30j_ht: arrondi2(conso),
    ca_ht_30j: arrondi2(caHT)
  }
}
