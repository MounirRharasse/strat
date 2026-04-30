import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'
import { getPeriodeFromFiltreId, periodePrecedenteAEgaleDuree, getCeMois } from '@/lib/periods'
import { getAnalysesKPIs } from '@/lib/data/analyses-kpis'
import { getLabelVariation } from '@/lib/dashboard-comparaison'
import { regrouperCanaux } from '@/lib/canaux'
import { decomposerParSousCategorie, topFournisseursConsommations } from '@/lib/food-cost-decomposition'
import { calculerFoodCost6Mois } from '@/lib/food-cost-historique'
import {
  CATEGORIES_CHARGES_FIXES,
  filtrer30j,
  calculerSeuil,
  calculerProjection,
  computeStatutSeuil,
  decomposerChargesFixes30j,
  calculerCouverture6Mois
} from '@/lib/seuil-rentabilite'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

// Filtres considérés "dans le mois courant" — seuls cas où le sous-bloc
// "Reste à faire ce mois" du HERO a du sens (cf. décision B2 du 2026-04-29).
const FILTRES_DANS_MOIS_COURANT = ['aujourdhui', 'hier', 'cette-semaine', 'ce-mois', 'derniers-30-jours']

function computeVariation(actuel, precedent) {
  if (precedent === 0 && actuel > 0) return { pct: null, label: 'Nouveau' }
  if (precedent === 0 && actuel === 0) return { pct: null, label: '—' }
  return { pct: ((actuel - precedent) / precedent) * 100, label: null }
}

export default async function Dashboard({ searchParams }) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    redirect('/login')
  }

  const { data: params } = await supabase
    .from('parametres')
    .select('*')
    .eq('id', parametre_id)
    .single()
  const timezone = params?.timezone || 'Europe/Paris'

  const periode = searchParams?.periode || 'ce-mois'
  const periodeActuelle = getPeriodeFromFiltreId(periode, { timezone })
  const periodePrec = periodePrecedenteAEgaleDuree(periodeActuelle)
  const { since, until, label, filtreId } = periodeActuelle

  const moisCourant = getCeMois({ timezone })

  // Bornes 6 mois jusqu'au mois courant (today), indépendant du filtre.
  // Le contexte historique de la sparkline doit être stable, pas suivre la période sélectionnée.
  const now = new Date()
  const todayISO = now.toISOString().slice(0, 10)
  const debut6MoisDate = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const debut6Mois = debut6MoisDate.toISOString().slice(0, 10)

  const [
    kpisActuel,
    kpisPrec,
    { data: derniereDate },
    { data: transactionsMois },
    { data: histMois },
    { data: histPeriode },
    { data: transactionsPeriode },
    { data: transactionsPeriodePrec },
    { data: transactionsConso6Mois },
    { data: histCa6Mois },
    { data: transactionsChargesFixes6Mois }
  ] = await Promise.all([
    getAnalysesKPIs({ parametre_id, since, until, parametres: params }),
    getAnalysesKPIs({ parametre_id, since: periodePrec.since, until: periodePrec.until, parametres: params }),
    supabase
      .from('historique_ca')
      .select('date')
      .eq('parametre_id', parametre_id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('transactions')
      .select('*')
      .eq('parametre_id', parametre_id)
      .gte('date', moisCourant.since)
      .lte('date', moisCourant.until),
    supabase
      .from('historique_ca')
      .select('ca_brut')
      .eq('parametre_id', parametre_id)
      .gte('date', moisCourant.since)
      .lte('date', moisCourant.until),
    supabase
      .from('historique_ca')
      .select('date, ca_brut, nb_commandes')
      .eq('parametre_id', parametre_id)
      .gte('date', since)
      .lte('date', until)
      .order('date', { ascending: true }),
    supabase
      .from('transactions')
      .select('fournisseur_nom, sous_categorie, montant_ht, categorie_pl')
      .eq('parametre_id', parametre_id)
      .eq('categorie_pl', 'consommations')
      .gte('date', since)
      .lte('date', until),
    supabase
      .from('transactions')
      .select('fournisseur_nom, montant_ht, categorie_pl')
      .eq('parametre_id', parametre_id)
      .eq('categorie_pl', 'consommations')
      .gte('date', periodePrec.since)
      .lte('date', periodePrec.until),
    // Consommations 6 mois jusqu'à today (sparkline food cost + marge brute 30j seuil)
    supabase
      .from('transactions')
      .select('date, montant_ht')
      .eq('parametre_id', parametre_id)
      .eq('categorie_pl', 'consommations')
      .gte('date', debut6Mois)
      .lte('date', todayISO),
    // CA HT 6 mois jusqu'à today (dénominateur sparkline + marge 30j seuil)
    supabase
      .from('historique_ca')
      .select('date, ca_ht')
      .eq('parametre_id', parametre_id)
      .gte('date', debut6Mois)
      .lte('date', todayISO),
    // Charges fixes 6 mois jusqu'à today (sparkline couverture seuil + 30j seuil + décomposition)
    supabase
      .from('transactions')
      .select('date, montant_ht, categorie_pl')
      .eq('parametre_id', parametre_id)
      .in('categorie_pl', CATEGORIES_CHARGES_FIXES)
      .gte('date', debut6Mois)
      .lte('date', todayISO)
  ])

  // ───────────────────────────────────────────────────────────────────
  // Variations CA / Cmd / Panier
  // ───────────────────────────────────────────────────────────────────
  const variations = {
    ca: computeVariation(kpisActuel.ca.brut, kpisPrec.ca.brut),
    cmd: computeVariation(kpisActuel.frequentation.nbCommandes, kpisPrec.frequentation.nbCommandes),
    panier: computeVariation(kpisActuel.panierMoyen, kpisPrec.panierMoyen),
    label: getLabelVariation(periodeActuelle)
  }
  const variationFoodCostPts = (kpisActuel.foodCostP || 0) - (kpisPrec.foodCostP || 0)

  const canauxRegroupes = regrouperCanaux(kpisActuel.ca)

  // ───────────────────────────────────────────────────────────────────
  // Reste à faire (ce-mois et filtres dans le mois courant uniquement)
  // ───────────────────────────────────────────────────────────────────
  const objectifCA = params?.objectif_ca || 0
  const caMoisCourant = (histMois || []).reduce((s, r) => s + (r.ca_brut || 0), 0)
  const resteAFaire = (objectifCA > 0 && FILTRES_DANS_MOIS_COURANT.includes(filtreId))
    ? Math.max(0, objectifCA - caMoisCourant)
    : null

  // ───────────────────────────────────────────────────────────────────
  // Food cost — décomposition + top fournisseurs + sparkline 6 mois
  // ───────────────────────────────────────────────────────────────────
  const decompositionMatieres = decomposerParSousCategorie(transactionsPeriode || [])
  const topFournisseurs = topFournisseursConsommations(
    transactionsPeriode || [],
    transactionsPeriodePrec || [],
    5
  )
  const foodCost6Mois = calculerFoodCost6Mois(
    transactionsConso6Mois || [],
    histCa6Mois || [],
    todayISO
  )

  // ───────────────────────────────────────────────────────────────────
  // Seuil de rentabilité — 30j roulants (charges fixes + marge brute)
  // + projection ce-mois + statut + couverture 6 mois + décomposition
  // ───────────────────────────────────────────────────────────────────
  const transactionsChargesFixes30j = filtrer30j(transactionsChargesFixes6Mois || [], now)
  const transactionsConso30j = filtrer30j(transactionsConso6Mois || [], now)
  const histCa30j = filtrer30j(histCa6Mois || [], now)

  const chargesFixes30j = transactionsChargesFixes30j.reduce((s, t) => s + (t.montant_ht || 0), 0)
  const conso30j = transactionsConso30j.reduce((s, t) => s + (t.montant_ht || 0), 0)
  const caHT30j = histCa30j.reduce((s, r) => s + (r.ca_ht || 0), 0)

  const seuilResult = calculerSeuil({ chargesFixes30j, conso30j, caHT30j, periode: periodeActuelle })
  const projectionFinMois = calculerProjection({
    caEffectif: kpisActuel.ca.brut,
    periode: periodeActuelle,
    refDate: now
  })
  const statutSeuil = computeStatutSeuil({
    filtreId,
    caEffectif: kpisActuel.ca.brut,
    seuilPeriode: seuilResult.seuilPeriode,
    projectionFinMois,
    seuilMensuel: seuilResult.seuilMensuel,
    etat: seuilResult.etat
  })
  const couverture6Mois = calculerCouverture6Mois({
    transactionsChargesFixes6Mois: transactionsChargesFixes6Mois || [],
    transactionsConso6Mois: transactionsConso6Mois || [],
    histCa6Mois: histCa6Mois || [],
    refDate: now
  })
  const decompositionChargesFixes = decomposerChargesFixes30j(transactionsChargesFixes30j)

  // Charges fixes mensuelles agrégées (mois calendaire) — gardées pour rétro-compat
  // Utilisées par la projection de ce-mois et certains affichages drill.
  const chargesFixesMensuelles = (transactionsMois || [])
    .filter(t => CATEGORIES_CHARGES_FIXES.includes(t.categorie_pl))
    .reduce((s, t) => s + t.montant_ht, 0)

  const data = {
    label,
    since,
    until,
    ca: { brut: kpisActuel.ca.brut, ht: kpisActuel.ca.ht, tva: kpisActuel.ca.tva },
    canaux: { caisse: kpisActuel.ca.caisse, foxorder: kpisActuel.ca.foxorder, uber: kpisActuel.ca.uber },
    canauxRegroupes,
    frequentation: {
      nbCommandes: kpisActuel.frequentation.nbCommandes,
      nbCommandesUber: kpisActuel.frequentation.nbCommandesUber || 0
    },
    panierMoyen: kpisActuel.panierMoyen,
    paiements: kpisActuel.paiements,
    cashADeposer: kpisActuel.cashADeposer,
    commissions: kpisActuel.commissions,
    foodCostP: kpisActuel.foodCostP,
    foodCostMode: kpisActuel.foodCostMode,
    foodCostPeriode: kpisActuel.foodCostPeriode,
    variationFoodCostPts,
    decompositionMatieres,
    topFournisseurs,
    foodCost6Mois,
    chargesFixesMensuelles,
    seuil: {
      etat: seuilResult.etat,
      chargesFixes30j: seuilResult.chargesFixes30j || 0,
      margeBrute30j: seuilResult.margeBrute30j,
      seuilMensuel: seuilResult.seuilMensuel,
      seuilPeriode: seuilResult.seuilPeriode,
      projectionFinMois,
      statut: statutSeuil,
      couverture6Mois,
      decomposition: decompositionChargesFixes
    },
    variations,
    resteAFaire,
    lastSyncDate: derniereDate?.date || null,
    historique: histPeriode || [],
    nbJours: periodeActuelle.nbJours,
    periodeActuelle: {
      filtreId: periodeActuelle.filtreId,
      since: periodeActuelle.since,
      until: periodeActuelle.until,
      label: periodeActuelle.label,
      nbJours: periodeActuelle.nbJours
    }
  }

  return <DashboardClient data={data} params={params || {}} periode={filtreId} />
}
