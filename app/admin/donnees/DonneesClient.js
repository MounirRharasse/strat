'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import * as XLSX from 'xlsx'

export default function DonneesClient({ data, total, onglet, page, limit }) {
  const router = useRouter()
  const [editRow, setEditRow] = useState(null)
  const [editData, setEditData] = useState({})
  const [saving, setSaving] = useState(false)

  const totalPages = Math.ceil(total / limit)

  function nav(o, p) {
    router.push(`/admin/donnees?onglet=${o}&page=${p}`)
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, onglet)
    XLSX.writeFile(wb, `export_${onglet}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  async function sauvegarder(id) {
    setSaving(true)
    const table = onglet === 'ca' ? 'historique_ca' : 'transactions'
    await fetch(`/api/admin/donnees`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, id, data: editData })
    })
    setSaving(false)
    setEditRow(null)
    router.refresh()
  }

  async function supprimer(id) {
    if (!confirm('Supprimer cette ligne ?')) return
    const table = onglet === 'ca' ? 'historique_ca' : 'transactions'
    await fetch(`/api/admin/donnees`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, id })
    })
    router.refresh()
  }

  const fmt = (n) => n != null ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n) : '—'

  const colonnesCA = ['date', 'ca_brut', 'ca_ht', 'uber', 'uber_manuel', 'especes', 'cb', 'tpa', 'tr', 'nb_commandes', 'cmd_manuel']
  const colonnesDepenses = ['date', 'fournisseur_nom', 'montant_ttc', 'montant_ht', 'taux_tva', 'categorie_pl', 'sous_categorie', 'note']

  const colonnes = onglet === 'ca' ? colonnesCA : colonnesDepenses

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Données</h1>
          <p className="text-gray-400 mt-1">{total.toLocaleString('fr-FR')} lignes au total</p>
        </div>
        <button onClick={exportExcel}
          className="px-4 py-2 rounded-xl border border-gray-700 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition">
          ↓ Exporter Excel
        </button>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'ca', label: 'CA Historique' },
          { key: 'depenses', label: 'Dépenses' },
        ].map(o => (
          <button key={o.key} onClick={() => nav(o.key, 1)}
            className={"px-4 py-2 rounded-xl text-sm font-medium border transition " + (onglet === o.key ? 'bg-white text-gray-950 border-white' : 'bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-600')}>
            {o.label}
          </button>
        ))}
      </div>

      {/* Tableau */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase">
                {colonnes.map(c => (
                  <th key={c} className="px-4 py-3 text-left whitespace-nowrap">{c.replace(/_/g, ' ')}</th>
                ))}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={row.id || i} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/30">
                  {colonnes.map(c => (
                    <td key={c} className="px-4 py-3 whitespace-nowrap">
                      {editRow === row.id ? (
                        <input
                          value={editData[c] ?? row[c] ?? ''}
                          onChange={e => setEditData(prev => ({ ...prev, [c]: e.target.value }))}
                          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs w-24 text-white focus:outline-none"
                        />
                      ) : (
                        <span className={c === 'date' ? 'font-mono text-gray-300' : typeof row[c] === 'number' ? 'font-mono text-gray-200' : 'text-gray-400'}>
                          {c === 'date' ? row[c] : typeof row[c] === 'number' ? fmt(row[c]) : row[c] || '—'}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {editRow === row.id ? (
                      <div className="flex gap-2">
                        <button onClick={() => sauvegarder(row.id)} disabled={saving}
                          className="text-xs text-green-400 hover:text-green-300">
                          {saving ? '...' : '✓'}
                        </button>
                        <button onClick={() => setEditRow(null)} className="text-xs text-gray-500 hover:text-gray-300">✕</button>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <button onClick={() => { setEditRow(row.id); setEditData({}) }}
                          className="text-xs text-blue-400 hover:text-blue-300">Modifier</button>
                        <button onClick={() => supprimer(row.id)}
                          className="text-xs text-red-400 hover:text-red-300">Suppr.</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center">
        <p className="text-xs text-gray-500">
          Page {page} / {totalPages} · {((page - 1) * limit) + 1}-{Math.min(page * limit, total)} sur {total.toLocaleString('fr-FR')}
        </p>
        <div className="flex gap-2">
          <button onClick={() => nav(onglet, page - 1)} disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-700 text-sm text-gray-400 disabled:opacity-30 hover:text-white hover:border-gray-500 transition">
            ← Précédent
          </button>
          <button onClick={() => nav(onglet, page + 1)} disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-700 text-sm text-gray-400 disabled:opacity-30 hover:text-white hover:border-gray-500 transition">
            Suivant →
          </button>
        </div>
      </div>
    </div>
  )
}