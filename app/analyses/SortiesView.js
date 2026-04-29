'use client'

import Sparkline from '@/components/Sparkline'
import BarreComparative from '@/components/BarreComparative'

const fmt = (n) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0
}).format(n || 0)

export default function SortiesView({ macroCats, totalActuel, totalPrecedent, sparklines, periode, periodePrecedente }) {
  if (!macroCats) {
    return null
  }

  const aucuneTx = macroCats.every(m => m.count === 0)

  if (aucuneTx) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
        <p className="text-gray-400 text-sm">Aucune sortie sur la période sélectionnée</p>
      </div>
    )
  }

  let variationTotal = null
  let variationTotalLabel = null
  if (totalPrecedent === 0 && totalActuel > 0) {
    variationTotalLabel = 'Nouveau'
  } else if (totalPrecedent > 0) {
    variationTotal = ((totalActuel - totalPrecedent) / totalPrecedent) * 100
  }

  const max = Math.max(
    ...macroCats.map(m => Math.max(m.total, m.totalPrecedent || 0)),
    1
  )

  return (
    <div>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-3">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Total période · TTC</p>
        <div className="flex items-baseline gap-3">
          <p className="text-2xl font-mono font-bold text-white">{fmt(totalActuel)}</p>
          {variationTotal !== null && (
            <p className={"text-sm font-mono " + (variationTotal > 0 ? 'text-red-400' : 'text-green-400')}>
              {variationTotal > 0 ? '+' : ''}{variationTotal.toFixed(1)}%
            </p>
          )}
          {variationTotalLabel && (
            <p className="text-sm font-mono text-gray-500">{variationTotalLabel}</p>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          vs {fmt(totalPrecedent)} période précédente
        </p>
      </div>

      <div className="space-y-2">
        {macroCats.map(m => {
          const sparklineData = sparklines?.[m.macroCat] || [0, 0, 0, 0, 0, 0]
          const variation = m.variationPct

          return (
            <div key={m.macroCat} className="bg-gray-900 border border-gray-800 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-white">{m.macroCat}</p>
                <Sparkline data={sparklineData} couleur="#60a5fa" />
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-lg font-mono font-bold text-white">{fmt(m.total)}</p>
                {variation !== null && variation !== undefined ? (
                  <p className={"text-xs font-mono " + (variation > 0 ? 'text-red-400' : 'text-green-400')}>
                    {variation > 0 ? '+' : ''}{variation.toFixed(1)}%
                  </p>
                ) : m.variationLabel ? (
                  <p className="text-xs font-mono text-gray-500">{m.variationLabel}</p>
                ) : null}
              </div>
              <BarreComparative
                valeurActuelle={m.total}
                valeurPrecedente={m.totalPrecedent || 0}
                max={max}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
