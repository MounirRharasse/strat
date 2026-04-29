import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'
import { getPeriodeFromFiltreId } from '@/lib/periods'
import PeriodFilter from '@/components/PeriodFilter'
import SortiesView from './SortiesView'
import ComparaisonView from './ComparaisonView'

export default async function Analyses({ searchParams }) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    redirect('/login')
  }

  const onglet = searchParams?.onglet === 'sorties' ? 'sorties' : 'comparaison'
  const periode = searchParams?.periode || 'ce-mois'

  const { data: parametres } = await supabase
    .from('parametres')
    .select('*')
    .eq('id', parametre_id)
    .single()

  const timezone = parametres?.timezone || 'Europe/Paris'

  let transactions = []
  let since = null
  let until = null
  if (onglet === 'sorties') {
    const r = getPeriodeFromFiltreId(periode, { timezone })
    since = r.since
    until = r.until
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('parametre_id', parametre_id)
      .gte('date', since)
      .lte('date', until)
      .order('date', { ascending: false })
    transactions = data || []
  }

  const buildTabHref = (tab) => {
    const params = new URLSearchParams()
    params.set('onglet', tab)
    if (tab === 'sorties') params.set('periode', periode)
    return `/analyses?${params.toString()}`
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto pb-24">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Analyses</h1>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Link
          href={buildTabHref('sorties')}
          className={"text-center text-xs py-2 rounded-xl border " +
            (onglet === 'sorties'
              ? 'bg-white text-gray-950 border-white font-semibold'
              : 'bg-gray-900 text-gray-400 border-gray-800')}>
          Sorties
        </Link>
        <Link
          href={buildTabHref('comparaison')}
          className={"text-center text-xs py-2 rounded-xl border " +
            (onglet === 'comparaison'
              ? 'bg-white text-gray-950 border-white font-semibold'
              : 'bg-gray-900 text-gray-400 border-gray-800')}>
          Comparaison
        </Link>
      </div>

      {onglet === 'sorties' && (
        <>
          <div className="mb-4">
            <Suspense fallback={null}>
              <PeriodFilter profil="pilotage" basePath="/analyses" filtreActif={periode} />
            </Suspense>
          </div>
          <SortiesView
            transactions={transactions}
            periode={{ id: periode, since, until }}
          />
        </>
      )}

      {onglet === 'comparaison' && <ComparaisonView />}
    </div>
  )
}
