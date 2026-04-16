import { getDailyKPIs, getWeeklyData } from '@/lib/popina'
import { supabase } from '@/lib/supabase'
import DashboardClient from './DashboardClient'

export default async function Dashboard() {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]
  const firstDayMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]

  const [kpisToday, kpisYesterday, weekly, { data: transactions }, { data: params }] = await Promise.all([
    getDailyKPIs(today),
    getDailyKPIs(yesterdayStr),
    getWeeklyData(),
    supabase.from('transactions').select('*').gte('date', firstDayMonth),
    supabase.from('parametres').select('*').single()
  ])

  const kpis = kpisToday.hasData ? kpisToday : kpisYesterday
  const dateKpis = kpisToday.hasData ? today : yesterdayStr

  // Charger Uber et historique pour le bon jour
  const [{ data: histJour }, { data: entreesUber }, { data: histWeekly }] = await Promise.all([
    supabase.from('historique_ca').select('uber, nb_commandes').eq('date', dateKpis).single(),
    supabase.from('entrees').select('*').eq('date', dateKpis).eq('source', 'uber_eats'),
    supabase.from('historique_ca').select('date, uber, ca_brut').in('date', (weekly || []).map(j => j.date))
  ])

  const caUberHistorique = histJour?.uber || 0
  const caUberManuel = (entreesUber || []).reduce((s, e) => s + e.montant_ttc, 0)
  const caUberJour = caUberHistorique + caUberManuel
  const nbCommandesUber = (histJour?.nb_commandes || 0) +
    (entreesUber || []).reduce((s, e) => s + (e.nb_commandes || 0), 0)

  const caTotalBrut = (kpis.ca?.brut || 0) + caUberJour
  const caTotalHT = (kpis.ca?.ht || 0) + (caUberJour / 1.1)
  const nbCommandesTotal = (kpis.frequentation?.nbCommandes || 0) + nbCommandesUber
  const panierMoyen = nbCommandesTotal > 0 ? caTotalBrut / nbCommandesTotal : kpis.panierMoyen || 0

  const consommations = (transactions || []).filter(t => t.categorie_pl === 'consommations').reduce((s, t) => s + t.montant_ht, 0)
  const categoriesFixe = ['loyers_charges', 'honoraires', 'redevance_marque', 'energie', 'autres_frais_influencables', 'prestations_operationnelles']
  const chargesFixesMensuelles = (transactions || []).filter(t => categoriesFixe.includes(t.categorie_pl)).reduce((s, t) => s + t.montant_ht, 0)
  const foodCostP = caTotalHT > 0 ? (consommations / caTotalHT * 100) : 0

  const weeklyAvecUber = (weekly || []).map(jour => {
    const hist = (histWeekly || []).find(h => h.date === jour.date)
    return { ...jour, ca: hist ? hist.ca_brut : jour.ca, uber: hist?.uber || 0 }
  })

  const todayData = {
    hasData: kpis.hasData,
    date: dateKpis,
    since: today,
    ca: { brut: caTotalBrut, ht: caTotalHT, tva: kpis.ca?.tva || 0 },
    canaux: {
      caisse: kpis.canaux?.caisse || 0,
      foxorder: kpis.canaux?.online || 0,
      uber: caUberJour,
    },
    frequentation: { nbCommandes: nbCommandesTotal },
    panierMoyen,
    paiements: kpis.paiements || { borne: 0, cb: 0, especes: 0, tr: 0 },
    commissions: {
  cb: ((kpis.paiements?.borne || 0) + (kpis.paiements?.cb || 0)) * ((params?.taux_commission_cb ?? 1.5) / 100),
  tr: (kpis.paiements?.tr || 0) * ((params?.taux_commission_tr ?? 4.0) / 100),
  uber: caUberJour * ((params?.taux_commission_uber ?? 15.0) / 100),
  foxorder: (kpis.canaux?.online || 0) * ((params?.taux_commission_foxorder ?? 0) / 100),
},
    cashADeposer: kpis.cashADeposer || 0,
    weekly: weeklyAvecUber,
    foodCostP,
    chargesFixesMensuelles,
    caUberJour,
  }

  return <DashboardClient today={todayData} params={params || {}} />
}