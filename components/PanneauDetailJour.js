'use client'

import Link from 'next/link'

const FMT = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 2
})
const fmt = (n) => FMT.format(n || 0)

// Modal bottom-sheet pour le détail d'un jour précis du calendrier 30j.
// Pattern cohérent avec app/dashboard/DrillDown.js (handle bar, overlay,
// fermeture par tap arrière-plan ou bouton retour).
//
// Reçoit l'évaluation pré-calculée côté serveur (cf. evaluerJour dans
// lib/audit-saisies.js) — pas de fetch côté client.
export default function PanneauDetailJour({ date, evaluation, onClose }) {
  if (!date) return null

  const dateJS = new Date(date + 'T12:00:00')
  const labelDate = dateJS.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long'
  })

  const detail = evaluation?.detail || {
    caCaisse: 0, especes: 0, uberEats: 0, depenses: [], resultat: 0
  }

  // V1 : 3 lignes Saisies (Caisse + Espèces + Uber Eats).
  // "CA caisse" = caisse + foxorder agrégé (cohérent avec sprint Dashboard).
  // Pas de bouton Saisir pour CA caisse / Espèces (vient de Popina, pas de saisie manuelle).
  const saisies = [
    {
      label: 'CA caisse',
      montant: detail.caCaisse,
      manquant: detail.caCaisse === 0,
      ctaSource: null
    },
    {
      label: 'Espèces déposées',
      montant: detail.especes,
      manquant: detail.especes === 0,
      ctaSource: null
    },
    {
      label: 'Uber Eats',
      montant: detail.uberEats,
      manquant: detail.uberEats === 0,
      ctaSource: 'uber_eats',
      ctaLabel: 'Saisir Uber'
    }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60"></div>
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md mx-auto bg-gray-900 rounded-t-2xl border border-gray-800 z-10 max-h-[88vh] flex flex-col"
      >
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mt-3 mb-1 flex-shrink-0"></div>

        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center"
            aria-label="Retour"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="9,2 4,7 9,12"/>
            </svg>
          </button>
          <p className="text-sm font-semibold text-gray-200 capitalize">{labelDate}</p>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">

          {evaluation?.etat === 'ferme' ? (
            <div className="bg-gray-800 rounded-xl p-5 text-center">
              <p className="text-sm text-gray-400">Jour fermé</p>
              <p className="text-xs text-gray-500 mt-1">Selon tes jours d'ouverture en Paramètres</p>
            </div>
          ) : (
            <>
              {/* Section Saisies */}
              <div className="mb-5">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Saisies</p>
                <div className="space-y-2">
                  {saisies.map(s => (
                    <div key={s.label} className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={s.manquant ? 'text-red-400' : 'text-green-400'}>
                          {s.manquant ? '✗' : '✓'}
                        </span>
                        <span className="text-sm text-gray-200">{s.label}</span>
                      </div>
                      {s.manquant ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-400">manquant</span>
                          {s.ctaSource && (
                            <Link
                              href={`/journal?openFab=entree&date=${date}&source=${s.ctaSource}`}
                              className="text-xs bg-white text-gray-950 px-3 py-1 rounded-lg font-semibold"
                            >
                              {s.ctaLabel || 'Saisir'}
                            </Link>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm font-mono font-semibold text-green-400">{fmt(s.montant)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Section Dépenses */}
              <div className="mb-5">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Dépenses du jour</p>
                <div className="bg-gray-800 rounded-xl overflow-hidden">
                  {detail.depenses.length === 0 ? (
                    <div className="px-4 py-3 text-center">
                      <p className="text-xs text-gray-500">Aucune dépense saisie</p>
                    </div>
                  ) : (
                    detail.depenses.map(t => (
                      <div key={t.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-700 last:border-0">
                        <p className="text-sm text-gray-200 truncate flex-1 min-w-0">{t.fournisseur_nom}</p>
                        <span className="text-sm font-mono font-semibold text-red-400 ml-2 whitespace-nowrap">
                          −{fmt(t.montant_ttc)}
                        </span>
                      </div>
                    ))
                  )}
                  <div className="px-4 py-2 bg-gray-700/50 border-t border-gray-700">
                    <Link
                      href={`/journal?openFab=depense&date=${date}`}
                      className="block text-xs text-blue-400 text-center hover:text-blue-300"
                    >
                      + Saisir une dépense
                    </Link>
                  </div>
                </div>
              </div>

              {/* Footer Résultat du jour */}
              <div className="bg-gray-800 rounded-xl px-4 py-3 flex justify-between items-center">
                <span className="text-sm font-medium text-gray-300">Résultat du jour</span>
                <span className={"text-sm font-mono font-bold " + (detail.resultat >= 0 ? 'text-green-400' : 'text-red-400')}>
                  {detail.resultat >= 0 ? '+' : ''}{fmt(detail.resultat)}
                </span>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
