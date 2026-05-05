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
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)

  async function scanner(withEnrich = false) {
    setScanning(true); setErrorMsg(null); setScanResult(null)
    try {
      const res = await fetch('/api/charges-recurrentes/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withEnrich ? { enrich: true } : {})
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Erreur ' + res.status)
        return
      }
      setScanResult({
        nbCandidats: data.nb_candidats,
        nbInserts: data.nb_inserts,
        nbUpdates: data.nb_updates,
        enrichment: data.enrichment || null,
      })
      router.refresh()
    } catch (e) {
      setErrorMsg('Erreur réseau : ' + e.message)
    } finally {
      setScanning(false)
    }
  }

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

  // Section vide : on garde affichée pour exposer le bouton scan
  if (!candidates || candidates.length === 0) {
    return (
      <div className="space-y-3 mb-4">
        <h3 className="text-sm font-semibold text-white">🔍 Candidats détectés par l&apos;IA</h3>
        {errorMsg && (
          <div className="bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-2 text-xs text-red-400">
            {errorMsg}
          </div>
        )}
        {scanResult && (
          <div className="bg-blue-950/30 border border-blue-900/40 rounded-xl px-4 py-2 text-xs text-blue-300">
            Scan terminé : {scanResult.nbCandidats} candidat{scanResult.nbCandidats > 1 ? 's' : ''} détecté{scanResult.nbCandidats > 1 ? 's' : ''}
            {scanResult.nbInserts > 0 ? ` (${scanResult.nbInserts} nouveau${scanResult.nbInserts > 1 ? 'x' : ''})` : ''}
            {scanResult.enrichment && (
              <span> · Enrichissement IA : {scanResult.enrichment.nb_enriched} libellés améliorés ({(scanResult.enrichment.cout_eur * 100).toFixed(1)} centime{scanResult.enrichment.cout_eur * 100 > 1 ? 's' : ''})</span>
            )}
          </div>
        )}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <p className="text-sm text-gray-300">
            L&apos;IA peut analyser tes transactions des 6 derniers mois pour détecter les fournisseurs récurrents (loyers, abonnements, assurances...) que tu n&apos;aurais pas encore configurés.
          </p>
          <div className="mt-3 space-y-2">
            <button
              onClick={() => scanner(false)}
              disabled={scanning}
              className="w-full py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white disabled:opacity-50"
            >
              {scanning ? '🔍 Scan en cours...' : '🔍 Scanner mes transactions'}
            </button>
            <button
              onClick={() => scanner(true)}
              disabled={scanning}
              className="w-full py-2 rounded-xl text-xs font-medium bg-gray-800 text-gray-300 disabled:opacity-50"
            >
              {scanning ? '...' : '✨ Scanner + enrichir libellés (Haiku 4.5, ~1 centime)'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Détection statistique pure par défaut. L&apos;option « enrichir » envoie les noms fournisseurs à Claude Haiku pour proposer des libellés plus lisibles.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">🔍 Candidats détectés par l&apos;IA ({candidates.length})</h3>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => scanner(false)}
            disabled={scanning}
            className="text-xs px-2 py-1 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50"
            title="Re-scanner sans appel LLM"
          >
            {scanning ? '...' : '↻'}
          </button>
          <button
            onClick={() => scanner(true)}
            disabled={scanning}
            className="text-xs px-2 py-1 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50"
            title="Re-scanner + enrichir libellés via Haiku 4.5"
          >
            {scanning ? '...' : '✨'}
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        L&apos;IA a repéré ces charges qui semblent revenir régulièrement. Tu peux les ajouter à ta liste, ou les ignorer.
      </p>

      {errorMsg && (
        <div className="bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-2 text-xs text-red-400">
          {errorMsg}
        </div>
      )}

      {scanResult && (
        <div className="bg-blue-950/30 border border-blue-900/40 rounded-xl px-4 py-2 text-xs text-blue-300">
          Scan terminé : {scanResult.nbCandidats} candidat{scanResult.nbCandidats > 1 ? 's' : ''} détecté{scanResult.nbCandidats > 1 ? 's' : ''}
          {scanResult.nbInserts > 0 ? ` (${scanResult.nbInserts} nouveau${scanResult.nbInserts > 1 ? 'x' : ''})` : ''}
          {scanResult.nbUpdates > 0 ? `, ${scanResult.nbUpdates} mis à jour` : ''}
          {scanResult.enrichment && (
            <span> · ✨ {scanResult.enrichment.nb_enriched} libellés enrichis ({(scanResult.enrichment.cout_eur * 100).toFixed(1)} cent.)</span>
          )}
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
                  <p className="text-sm font-medium truncate">
                    {labelLibelle}
                    {c.hints_llm?.libelle_propose && c.hints_llm.libelle_propose !== c.fournisseur_nom_brut && (
                      <span className="ml-1 text-xs text-blue-400" title="Libellé proposé par l&apos;IA">✨</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {fmtEur(c.montant_median)} TTC / {fmtFreq} · {c.nb_observations} fois sur {Math.round((new Date(c.derniere_date) - new Date(c.premiere_date)) / 86400000 / 30)} mois
                  </p>
                  {c.hints_llm?.commentaire_llm && (
                    <p className="text-xs text-blue-400 mt-0.5 italic">💬 {c.hints_llm.commentaire_llm}</p>
                  )}
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
