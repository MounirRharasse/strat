import { getDailyKPIs, getWeeklyData } from '@/lib/popina'
import { supabase } from '@/lib/supabase'
import DashboardClient from './DashboardClient'

export default async function Dashboard() {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const firstDayMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]

  const [kpisToday, kpisYesterday, weekly, { data: transactions }, { data: params }] = await Promise.all([
    getDailyKPIs(today),
    getDailyKPIs(yesterday),
    getWeeklyData(),
    supabase.from('transactions').select('*').gte('date', firstDayMonth),
    supabase.from('parametres').select('*').single()
  ])

  const kpis = kpisToday.hasData ? kpisToday : kpisYesterday

  const consommations = (transactions || [])
    .filter(t => t.categorie_pl === 'consommations')
    .reduce((s, t) => s + t.montant_ht, 0)

  // Charges fixes depuis Supabase
  const categoriesFixe = ['loyers_charges', 'honoraires', 'redevance_marque', 'energie', 'autres_frais_influencables', 'prestations_operationnelles']
  const chargesFixesMensuelles = (transactions || [])
    .filter(t => categoriesFixe.includes(t.categorie_pl))
    .reduce((s, t) => s + t.montant_ht, 0)

  const foodCostP = kpis.ca?.ht > 0 ? (consommations / kpis.ca.ht * 100) : 0

  const todayData = {
    hasData: kpis.hasData,
    date: kpis.date,
    since: today,
    ca: kpis.ca || { brut: 0, ht: 0, tva: 0 },
    canaux: kpis.canaux || { caisse: 0, online: 0 },
    frequentation: kpis.frequentation || { nbCommandes: 0 },
    panierMoyen: kpis.panierMoyen || 0,
    paiements: kpis.paiements || { borne: 0, cb: 0, especes: 0, tr: 0 },
    commissions: kpis.commissions || { cb: 0, tr: 0 },
    cashADeposer: kpis.cashADeposer || 0,
    weekly: weekly || [],
    foodCostP,
    chargesFixesMensuelles,
  }

  return <DashboardClient today={todayData} params={params || {}} />
}