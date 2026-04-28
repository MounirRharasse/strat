import { getWeeklyData } from '@/lib/popina'
import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'
import { getPeriodeFromFiltreId, getCeMois } from '@/lib/periods'
import { getAnalysesKPIs } from '@/lib/data/analyses-kpis'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

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
  const { since, until, label, filtreId } = getPeriodeFromFiltreId(periode, { timezone })

  // Charges fixes : toujours sur le mois en cours, indépendant du filtre.
  // Utilisé pour le calcul du seuil de rentabilité mensuel.
  const moisCourant = getCeMois({ timezone })

  const [kpis, weekly, { data: transactionsMois }] = await Promise.all([
    getAnalysesKPIs({ parametre_id, since, until, parametres: params }),
    getWeeklyData(),
    supabase.from('transactions').select('*').gte('date', moisCourant.since).lte('date', moisCourant.until)
  ])

  // Pour le graphe 7 jours : croiser weekly avec uber historique
  const { data: histWeekly } = await supabase
    .from('historique_ca')
    .select('date, uber, ca_brut')
    .in('date', (weekly || []).map(j => j.date))

  const categoriesFixe = ['loyers_charges', 'honoraires', 'redevance_marque', 'energie', 'autres_frais_influencables', 'prestations_operationnelles']
  const chargesFixesMensuelles = (transactionsMois || [])
    .filter(t => categoriesFixe.includes(t.categorie_pl))
    .reduce((s, t) => s + t.montant_ht, 0)

  const weeklyAvecUber = (weekly || []).map(jour => {
    const hist = (histWeekly || []).find(h => h.date === jour.date)
    return { ...jour, ca: hist ? hist.ca_brut : jour.ca, uber: hist?.uber || 0 }
  })

  const data = {
    label,
    since,
    until,
    ca: { brut: kpis.ca.brut, ht: kpis.ca.ht, tva: kpis.ca.tva },
    canaux: { caisse: kpis.ca.caisse, foxorder: kpis.ca.foxorder, uber: kpis.ca.uber },
    frequentation: { nbCommandes: kpis.frequentation.nbCommandes },
    panierMoyen: kpis.panierMoyen,
    paiements: kpis.paiements,
    cashADeposer: kpis.cashADeposer,
    commissions: kpis.commissions,
    foodCostP: kpis.foodCostP,
    chargesFixesMensuelles,
    weekly: weeklyAvecUber
  }

  return <DashboardClient data={data} params={params || {}} periode={filtreId} />
}
