import { getDailyKPIs, getWeeklyData } from '@/lib/popina'

export default async function Dashboard() {
  const today = new Date().toISOString().split('T')[0]
  const [kpis, weekly] = await Promise.all([
    getDailyKPIs(today),
    getWeeklyData()
  ])

  const fmt = (n) => new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(n)

  const maxCA = Math.max(...weekly.map(j => j.ca))

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mon Business</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm">
          K
        </div>
      </div>

      {kpis.hasData ? (
        <>
          {/* CA HERO */}
          <div className="bg-gray-900 rounded-2xl p-4 mb-3 border border-gray-800">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Chiffre d'affaires</p>
                <p className="text-4xl font-bold tracking-tight">{fmt(kpis.ca.brut)}</p>
                <p className="text-gray-500 text-xs mt-1">HT {fmt(kpis.ca.ht)}</p>
              </div>
              <div className="text-right">
                <span className="bg-green-900 text-green-400 text-xs px-2 py-1 rounded-full border border-green-800">
                  {kpis.frequentation.nbCommandes} cmd
                </span>
              </div>
            </div>

            {/* RÉPARTITION CANAUX */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="text-sm text-gray-300">Caisse / Borne</span>
                </div>
                <span className="text-sm font-mono font-medium">{fmt(kpis.canaux.caisse)}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  <span className="text-sm text-gray-300">Foxorder (en ligne)</span>
                </div>
                <span className="text-sm font-mono font-medium">{fmt(kpis.canaux.online)}</span>
              </div>
            </div>

            {/* BARRE PROPORTION */}
            <div className="flex gap-0.5 mt-3 h-1.5 rounded-full overflow-hidden">
              <div className="bg-blue-500" style={{ flex: kpis.canaux.caisse }}></div>
              <div className="bg-orange-500" style={{ flex: kpis.canaux.online }}></div>
            </div>

            {/* COMMISSIONS */}
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-800">
              <span className="text-xs text-gray-400">Commissions estimées</span>
              <span className="text-xs font-mono text-red-400">
                -{fmt(kpis.commissions.cb + kpis.commissions.tr)}
              </span>
            </div>
          </div>

          {/* KPI GRID */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Commandes</p>
              <p className="text-xl font-bold font-mono">{kpis.frequentation.nbCommandes}</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Panier</p>
              <p className="text-xl font-bold font-mono">{fmt(kpis.panierMoyen)}</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Espèces</p>
              <p className="text-xl font-bold font-mono text-yellow-400">{fmt(kpis.cashADeposer)}</p>
            </div>
          </div>

          {/* PAIEMENTS */}
          <div className="bg-gray-900 rounded-2xl p-4 mb-3 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-widest mb-3">Encaissements</p>
            <div className="space-y-2">
              {[
                { label: 'Borne', val: kpis.paiements.borne, color: 'bg-blue-500' },
                { label: 'Carte bancaire', val: kpis.paiements.cb, color: 'bg-indigo-500' },
                { label: 'Espèces', val: kpis.paiements.especes, color: 'bg-yellow-500' },
                { label: 'Titres-restaurant', val: kpis.paiements.tr, color: 'bg-purple-500' },
              ].filter(p => p.val > 0).map(p => (
                <div key={p.label} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${p.color} flex-shrink-0`}></div>
                  <span className="text-sm text-gray-300 flex-1">{p.label}</span>
                  <span className="text-sm font-mono font-medium">{fmt(p.val)}</span>
                  <span className="text-xs text-gray-500 w-10 text-right">
                    {(p.val / kpis.ca.brut * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* CASH À DÉPOSER */}
          <div className="bg-yellow-950 rounded-2xl p-4 mb-3 border border-yellow-900 flex justify-between items-center">
            <div>
              <p className="text-yellow-500 text-xs font-medium mb-1">💵 Cash à déposer</p>
              <p className="text-2xl font-bold font-mono">{fmt(kpis.cashADeposer)}</p>
              <p className="text-yellow-700 text-xs mt-1">Espèces encaissées aujourd'hui</p>
            </div>
          </div>

          {/* GRAPHE 7 JOURS */}
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-widest mb-4">CA — 7 derniers jours</p>
            <div className="flex items-end gap-1.5 h-20">
              {weekly.map((jour, i) => (
                <div key={jour.date} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t ${i === weekly.length - 1 ? 'bg-blue-500' : 'bg-gray-700'}`}
                    style={{ height: maxCA > 0 ? `${(jour.ca / maxCA) * 100}%` : '4px', minHeight: '4px' }}
                  ></div>
                  <span className="text-gray-500 text-xs">{jour.label}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-3 pt-3 border-t border-gray-800">
              <span className="text-xs text-gray-400">Total 7j</span>
              <span className="text-xs font-mono font-medium">{fmt(weekly.reduce((s, j) => s + j.ca, 0))}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-gray-900 rounded-2xl p-8 text-center border border-gray-800">
          <p className="text-gray-400">Pas de données pour aujourd'hui</p>
        </div>
      )}
    </div>
  )
}