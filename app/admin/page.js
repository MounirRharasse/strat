import { supabase } from '@/lib/supabase'

export default async function AdminDashboard() {
  const { data: clients } = await supabase.from('parametres').select('*')
  const { data: transactions } = await supabase.from('transactions').select('id', { count: 'exact' })
  const { data: entrees } = await supabase.from('entrees').select('id', { count: 'exact' })
  const { data: historique } = await supabase.from('historique_ca').select('date').order('date', { ascending: false }).limit(1)

  const nbClients = clients?.length || 0
  const nbTransactions = transactions?.length || 0
  const nbEntrees = entrees?.length || 0
  const derniereDate = historique?.[0]?.date || 'N/A'

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Vue générale</h1>
        <p className="text-gray-400 mt-1">Tableau de bord administrateur</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Clients actifs', val: nbClients, color: 'text-green-400' },
          { label: 'Dépenses importées', val: nbTransactions.toLocaleString('fr-FR'), color: 'text-blue-400' },
          { label: 'Entrées manuelles', val: nbEntrees, color: 'text-purple-400' },
          { label: 'Dernier historique CA', val: derniereDate, color: 'text-yellow-400' },
        ].map(card => (
          <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{card.label}</p>
            <p className={"text-2xl font-bold font-mono " + card.color}>{card.val}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">Clients</h2>
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-800">
              <th className="pb-3">Restaurant</th>
              <th className="pb-3">Type</th>
              <th className="pb-3">Connecteur</th>
              <th className="pb-3">Objectif CA</th>
              <th className="pb-3">Plan</th>
              <th className="pb-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {(clients || []).map(c => (
              <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                <td className="py-3 font-medium">{c.nom_restaurant || '—'}</td>
                <td className="py-3 text-gray-400 text-sm">{c.type_restaurant || '—'}</td>
                <td className="py-3 text-sm">
                  <span className="px-2 py-1 rounded-full bg-blue-950 text-blue-400 text-xs">{c.connecteur || 'manuel'}</span>
                </td>
                <td className="py-3 text-gray-300 font-mono text-sm">{c.objectif_ca ? c.objectif_ca.toLocaleString('fr-FR') + ' €' : '—'}</td>
                <td className="py-3 text-sm">
                  <span className="px-2 py-1 rounded-full bg-gray-800 text-gray-400 text-xs">{c.plan || 'starter'}</span>
                </td>
                <td className="py-3">
                  <span className={"px-2 py-1 rounded-full text-xs " + (c.actif !== false ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400')}>
                    {c.actif !== false ? 'Actif' : 'Inactif'}
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