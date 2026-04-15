import { supabase } from '@/lib/supabase'
import { getDailyKPIs } from '@/lib/popina'
import Link from 'next/link'

export default async function Journal({ searchParams }) {
  const today = new Date().toISOString().split('T')[0]
  const periode = searchParams?.periode || 'today'
  const type = searchParams?.type || 'all'

  let since = today
  if (periode === 'week') since = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  if (periode === 'month') since = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  const [{ data: transactions }, kpis] = await Promise.all([
    supabase.from('transactions').select('*').gte('date', since).order('date', { ascending: false }).order('created_at', { ascending: false }),
    getDailyKPIs(today)
  ])

  const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)

  const byDate = {}
  for (const t of transactions || []) {
    if (!byDate[t.date]) byDate[t.date] = []
    byDate[t.date].push(t)
  }

  const totalDepenses = (transactions || []).reduce((s, t) => s + t.montant_ttc, 0)
  const depensesAujourdhui = (byDate[today] || []).reduce((s, t) => s + t.montant_ttc, 0)
  const showEntrees = type === 'all' || type === 'entrees'
  const showDepenses = type === 'all' || type === 'depenses'

  const getIcon = (cat) => {
    const icons = { consommations: '🛒', energie: '⚡', loyers_charges: '🏪', prestations_operationnelles: '📱', honoraires: '📋', redevance_marque: '™️', entretiens_reparations: '🔧', frais_deplacement: '🚗' }
    if (cat?.includes('personnel')) return '👥'
    return icons[cat] || '💸'
  }

  const getCatLabel = (cat) => {
    const labels = { consommations: 'Consommations', frais_personnel: 'Frais personnel', autres_charges_personnel: 'Autres charges personnel', energie: 'Energie', loyers_charges: 'Loyers et Charges', honoraires: 'Honoraires', redevance_marque: 'Redevance de Marque', prestations_operationnelles: 'Prestations', frais_divers: 'Frais Divers', autres_charges: 'Autres charges' }
    return labels[cat] || cat
  }

  const getCatColor = (cat) => {
    const colors = { consommations: 'text-orange-400', frais_personnel: 'text-blue-400', autres_charges_personnel: 'text-blue-300', energie: 'text-green-400', loyers_charges: 'text-purple-400', prestations_operationnelles: 'text-red-400', honoraires: 'text-purple-300', redevance_marque: 'text-pink-400' }
    return colors[cat] || 'text-gray-400'
  }

  const TxRow = ({ t }) => (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0">
      <div className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center">{getIcon(t.categorie_pl)}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{t.fournisseur_nom}</p>
        <p className={"text-xs mt-0.5 " + getCatColor(t.categorie_pl)}>{getCatLabel(t.categorie_pl)}</p>
        {t.note && <p className="text-xs text-gray-500 mt-0.5">{t.note}</p>}
      </div>
      <div className="text-right">
        <p className="text-sm font-mono font-semibold text-red-400">-{fmt(t.montant_ttc)}</p>
        <p className="text-xs text-gray-500">HT {fmt(t.montant_ht)}</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto pb-24">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/dashboard" className="w-9 h-9 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="10,3 5,8 10,13"/></svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Journal</h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Depenses</p>
          <p className="text-base font-mono font-bold text-red-400">-{fmt(totalDepenses)}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-2">
        <Link href="/journal?periode=today&type=all" className={"flex-1 text-center text-xs py-2 rounded-xl border " + (periode === 'today' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>Auj.</Link>
        <Link href="/journal?periode=week&type=all" className={"flex-1 text-center text-xs py-2 rounded-xl border " + (periode === 'week' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>7 jours</Link>
        <Link href="/journal?periode=month&type=all" className={"flex-1 text-center text-xs py-2 rounded-xl border " + (periode === 'month' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>30 jours</Link>
      </div>

      <div className="flex gap-2 mb-4">
        <Link href={"/journal?periode=" + periode + "&type=all"} className={"flex-1 text-center text-xs py-2 rounded-xl border " + (type === 'all' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>Tout</Link>
        <Link href={"/journal?periode=" + periode + "&type=entrees"} className={"flex-1 text-center text-xs py-2 rounded-xl border " + (type === 'entrees' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>Entrees</Link>
        <Link href={"/journal?periode=" + periode + "&type=depenses"} className={"flex-1 text-center text-xs py-2 rounded-xl border " + (type === 'depenses' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>Depenses</Link>
      </div>

      {periode === 'today' && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-4">
          {showEntrees && kpis.hasData && (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
                <div className="w-9 h-9 rounded-xl bg-green-950 border border-green-900 flex items-center justify-center">💰</div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Ventes caisse</p>
                  <p className="text-xs text-green-400">{kpis.frequentation.nbCommandes} commandes</p>
                </div>
                <p className="text-sm font-mono font-semibold text-green-400">+{fmt(kpis.canaux.caisse)}</p>
              </div>
              {kpis.canaux.online > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
                  <div className="w-9 h-9 rounded-xl bg-orange-950 border border-orange-900 flex items-center justify-center">🛵</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Foxorder</p>
                    <p className="text-xs text-orange-400">En ligne</p>
                  </div>
                  <p className="text-sm font-mono font-semibold text-orange-400">+{fmt(kpis.canaux.online)}</p>
                </div>
              )}
            </>
          )}
          {showDepenses && (byDate[today] || []).map((t) => <TxRow key={t.id} t={t} />)}
          {showDepenses && !(byDate[today] || []).length && (
            <p className="text-xs text-gray-500 text-center px-4 py-3">Aucune depense saisie</p>
          )}
          {type === 'all' && kpis.hasData && (
            <div className="flex justify-between items-center px-4 py-3 bg-gray-800/50 border-t border-gray-700">
              <span className="text-xs text-gray-400 font-medium">Resultat du jour</span>
              <span className={"text-sm font-mono font-bold " + (kpis.ca.brut - depensesAujourdhui > 0 ? 'text-green-400' : 'text-red-400')}>{fmt(kpis.ca.brut - depensesAujourdhui)}</span>
            </div>
          )}
        </div>
      )}

      {periode !== 'today' && showDepenses && Object.entries(byDate).map(([date, txs]) => {
        const totalJour = txs.reduce((s, t) => s + t.montant_ttc, 0)
        const dateObj = new Date(date + 'T00:00:00')
        const labelDate = date === today ? "Aujourd'hui" : dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
        return (
          <div key={date} className="mb-4">
            <div className="flex justify-between items-center mb-2 px-1">
              <span className="text-sm font-medium text-gray-300 capitalize">{labelDate}</span>
              <span className="text-sm font-mono font-semibold text-red-400">-{fmt(totalJour)}</span>
            </div>
            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
              {txs.map((t) => <TxRow key={t.id} t={t} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}