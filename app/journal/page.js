import { supabase } from '@/lib/supabase'
import { getDailyKPIs } from '@/lib/popina'
import { getParametreIdFromSession } from '@/lib/auth'
import { getAujourdhui, getHier, getPeriodeFromFiltreId } from '@/lib/periods'
import { redirect } from 'next/navigation'
import JournalClient from './JournalClient'

export default async function Journal({ searchParams }) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    redirect('/login')
  }

  const { data: parametres } = await supabase.from('parametres').select('*').eq('id', parametre_id).single()
  const timezone = parametres?.timezone || 'Europe/Paris'

  const today = getAujourdhui({ timezone }).until
  const yesterday = getHier({ timezone }).until
  const periode = searchParams?.periode || 'aujourdhui'
  const type = searchParams?.type || 'all'

  const { since } = getPeriodeFromFiltreId(periode, { timezone })

  const [{ data: transactions }, { data: entrees }, { data: historique }, kpisToday, kpisYesterday] = await Promise.all([
    supabase.from('transactions').select('*').eq('parametre_id', parametre_id).gte('date', since).order('date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('entrees').select('*').eq('parametre_id', parametre_id).gte('date', since).order('date', { ascending: false }),
    supabase.from('historique_ca').select('date, ca_brut, ca_ht, uber, nb_commandes, especes, cb, tr').eq('parametre_id', parametre_id).gte('date', since).order('date', { ascending: false }),
    getDailyKPIs(today),
    getDailyKPIs(yesterday)
  ])

  const kpis = kpisToday.hasData ? kpisToday : kpisYesterday

  return (
    <JournalClient
      transactions={transactions || []}
      entrees={entrees || []}
      historique={historique || []}
      kpis={kpis}
      today={today}
      yesterday={yesterday}
      periode={periode}
      type={type}
    />
  )
}