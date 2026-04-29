import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'
import { getPeriodeFromFiltreId, periodePrecedenteAEgaleDuree } from '@/lib/periods'
import {
  agregerParMacroCategorie,
  calculerVariations,
  agregerSparkline6Mois
} from '@/lib/analyses/sorties'
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

  let sortiesProps = null
  if (onglet === 'sorties') {
    const periodeActuelle = getPeriodeFromFiltreId(periode, { timezone })
    const periodePrec = periodePrecedenteAEgaleDuree(periodeActuelle)

    const untilDate = new Date(periodeActuelle.until)
    const debut6Mois = new Date(untilDate.getFullYear(), untilDate.getMonth() - 5, 1)
      .toISOString()
      .slice(0, 10)

    const [
      { data: txActuelles },
      { data: txPrec },
      { data: tx6Mois }
    ] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('parametre_id', parametre_id)
        .gte('date', periodeActuelle.since)
        .lte('date', periodeActuelle.until),
      supabase
        .from('transactions')
        .select('*')
        .eq('parametre_id', parametre_id)
        .gte('date', periodePrec.since)
        .lte('date', periodePrec.until),
      supabase
        .from('transactions')
        .select('date, categorie_pl, montant_ttc')
        .eq('parametre_id', parametre_id)
        .gte('date', debut6Mois)
        .lte('date', periodeActuelle.until)
    ])

    const macroCatsActuel = agregerParMacroCategorie(txActuelles || [])
    const macroCatsPrec = agregerParMacroCategorie(txPrec || [])
    const macroCats = calculerVariations(macroCatsActuel, macroCatsPrec)
    const sparklines = agregerSparkline6Mois(tx6Mois || [], periodeActuelle.until)
    const totalActuel = (txActuelles || []).reduce((s, t) => s + (t.montant_ttc || 0), 0)
    const totalPrecedent = (txPrec || []).reduce((s, t) => s + (t.montant_ttc || 0), 0)

    sortiesProps = {
      macroCats,
      totalActuel,
      totalPrecedent,
      sparklines,
      periode: periodeActuelle,
      periodePrecedente: periodePrec
    }
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
          <SortiesView {...sortiesProps} />
        </>
      )}

      {onglet === 'comparaison' && <ComparaisonView />}
    </div>
  )
}
