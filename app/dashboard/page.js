import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'
import { getPeriodeFromFiltreId, periodePrecedenteAEgaleDuree, getCeMois } from '@/lib/periods'
import { getAnalysesKPIs } from '@/lib/data/analyses-kpis'
import { getLabelVariation } from '@/lib/dashboard-comparaison'
import { regrouperCanaux } from '@/lib/canaux'
import { decomposerParSousCategorie, topFournisseursConsommations } from '@/lib/food-cost-decomposition'
import { calculerFoodCost6Mois } from '@/lib/food-cost-historique'
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

  // Charges fixes : toujours sur le mois en cours, indépendant du filtre.
  // Utilisé pour le calcul du seuil de rentabilité (sera refondu au commit 3).
  const moisCourant = getCeMois({ timezone })

  // Bornes 6 mois glissants pour sparkline food cost
  const untilDate = new Date(until)
  const debut6Mois = new Date(untilDate.getFullYear(), untilDate.getMonth() - 5, 1)
    .toISOString()
    .slice(0, 10)

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
    { data: histCa6Mois }
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
    // Transactions Consommations sur la période actuelle (décomposition + top fournisseurs)
    supabase
      .from('transactions')
      .select('fournisseur_nom, sous_categorie, montant_ht, categorie_pl')
      .eq('parametre_id', parametre_id)
      .eq('categorie_pl', 'consommations')
      .gte('date', since)
      .lte('date', until),
    // Transactions Consommations sur la période précédente (variations top fournisseurs)
    supabase
      .from('transactions')
      .select('fournisseur_nom, montant_ht, categorie_pl')
      .eq('parametre_id', parametre_id)
      .eq('categorie_pl', 'consommations')
      .gte('date', periodePrec.since)
      .lte('date', periodePrec.until),
    // Transactions Consommations sur 6 mois glissants (sparkline numérateur)
    supabase
      .from('transactions')
      .select('date, montant_ht')
      .eq('parametre_id', parametre_id)
      .eq('categorie_pl', 'consommations')
      .gte('date', debut6Mois)
      .lte('date', until),
    // Historique CA HT sur 6 mois glissants (sparkline dénominateur)
    supabase
      .from('historique_ca')
      .select('date, ca_ht')
      .eq('parametre_id', parametre_id)
      .gte('date', debut6Mois)
      .lte('date', until)
  ])

  const categoriesFixe = ['loyers_charges', 'honoraires', 'redevance_marque', 'energie', 'autres_frais_influencables', 'prestations_operationnelles']
  const chargesFixesMensuelles = (transactionsMois || [])
    .filter(t => categoriesFixe.includes(t.categorie_pl))
    .reduce((s, t) => s + t.montant_ht, 0)

  const variations = {
    ca: computeVariation(kpisActuel.ca.brut, kpisPrec.ca.brut),
    cmd: computeVariation(kpisActuel.frequentation.nbCommandes, kpisPrec.frequentation.nbCommandes),
    panier: computeVariation(kpisActuel.panierMoyen, kpisPrec.panierMoyen),
    label: getLabelVariation(periodeActuelle)
  }

  // Variation food cost en POINTS (pas %), signe : positif = food cost monte (mauvais).
  const variationFoodCostPts = (kpisActuel.foodCostP || 0) - (kpisPrec.foodCostP || 0)

  const canauxRegroupes = regrouperCanaux(kpisActuel.ca)

  const objectifCA = params?.objectif_ca || 0
  const caMoisCourant = (histMois || []).reduce((s, r) => s + (r.ca_brut || 0), 0)
  const resteAFaire = (objectifCA > 0 && FILTRES_DANS_MOIS_COURANT.includes(filtreId))
    ? Math.max(0, objectifCA - caMoisCourant)
    : null

  // Décomposition food cost par sous-catégorie + top fournisseurs Consommations
  const decompositionMatieres = decomposerParSousCategorie(transactionsPeriode || [])
  const topFournisseurs = topFournisseursConsommations(
    transactionsPeriode || [],
    transactionsPeriodePrec || [],
    5
  )
  const foodCost6Mois = calculerFoodCost6Mois(
    transactionsConso6Mois || [],
    histCa6Mois || [],
    until
  )

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
