'use client'

// Section "Charges récurrentes actives" sur /previsions.
// Lot 4 Charges Récurrentes V1.1.
//
// Liste les charges_recurrentes du tenant + bouton "Importer depuis catalogue"
// (modal réutilisable Lot 7) + désactivation soft (DELETE → actif=false).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ChargesCatalogueModal from './ChargesCatalogueModal'

const fmtEur = (n) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 2
}).format(n || 0)

const fmtFreq = (f) => ({ mensuel: 'mensuel', trimestriel: 'trimestriel', semestriel: 'semestriel', annuel: 'annuel' }[f] || f)

export default function ChargesActives({ charges, types, parametres }) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [showCatalogue, setShowCatalogue] = useState(false)

  async function desactiver(charge) {
    if (!confirm(`Désactiver « ${charge.libelle_personnalise} » ? Plus de suggestion mensuelle.`)) return
    setLoadingId(charge.id); setErrorMsg(null)
    try {
      const res = await fetch(`/api/charges-recurrentes/${charge.id}`, { method: 'DELETE' })
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

  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">📋 Charges récurrentes actives ({charges?.length || 0})</h3>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setShowCatalogue(true)}
          className="flex-1 py-2 rounded-xl text-xs font-medium bg-white text-gray-950"
        >
          + Importer depuis catalogue
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-2 text-xs text-red-400">
          {errorMsg}
        </div>
      )}

      {(!charges || charges.length === 0) ? (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <p className="text-sm text-gray-400">Aucune charge récurrente configurée.</p>
          <p className="text-xs text-gray-500 mt-1">
            Importe depuis le catalogue pour pré-saisir tes charges mensuelles (loyer, URSSAF, abonnements...).
          </p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          {charges.map((c, i) => (
            <div key={c.id} className={`flex items-center gap-3 px-4 py-3 ${i < charges.length - 1 ? 'border-b border-gray-800' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.libelle_personnalise}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {fmtFreq(c.frequence)} · jour {c.jour_du_mois}
                  {c.profil === 'variable_recurrente' && c.formule_calcul && ' · variable'}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-mono">
                  {c.profil === 'variable_recurrente' && c.formule_calcul
                    ? <span className="text-gray-400">~ {c.montant_attendu ? fmtEur(c.montant_attendu) : 'calculé'}</span>
                    : fmtEur(c.montant_attendu)}
                </p>
              </div>
              <button
                onClick={() => desactiver(c)}
                disabled={loadingId === c.id}
                className="text-gray-500 hover:text-red-400 text-sm px-2"
                title="Désactiver"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {showCatalogue && (
        <ChargesCatalogueModal
          types={types}
          parametres={parametres}
          chargesExistantes={charges || []}
          onClose={() => setShowCatalogue(false)}
          onCreated={() => { setShowCatalogue(false); router.refresh() }}
        />
      )}
    </div>
  )
}
