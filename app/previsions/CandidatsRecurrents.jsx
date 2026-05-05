'use client'

// Section "Candidats récurrents détectés par IA" sur /previsions.
// Lot 4 Charges Récurrentes V1.1.
//
// Affiche les recurrence_candidates statut='pending'. 2 actions par card :
// Accepter (→ INSERT charges_recurrentes) ou Ignorer (→ apprentissage refus).

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const fmtEur = (n) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 2
}).format(n || 0)

const labelFrequence = (intervalleJoursMedian) => {
  if (intervalleJoursMedian < 35) return 'mensuel'
  if (intervalleJoursMedian < 100) return 'trimestriel'
  return 'annuel'
}

export default function CandidatsRecurrents({ candidates }) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [editId, setEditId] = useState(null)
  const [editJour, setEditJour] = useState('')
  const [editMontant, setEditMontant] = useState('')

  async function accepter(cand) {
    setLoadingId(cand.id); setErrorMsg(null)
    try {
      const body = {
        libelle_personnalise: cand.hints_llm?.libelle_propose || cand.fournisseur_nom_brut,
        profil: cand.hints_llm?.profil || 'fixe',
        frequence: cand.hints_llm?.frequence || labelFrequence(cand.intervalle_jours_median),
        jour_du_mois: editId === cand.id && editJour ? parseInt(editJour, 10) : 1,
        montant_attendu: editId === cand.id && editMontant ? parseFloat(editMontant) : Number(cand.montant_median),
      }
      const res = await fetch(`/api/recurrence-candidates/${cand.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Erreur ' + res.status)
        return
      }
      setEditId(null); setEditJour(''); setEditMontant('')
      router.refresh()
    } catch (e) {
      setErrorMsg('Erreur réseau : ' + e.message)
    } finally {
      setLoadingId(null)
    }
  }

  async function dismiss(cand) {
    if (!confirm(`Ignorer définitivement « ${cand.fournisseur_nom_brut} » ? L'IA ne le re-proposera plus.`)) return
    setLoadingId(cand.id); setErrorMsg(null)
    try {
      const res = await fetch(`/api/recurrence-candidates/${cand.id}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
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

  if (!candidates || candidates.length === 0) {
    return null  // Section masquée si vide
  }

  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">🔍 Candidats détectés par l'IA ({candidates.length})</h3>
      </div>

      <p className="text-xs text-gray-500">
        L'IA a repéré ces charges qui semblent revenir régulièrement. Tu peux les ajouter à ta liste, ou les ignorer.
      </p>

      {errorMsg && (
        <div className="bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-2 text-xs text-red-400">
          {errorMsg}
        </div>
      )}

      <div className="space-y-2">
        {candidates.map(c => {
          const editing = editId === c.id
          const labelLibelle = c.hints_llm?.libelle_propose || c.fournisseur_nom_brut
          const fmtFreq = labelFrequence(c.intervalle_jours_median)
          return (
            <div key={c.id} className="bg-gray-900 rounded-2xl border border-gray-800 p-3">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{labelLibelle}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {fmtEur(c.montant_median)} TTC / {fmtFreq} · {c.nb_observations} fois sur {Math.round((new Date(c.derniere_date) - new Date(c.premiere_date)) / 86400000 / 30)} mois
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-950 text-blue-400 flex-shrink-0">
                  {c.confiance_pct}% confiance
                </span>
              </div>

              {editing && (
                <div className="bg-gray-800 rounded-xl p-2 mb-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-20">Jour du mois</span>
                    <input
                      type="number" min="1" max="28" step="1"
                      value={editJour} onChange={e => setEditJour(e.target.value)}
                      className="flex-1 bg-gray-900 rounded px-2 py-1 text-sm font-mono"
                      placeholder="1-28"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-20">Montant TTC</span>
                    <input
                      type="number" step="0.01"
                      value={editMontant} onChange={e => setEditMontant(e.target.value)}
                      className="flex-1 bg-gray-900 rounded px-2 py-1 text-sm font-mono text-right"
                      placeholder={String(c.montant_median) + ' € TTC'}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {editing ? (
                  <>
                    <button
                      onClick={() => accepter(c)}
                      disabled={loadingId === c.id || !editJour}
                      className="flex-1 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white disabled:opacity-50"
                    >
                      Confirmer + ajouter
                    </button>
                    <button
                      onClick={() => { setEditId(null); setEditJour(''); setEditMontant('') }}
                      className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-800 text-gray-300"
                    >
                      Annuler
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setEditId(c.id); setEditJour('1'); setEditMontant(String(c.montant_median)) }}
                      disabled={loadingId === c.id}
                      className="flex-1 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white"
                    >
                      + Ajouter aux récurrentes
                    </button>
                    <button
                      onClick={() => dismiss(c)}
                      disabled={loadingId === c.id}
                      className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-800 text-gray-400"
                      title="Ignorer définitivement (apprentissage IA)"
                    >
                      ✕ Ignorer
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
