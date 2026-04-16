'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function JournalClient({ transactions, entrees, historique, kpis, today, yesterday, periode, type }) {
  const [localEntrees, setLocalEntrees] = useState(entrees)
  const [deletingId, setDeletingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editMontant, setEditMontant] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editNbCommandes, setEditNbCommandes] = useState('')

  const fmt = (n) => new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 2
  }).format(n || 0)

  const CATEGORIE_LABELS = {
    consommations: 'Consommations',
    frais_personnel: 'Frais personnel',
    autres_charges_personnel: 'Autres charges personnel',
    frais_deplacement: 'Frais deplacement',
    entretiens_reparations: 'Entretiens et Reparations',
    energie: 'Energie',
    autres_frais_influencables: 'Autres frais',
    loyers_charges: 'Loyers et Charges',
    honoraires: 'Honoraires',
    redevance_marque: 'Redevance de Marque',
    prestations_operationnelles: 'Prestations',
    frais_divers: 'Frais Divers',
    autres_charges: 'Autres charges',
    impots_benefices: 'Impots sur les benefices'
  }

  const CATEGORIE_COLORS = {
    consommations: 'text-orange-400',
    frais_personnel: 'text-blue-400',
    autres_charges_personnel: 'text-blue-300',
    energie: 'text-green-400',
    loyers_charges: 'text-purple-400',
    prestations_operationnelles: 'text-red-400',
    honoraires: 'text-purple-300',
    redevance_marque: 'text-pink-400',
  }

  const getIcon = (cat) => {
    const icons = { consommations: '🛒', energie: '⚡', loyers_charges: '🏪', prestations_operationnelles: '📱', honoraires: '📋', redevance_marque: '™️', entretiens_reparations: '🔧', frais_deplacement: '🚗' }
    if (cat?.includes('personnel')) return '👥'
    return icons[cat] || '💸'
  }

  const SOURCE_LABELS = { uber_eats: 'Uber Eats', deliveroo: 'Deliveroo', just_eat: 'Just Eat', autre_livraison: 'Autre livraison', autre_entree: 'Autre entree' }
  const SOURCE_ICONS = { uber_eats: '🛵', deliveroo: '🦘', just_eat: '🍔', autre_livraison: '📦', autre_entree: '💰' }

  async function supprimerEntree(id) {
    if (!confirm('Supprimer cette entree ?')) return
    setDeletingId(id)
    const res = await fetch('/api/entrees?id=' + id, { method: 'DELETE' })
    if (res.ok) setLocalEntrees(prev => prev.filter(e => e.id !== id))
    setDeletingId(null)
  }

  async function modifierEntree(e) {
    const res = await fetch('/api/entrees?id=' + e.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        montant_ttc: parseFloat(editMontant),
        taux_tva: e.taux_tva,
        note: editNote,
        nb_commandes: parseInt(editNbCommandes) || 0
      })
    })
    if (res.ok) {
      const updated = await res.json()
      setLocalEntrees(prev => prev.map(x => x.id === e.id ? updated : x))
      setEditingId(null)
    }
  }

  function ouvrirEdition(e) {
    setEditingId(e.id)
    setEditMontant(e.montant_ttc)
    setEditNote(e.note || '')
    setEditNbCommandes(e.nb_commandes || '')
  }

  const totalDepenses = transactions.reduce((s, t) => s + t.montant_ttc, 0)
  const depensesAujourdhui = transactions.filter(t => t.date === today).reduce((s, t) => s + t.montant_ttc, 0)
  const entreesUberAujourdhui = localEntrees.filter(e => e.date === today || e.date === yesterday).reduce((s, e) => s + e.montant_ttc, 0)

  const byDate = {}
  for (const t of transactions) {
    if (!byDate[t.date]) byDate[t.date] = []
    byDate[t.date].push(t)
  }

  const showEntrees = type === 'all' || type === 'entrees'
  const showDepenses = type === 'all' || type === 'depenses'

  const EntreeRow = ({ e }) => (
    <div className="border-b border-gray-800 last:border-0">
      {editingId === e.id ? (
        <div className="px-4 py-3">
          <p className="text-xs text-gray-400 mb-2">{SOURCE_LABELS[e.source]}</p>
          <div className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2 mb-2">
            <span className="text-gray-400">€</span>
            <input type="number" value={editMontant} onChange={ev => setEditMontant(ev.target.value)}
              className="flex-1 bg-transparent text-white font-mono focus:outline-none" autoFocus />
          </div>
          {e.source === 'uber_eats' && (
  <div className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2 mb-2">
    <span className="text-gray-400 text-sm">Nb commandes</span>
    <input type="number" defaultValue={editNbCommandes}
      onBlur={ev => setEditNbCommandes(ev.target.value)}
      className="flex-1 bg-transparent text-white font-mono text-right focus:outline-none" placeholder="0" />
  </div>
)}
          <input type="text" value={editNote} onChange={ev => setEditNote(ev.target.value)}
            placeholder="Note (optionnel)"
            className="w-full bg-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none mb-2" />
          <div className="flex gap-2">
            <button onClick={() => modifierEntree(e)} className="flex-1 bg-white text-gray-950 text-xs font-semibold rounded-xl py-2">Enregistrer</button>
            <button onClick={() => setEditingId(null)} className="flex-1 bg-gray-800 text-gray-400 text-xs rounded-xl py-2">Annuler</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-green-950 border border-green-900 flex items-center justify-center">
            {SOURCE_ICONS[e.source] || '💰'}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{SOURCE_LABELS[e.source] || e.source}</p>
            <p className="text-xs text-green-400">Entree manuelle · {e.date}</p>
            {e.nb_commandes > 0 && <p className="text-xs text-gray-500">{e.nb_commandes} commandes</p>}
            {e.note && <p className="text-xs text-gray-500">{e.note}</p>}
          </div>
          <div className="text-right">
            <p className="text-sm font-mono font-semibold text-green-400">+{fmt(e.montant_ttc)}</p>
            <div className="flex gap-2 mt-1 justify-end">
              <button onClick={() => ouvrirEdition(e)} className="text-xs text-blue-400">Modifier</button>
              <button onClick={() => supprimerEntree(e.id)} disabled={deletingId === e.id}
                className="text-xs text-red-500">{deletingId === e.id ? '...' : 'Suppr.'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto pb-24">

      <div className="flex items-center gap-3 mb-4">
        <Link href="/dashboard" className="w-9 h-9 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <polyline points="10,3 5,8 10,13"/>
          </svg>
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
        <a href="/journal?periode=today&type=all" className={"flex-1 text-center text-xs py-2 rounded-xl border " + (periode === 'today' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>Auj.</a>
        <a href="/journal?periode=week&type=all" className={"flex-1 text-center text-xs py-2 rounded-xl border " + (periode === 'week' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>7 jours</a>
        <a href="/journal?periode=month&type=all" className={"flex-1 text-center text-xs py-2 rounded-xl border " + (periode === 'month' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>30 jours</a>
      </div>

      <div className="flex gap-2 mb-4">
        <a href={"/journal?periode=" + periode + "&type=all"} className={"flex-1 text-center text-xs py-2 rounded-xl border " + (type === 'all' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>Tout</a>
        <a href={"/journal?periode=" + periode + "&type=entrees"} className={"flex-1 text-center text-xs py-2 rounded-xl border " + (type === 'entrees' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>Entrees</a>
        <a href={"/journal?periode=" + periode + "&type=depenses"} className={"flex-1 text-center text-xs py-2 rounded-xl border " + (type === 'depenses' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>Depenses</a>
      </div>

      {/* AUJOURD'HUI */}
      {periode === 'today' && (
        <div className="mb-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">

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

            {showEntrees && localEntrees.filter(e => e.date === today || e.date === yesterday).map((e) => (
              <EntreeRow key={e.id} e={e} />
            ))}

            {showDepenses && (byDate[today] || []).map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0">
                <div className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center">{getIcon(t.categorie_pl)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.fournisseur_nom}</p>
                  <p className={"text-xs mt-0.5 " + (CATEGORIE_COLORS[t.categorie_pl] || 'text-gray-400')}>{CATEGORIE_LABELS[t.categorie_pl] || t.categorie_pl}</p>
                  {t.note && <p className="text-xs text-gray-500">{t.note}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono font-semibold text-red-400">-{fmt(t.montant_ttc)}</p>
                  <p className="text-xs text-gray-500">HT {fmt(t.montant_ht)}</p>
                </div>
              </div>
            ))}

            {type === 'all' && kpis.hasData && (
              <div className="flex justify-between items-center px-4 py-3 bg-gray-800/50 border-t border-gray-700">
                <span className="text-xs text-gray-400 font-medium">Resultat du jour</span>
                <span className={"text-sm font-mono font-bold " + (kpis.ca.brut + entreesUberAujourdhui - depensesAujourdhui > 0 ? 'text-green-400' : 'text-red-400')}>
                  {fmt(kpis.ca.brut + entreesUberAujourdhui - depensesAujourdhui)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* JOURS PRECEDENTS */}
      {periode !== 'today' && (
        <div>
          {showEntrees && (historique || []).filter(h => h.uber > 0).length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">CA Uber Eats</p>
              <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                {(historique || []).filter(h => h.uber > 0).map(h => (
                  <div key={'uber-' + h.date} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0">
                    <div className="w-9 h-9 rounded-xl bg-green-950 border border-green-900 flex items-center justify-center">🛵</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Uber Eats</p>
                      <p className="text-xs text-gray-500 capitalize">{new Date(h.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                      {h.nb_commandes > 0 && <p className="text-xs text-green-400">{h.nb_commandes} commandes</p>}
                    </div>
                    <p className="text-sm font-mono font-semibold text-green-400">+{fmt(h.uber)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showEntrees && localEntrees.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Entrees manuelles</p>
              <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                {localEntrees.map((e) => <EntreeRow key={e.id} e={e} />)}
              </div>
            </div>
          )}

          {showDepenses && Object.entries(byDate).map(([date, txs]) => {
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
                  {txs.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0">
                      <div className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center">{getIcon(t.categorie_pl)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.fournisseur_nom}</p>
                        <p className={"text-xs mt-0.5 " + (CATEGORIE_COLORS[t.categorie_pl] || 'text-gray-400')}>{CATEGORIE_LABELS[t.categorie_pl] || t.categorie_pl}</p>
                        {t.note && <p className="text-xs text-gray-500 truncate">{t.note}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-semibold text-red-400">-{fmt(t.montant_ttc)}</p>
                        <p className="text-xs text-gray-500">HT {fmt(t.montant_ht)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}