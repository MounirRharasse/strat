'use client'

// Section "Suggestions à valider" sur /previsions.
// Lot 4 Charges Récurrentes V1.1.
//
// Affiche les charges_suggestions statut='pending' du mois courant.
// 3 actions par card : Valider (1-clic), Modifier (édit montant), Ignorer.
//
// Bannière oublis : si une suggestion pending a date_attendue + 5j < today,
// elle est marquée "⚠ oubli détecté" en rouge en haut de la liste.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const fmtEur = (n) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 2
}).format(n || 0)

const fmtJour = (iso) => {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

function isOubli(dateAttendue) {
  const attendue = new Date(dateAttendue + 'T12:00:00')
  const today = new Date()
  const diffJours = Math.floor((today - attendue) / 86400000)
  return diffJours > 5
}

export default function ChargesSuggestions({ suggestions, charges }) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState(null)
  const [editId, setEditId] = useState(null)
  const [editMontant, setEditMontant] = useState('')
  const [errorMsg, setErrorMsg] = useState(null)

  // Map charge_recurrente_id → charge (pour affichage libellé/icone)
  const chargeMap = Object.fromEntries((charges || []).map(c => [c.id, c]))

  // Tri : oublis d'abord, puis par date attendue croissante
  const sorted = [...(suggestions || [])].sort((a, b) => {
    const oa = isOubli(a.date_attendue), ob = isOubli(b.date_attendue)
    if (oa !== ob) return oa ? -1 : 1
    return a.date_attendue.localeCompare(b.date_attendue)
  })

  const oublisCount = sorted.filter(s => isOubli(s.date_attendue)).length

  async function valider(suggestion, montantOverride = null) {
    setLoadingId(suggestion.id); setErrorMsg(null)
    try {
      const res = await fetch(`/api/charges-suggestions/${suggestion.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(montantOverride ? { montant_modifie: montantOverride } : {})
      })
      const data = await res.json()
      if (res.status === 409) {
        if (data.transaction_id) {
          setErrorMsg('Suggestion déjà validée (transaction #' + String(data.transaction_id).slice(0, 8) + ')')
        } else {
          setErrorMsg('Doublon : transaction similaire existe déjà ce mois (#' + String(data.existing_transaction_id || '').slice(0, 8) + ')')
        }
        return
      }
      if (!res.ok) {
        setErrorMsg(data.error || 'Erreur ' + res.status)
        return
      }
      setEditId(null); setEditMontant('')
      router.refresh()
    } catch (e) {
      setErrorMsg('Erreur réseau : ' + e.message)
    } finally {
      setLoadingId(null)
    }
  }

  async function ignorer(suggestion, nePlusProposer = false) {
    if (nePlusProposer && !confirm(`Ignorer définitivement « ${chargeMap[suggestion.charge_recurrente_id]?.libelle_personnalise || 'cette charge'} » ?`)) return
    setLoadingId(suggestion.id); setErrorMsg(null)
    try {
      const res = await fetch(`/api/charges-suggestions/${suggestion.id}/ignore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ne_plus_proposer: nePlusProposer })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data.error || 'Erreur ' + res.status)
        return
      }
      router.refresh()
    } finally {
      setLoadingId(null)
    }
  }

  if (!sorted || sorted.length === 0) {
    return (
      <div className="bg-green-950/20 border border-green-900/30 rounded-2xl p-4 mb-3">
        <p className="text-sm text-green-400">✅ Aucune suggestion à valider ce mois</p>
        <p className="text-xs text-gray-500 mt-1">Tu seras prévenu·e quand le cron mensuel générera les prochaines.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">⚡ Suggestions à valider ({sorted.length})</h3>
        {oublisCount > 0 && (
          <span className="text-xs text-red-400 font-medium">⚠ {oublisCount} oubli{oublisCount > 1 ? 's' : ''}</span>
        )}
      </div>

      {errorMsg && (
        <div className="bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-2 text-xs text-red-400">
          {errorMsg}
        </div>
      )}

      <div className="space-y-2">
        {sorted.map(s => {
          const charge = chargeMap[s.charge_recurrente_id]
          const oubli = isOubli(s.date_attendue)
          const libelle = charge?.libelle_personnalise || 'Charge sans libellé'
          const editing = editId === s.id
          return (
            <div key={s.id} className={`bg-gray-900 rounded-2xl border ${oubli ? 'border-red-900/40 border-l-4 border-l-red-500' : 'border-gray-800'} p-3`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{libelle}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {oubli ? `⚠ Attendu le ${fmtJour(s.date_attendue)}, J+${Math.floor((new Date() - new Date(s.date_attendue + 'T12:00:00')) / 86400000)}` : `dû le ${fmtJour(s.date_attendue)}`}
                  </p>
                  {s.formule_evaluee && (
                    <p className="text-xs text-gray-600 mt-0.5 italic">{s.formule_evaluee}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  {editing ? (
                    <div>
                      <input
                        type="number"
                        step="0.01"
                        value={editMontant}
                        onChange={e => setEditMontant(e.target.value)}
                        className="w-24 bg-gray-800 rounded px-2 py-1 text-right text-sm font-mono"
                        placeholder="Montant TTC"
                        autoFocus
                      />
                      <p className="text-[10px] text-gray-500 mt-0.5">€ TTC</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-mono font-semibold text-white">{fmtEur(s.montant_suggere)}</p>
                      <p className="text-[10px] text-gray-500">TTC</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                {editing ? (
                  <>
                    <button
                      onClick={() => valider(s, parseFloat(editMontant))}
                      disabled={loadingId === s.id || !editMontant || parseFloat(editMontant) <= 0}
                      className="flex-1 py-2 rounded-lg text-xs font-medium bg-green-600 text-white disabled:opacity-50"
                    >
                      Valider {editMontant ? fmtEur(parseFloat(editMontant)) : ''}
                    </button>
                    <button
                      onClick={() => { setEditId(null); setEditMontant('') }}
                      disabled={loadingId === s.id}
                      className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-800 text-gray-300"
                    >
                      Annuler
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => valider(s)}
                      disabled={loadingId === s.id}
                      className="flex-1 py-2 rounded-lg text-xs font-medium bg-green-600 text-white disabled:opacity-50"
                    >
                      ✓ Valider
                    </button>
                    <button
                      onClick={() => { setEditId(s.id); setEditMontant(String(s.montant_suggere)) }}
                      disabled={loadingId === s.id}
                      className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-800 text-gray-300"
                    >
                      ✏️ Modifier
                    </button>
                    <button
                      onClick={() => ignorer(s, false)}
                      disabled={loadingId === s.id}
                      className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-800 text-gray-400"
                      title="Ignorer ce mois (le mois prochain on re-suggère)"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
