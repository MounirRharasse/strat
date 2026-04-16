import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default async function AdminClients() {
  const { data: clients } = await supabase.from('parametres').select('*')

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Clients</h1>
          <p className="text-gray-400 mt-1">{clients?.length || 0} client(s) au total</p>
        </div>
        <Link href="/admin/clients/nouveau"
          className="bg-white text-gray-950 px-4 py-2 rounded-xl font-semibold text-sm hover:bg-gray-100 transition">
          + Nouveau client
        </Link>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-800">
              <th className="px-6 py-4">Restaurant</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Connecteur</th>
              <th className="px-6 py-4">Objectif CA</th>
              <th className="px-6 py-4">Plan</th>
              <th className="px-6 py-4">Statut</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody>
            {(clients || []).map(c => (
              <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800/30 transition">
                <td className="px-6 py-4">
                  <p className="font-medium">{c.nom_restaurant || '—'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.type_restaurant || '—'}</p>
                </td>
                <td className="px-6 py-4 text-gray-400 text-sm">{c.type_restaurant || '—'}</td>
                <td className="px-6 py-4">
                  <span className={"px-2 py-1 rounded-full text-xs " + (c.connecteur === 'popina' ? 'bg-blue-950 text-blue-400' : 'bg-gray-800 text-gray-400')}>
                    {c.connecteur || 'manuel'}
                  </span>
                </td>
                <td className="px-6 py-4 font-mono text-sm text-gray-300">
                  {c.objectif_ca ? c.objectif_ca.toLocaleString('fr-FR') + ' €' : '—'}
                </td>
                <td className="px-6 py-4">
                  <span className={"px-2 py-1 rounded-full text-xs " + (c.plan === 'pro' ? 'bg-purple-950 text-purple-400' : 'bg-gray-800 text-gray-400')}>
                    {c.plan || 'starter'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={"px-2 py-1 rounded-full text-xs " + (c.actif !== false ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400')}>
                    {c.actif !== false ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <Link href={"/admin/clients/" + c.id}
                    className="text-xs text-blue-400 hover:text-blue-300 transition">
                    Gérer →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}