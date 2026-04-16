import { supabase } from '@/lib/supabase'
import { getDailyKPIs } from '@/lib/popina'
import JournalClient from './JournalClient'

export default async function Journal({ searchParams }) {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const periode = searchParams?.periode || 'today'
  const type = searchParams?.type || 'all'

  let since = today
  if (periode === 'week') since = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  if (periode === 'month') since = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  const [{ data: transactions }, { data: entrees }, { data: historique }, kpisToday, kpisYesterday] = await Promise.all([
    supabase.from('transactions').select('*').gte('date', since).order('date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('entrees').select('*').gte('date', since).order('date', { ascending: false }),
    supabase.from('historique_ca').select('date, ca_brut, ca_ht, uber, nb_commandes, especes, cb, tr').gte('date', since).order('date', { ascending: false }),
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