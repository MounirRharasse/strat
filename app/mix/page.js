import { getMixVentes } from '@/lib/popina'
import Link from 'next/link'

export default async function MixVentes({ searchParams }) {
  const today = new Date().toISOString().split('T')[0]
  const periode = searchParams?.periode || 'today'
  const vue = searchParams?.vue || 'top'

  let since = today
  if (periode === 'week') since = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  if (periode === 'month') since = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  const mix = await getMixVentes(since, today)

  const fmt = (n) => new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(n)

  const produits = vue === 'top' ? (mix.top || []) : (mix.flop || [])
  const maxCA = produits.length > 0 ? produits[0].ca : 1

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto pb-24">

      <div className="flex items-center gap-3 mb-4">
        <Link href="/dashboard" className="w-9 h-9 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <polyline points="10,3 5,8 10,13"/>
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Mix ventes</h1>
        </div>
        {mix.hasData && (
          <div className="text-right">
            <p className="text-xs text-gray-400">CA periode</p>
            <p className="text-base font-mono font-bold text-green-400">{fmt(mix.caTotal)}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-2">
        <Link href="/mix?periode=today&vue=top" className={"flex-1 text-center text-xs py-2 rounded-xl border " + (periode === 'today' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>Auj.</Link>
        <Link href="/mix?periode=week&vue=top" className={"flex-1 text-center text-xs py-2 rounded-xl border " + (periode === 'week' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>7 jours</Link>
        <Link href="/mix?periode=month&vue=top" className={"flex-1 text-center text-xs py-2 rounded-xl border " + (periode === 'month' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>30 jours</Link>
      </div>

      <div className="flex gap-2 mb-4">
        <Link href={"/mix?periode=" + periode + "&vue=top"} className={"flex-1 text-center text-xs py-2 rounded-xl border " + (vue === 'top' ? 'bg-green-900 text-green-400 border-green-800 font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>Top ventes</Link>
        <Link href={"/mix?periode=" + periode + "&vue=flop"} className={"flex-1 text-center text-xs py-2 rounded-xl border " + (vue === 'flop' ? 'bg-red-900 text-red-400 border-red-800 font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>Flop ventes</Link>
      </div>

      {!mix.hasData ? (
        <div className="bg-gray-900 rounded-2xl p-8 text-center border border-gray-800">
          <p className="text-gray-400">Pas de donnees pour cette periode</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-4 text-xs text-gray-500 px-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>Caisse</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block"></span>Foxorder</span>
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            {produits.map((p, i) => (
              <div key={p.nom + i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0">
                <div className="w-7 text-center flex-shrink-0">
                  <span className="text-sm font-mono text-gray-500">{i + 1}</span>
                </div>
                <div className={"w-2 h-2 rounded-full flex-shrink-0 " + (p.canal === 'online' ? 'bg-orange-500' : 'bg-blue-500')}></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.nom}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                      <div
                        className={"h-1.5 rounded-full " + (vue === 'top' ? 'bg-green-500' : 'bg-red-500')}
                        style={{ width: (p.ca / maxCA * 100) + '%' }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-500 flex-shrink-0">{p.pctCA}%</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={"text-sm font-mono font-semibold " + (vue === 'top' ? 'text-green-400' : 'text-red-400')}>{fmt(p.ca)}</p>
                  <p className="text-xs text-gray-500">x{p.quantite}</p>
                </div>
              </div>
            ))}
          </div>

          {mix.repartitionCanal && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mt-3">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Repartition canaux</p>
              <div className="flex gap-0.5 h-2 rounded-full overflow-hidden mb-2">
                <div className="bg-blue-500" style={{ flex: mix.repartitionCanal.caisse }}></div>
                <div className="bg-orange-500" style={{ flex: mix.repartitionCanal.online }}></div>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Caisse <span className="text-white font-mono">{fmt(mix.repartitionCanal.caisse)}</span> ({mix.repartitionCanal.caisseP}%)</span>
                <span className="text-gray-400">Foxorder <span className="text-white font-mono">{fmt(mix.repartitionCanal.online)}</span> ({mix.repartitionCanal.onlineP}%)</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}