import { supabase } from '@/lib/supabase'

// TODO V1.1 (avant 2e tenant) : philosophie validée le 28 avril 2026
// = mix. Cards macro restent globales. Tableau "État par client" doit
// faire 1 query par tenant ou GROUP BY (la colonne Données CA utilise
// actuellement la même variable globale pour toutes les lignes : bug
// d'affichage dès le 2e tenant).
// Cf. session 28 avril, décision produit.

export default async function AdminMonitoring() {
  const today = new Date().toISOString().split('T')[0]
  const hier = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const il7jours = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  const { data: clients } = await supabase.from('parametres').select('*')
  const { data: dernierHistorique } = await supabase.from('historique_ca').select('date').order('date', { ascending: false }).limit(1)
  const { data: derniereTransaction } = await supabase.from('transactions').select('date').order('date', { ascending: false }).limit(1)
  const { data: derniereEntree } = await supabase.from('entrees').select('date').order('date', { ascending: false }).limit(1)
  const { count: nbTransactions } = await supabase.from('transactions').select('*', { count: 'exact', head: true })
  const { count: nbHistorique } = await supabase.from('historique_ca').select('*', { count: 'exact', head: true })
  const { count: nbEntrees } = await supabase.from('entrees').select('*', { count: 'exact', head: true })

  const derniereDateHist = dernierHistorique?.[0]?.date
  const derniereDateTx = derniereTransaction?.[0]?.date
  const derniereDateEntree = derniereEntree?.[0]?.date

  const joursDepuisHist = derniereDateHist ? Math.round((new Date(today) - new Date(derniereDateHist)) / 86400000) : null
  const joursDepuisTx = derniereDateTx ? Math.round((new Date(today) - new Date(derniereDateTx)) / 86400000) : null

  const statutHist = joursDepuisHist === null ? 'danger' : joursDepuisHist <= 1 ? 'ok' : joursDepuisHist <= 7 ? 'warning' : 'danger'
  const statutTx = joursDepuisTx === null ? 'warning' : joursDepuisTx <= 30 ? 'ok' : 'warning'

  const couleur = (s) => s === 'ok' ? 'text-green-400' : s === 'warning' ? 'text-yellow-400' : 'text-red-400'
  const bg = (s) => s === 'ok' ? 'bg-green-950/30 border-green-900' : s === 'warning' ? 'bg-yellow-950/30 border-yellow-900' : 'bg-red-950/30 border-red-900'
  const badge = (s) => s === 'ok' ? 'bg-green-950 text-green-400' : s === 'warning' ? 'bg-yellow-950 text-yellow-400' : 'bg-red-950 text-red-400'

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Monitoring</h1>
        <p className="text-gray-400 mt-1">État des données en temps réel · {today}</p>
      </div>

      {/* Alertes */}
      {(statutHist === 'danger' || statutTx === 'danger') && (
        <div className="bg-red-950/30 border border-red-900 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <span className="text-red-400 text-lg">⚠️</span>
          <div>
            <p className="text-red-400 font-semibold text-sm">Action requise</p>
            <p className="text-red-300 text-xs mt-0.5">
              {statutHist === 'danger' && `Historique CA non mis à jour depuis ${joursDepuisHist ?? '?'} jours. `}
            </p>
          </div>
        </div>
      )}

      {/* Cards état */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          {
            label: 'Historique CA',
            statut: statutHist,
            val: nbHistorique + ' jours',
            detail: derniereDateHist ? `Dernier : ${derniereDateHist} (J-${joursDepuisHist})` : 'Aucune donnée',
          },
          {
            label: 'Dépenses',
            statut: statutTx,
            val: nbTransactions?.toLocaleString('fr-FR') + ' lignes',
            detail: derniereDateTx ? `Dernière : ${derniereDateTx}` : 'Aucune donnée',
          },
          {
            label: 'Entrées manuelles',
            statut: 'ok',
            val: nbEntrees + ' entrées',
            detail: derniereDateEntree ? `Dernière : ${derniereDateEntree}` : 'Aucune entrée',
          },
        ].map(card => (
          <div key={card.label} className={"rounded-2xl p-6 border " + bg(card.statut)}>
            <div className="flex justify-between items-start mb-3">
              <p className="text-sm text-gray-400">{card.label}</p>
              <span className={"px-2 py-0.5 rounded-full text-xs " + badge(card.statut)}>
                {card.statut === 'ok' ? '✓ OK' : card.statut === 'warning' ? '⚠ Warning' : '✕ Alerte'}
              </span>
            </div>
            <p className={"text-2xl font-bold font-mono " + couleur(card.statut)}>{card.val}</p>
            <p className="text-xs text-gray-500 mt-1">{card.detail}</p>
          </div>
        ))}
      </div>

      {/* Clients */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="font-semibold">État par client</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-800">
              <th className="px-6 py-3">Client</th>
              <th className="px-6 py-3">Connecteur</th>
              <th className="px-6 py-3">Plan</th>
              <th className="px-6 py-3">Statut</th>
              <th className="px-6 py-3">Données CA</th>
            </tr>
          </thead>
          <tbody>
            {(clients || []).map(c => (
              <tr key={c.id} className="border-b border-gray-800 last:border-0">
                <td className="px-6 py-4 font-medium">{c.nom_restaurant || '—'}</td>
                <td className="px-6 py-4">
                  <span className={"px-2 py-1 rounded-full text-xs " + (c.connecteur === 'popina' ? 'bg-blue-950 text-blue-400' : 'bg-gray-800 text-gray-400')}>
                    {c.connecteur || 'manuel'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-400">{c.plan || 'starter'}</td>
                <td className="px-6 py-4">
                  <span className={"px-2 py-1 rounded-full text-xs " + (c.actif !== false ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400')}>
                    {c.actif !== false ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 rounded-full text-xs bg-green-950 text-green-400">
                    {derniereDateHist ? `J-${joursDepuisHist}` : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}