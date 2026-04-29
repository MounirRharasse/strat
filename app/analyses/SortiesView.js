'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Sparkline from '@/components/Sparkline'
import BarreComparative from '@/components/BarreComparative'
import { matchHierarchie } from '@/lib/analyses/recherche'

const fmt = (n) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0
}).format(n || 0)

function VariationBadge({ pct, label }) {
  if (pct !== null && pct !== undefined) {
    const cls = pct > 0 ? 'text-red-400' : 'text-green-400'
    return (
      <span className={"text-xs font-mono " + cls}>
        {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
      </span>
    )
  }
  if (label) {
    return <span className="text-xs font-mono text-gray-500">{label}</span>
  }
  return null
}

export default function SortiesView({ macroCats, totalActuel, totalPrecedent, sparklines, periode, periodePrecedente }) {
  const [expanded, setExpanded] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = useMemo(() => {
    if (!macroCats) return []
    return matchHierarchie(macroCats, searchQuery)
  }, [macroCats, searchQuery])

  const autoExpanded = useMemo(() => {
    if (!searchQuery.trim()) return new Set()
    const set = new Set()
    for (const macro of filtered) {
      set.add(macro.macroCat)
      for (const cat of (macro.categoriesPL || [])) {
        set.add(`${macro.macroCat}.${cat.cat}`)
        for (const sc of (cat.sousCategories || [])) {
          set.add(`${macro.macroCat}.${cat.cat}.${sc.sousCat || '__sans__'}`)
        }
      }
    }
    return set
  }, [filtered, searchQuery])

  const isExpanded = (key) =>
    searchQuery.trim() ? autoExpanded.has(key) : expanded.has(key)

  const toggleExpand = (key) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!macroCats) return null

  const aucuneTx = (macroCats || []).every(m => m.count === 0)

  if (aucuneTx) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
        <p className="text-gray-400 text-sm">Aucune sortie sur la période sélectionnée</p>
      </div>
    )
  }

  let variationTotalPct = null
  let variationTotalLabel = null
  if (totalPrecedent === 0 && totalActuel > 0) variationTotalLabel = 'Nouveau'
  else if (totalPrecedent === 0 && totalActuel === 0) variationTotalLabel = '—'
  else if (totalPrecedent > 0) variationTotalPct = ((totalActuel - totalPrecedent) / totalPrecedent) * 100

  const max = Math.max(
    ...(macroCats || []).map(m => Math.max(m.total || 0, m.totalPrecedent || 0)),
    1
  )

  const periodeId = periode?.id || periode?.filtreId || 'ce-mois'

  return (
    <div>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-3">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Total période · TTC</p>
        <div className="flex items-baseline gap-3">
          <p className="text-2xl font-mono font-bold text-white">{fmt(totalActuel)}</p>
          {variationTotalPct !== null && (
            <p className={"text-sm font-mono " + (variationTotalPct > 0 ? 'text-red-400' : 'text-green-400')}>
              {variationTotalPct > 0 ? '+' : ''}{variationTotalPct.toFixed(1)}%
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

      <div className="mb-3">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher fournisseur, catégorie..."
          className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-600"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
          <p className="text-gray-400 text-sm">Aucun résultat pour "{searchQuery}"</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(macro => {
            const sparklineData = sparklines?.[macro.macroCat] || [0, 0, 0, 0, 0, 0]
            const expandKey = macro.macroCat
            const open = isExpanded(expandKey)
            const hasChildren = (macro.categoriesPL || []).length > 0

            return (
              <div key={macro.macroCat} className="bg-gray-900 border border-gray-800 rounded-2xl p-3">
                <div
                  className={"flex items-center justify-between mb-2 " + (hasChildren ? 'cursor-pointer' : '')}
                  onClick={hasChildren ? () => toggleExpand(expandKey) : undefined}
                >
                  <div className="flex items-center gap-2">
                    {hasChildren && (
                      <span className={"text-gray-500 text-xs transition-transform " + (open ? 'rotate-90' : '')}>›</span>
                    )}
                    <p className="text-sm font-medium text-white">{macro.macroCat}</p>
                  </div>
                  <Sparkline data={sparklineData} couleur="#60a5fa" />
                </div>
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-lg font-mono font-bold text-white">{fmt(macro.total)}</p>
                  <VariationBadge pct={macro.variationPct} label={macro.variationLabel} />
                </div>
                <BarreComparative
                  valeurActuelle={macro.total}
                  valeurPrecedente={macro.totalPrecedent || 0}
                  max={max}
                />

                {open && hasChildren && (
                  <div className="pl-2 mt-3 space-y-1">
                    {(macro.categoriesPL || []).map(cat => {
                      const catKey = `${macro.macroCat}.${cat.cat}`
                      const catOpen = isExpanded(catKey)
                      const catHasChildren = (cat.sousCategories || []).length > 0

                      return (
                        <div key={cat.cat}>
                          <button
                            type="button"
                            onClick={catHasChildren ? () => toggleExpand(catKey) : undefined}
                            className="w-full flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-800/50 text-left"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {catHasChildren && (
                                <span className={"text-gray-500 text-xs transition-transform " + (catOpen ? 'rotate-90' : '')}>›</span>
                              )}
                              <span className="text-sm text-gray-300 truncate">{cat.label}</span>
                            </div>
                            <span className="text-sm font-mono text-gray-300 whitespace-nowrap">{fmt(cat.total)}</span>
                          </button>

                          {catOpen && catHasChildren && (
                            <div className="pl-2 mt-1 space-y-0.5">
                              {(cat.sousCategories || []).map(sc => {
                                const scKey = `${macro.macroCat}.${cat.cat}.${sc.sousCat || '__sans__'}`
                                const scOpen = isExpanded(scKey)
                                const scHasChildren = (sc.fournisseurs || []).length > 0

                                return (
                                  <div key={sc.sousCat || '__sans__'}>
                                    <button
                                      type="button"
                                      onClick={scHasChildren ? () => toggleExpand(scKey) : undefined}
                                      className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-800/50 text-left"
                                    >
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        {scHasChildren && (
                                          <span className={"text-gray-500 text-xs transition-transform " + (scOpen ? 'rotate-90' : '')}>›</span>
                                        )}
                                        <span className="text-xs text-gray-400 truncate">{sc.label}</span>
                                      </div>
                                      <span className="text-xs font-mono text-gray-400 whitespace-nowrap">{fmt(sc.total)}</span>
                                    </button>

                                    {scOpen && scHasChildren && (
                                      <div className="pl-2 mt-0.5 space-y-0.5">
                                        {(sc.fournisseurs || []).map(f => (
                                          <Link
                                            key={f.fournisseur}
                                            href={`/analyses/sorties/${encodeURIComponent(f.fournisseur)}?periode=${periodeId}`}
                                            className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-800/50"
                                          >
                                            <span className="text-xs text-gray-400 truncate flex-1 min-w-0">{f.fournisseur}</span>
                                            <div className="flex items-center gap-2 whitespace-nowrap ml-2">
                                              <span className="text-xs font-mono text-gray-300">{fmt(f.total)}</span>
                                              <VariationBadge pct={f.variationPct} label={f.variationLabel} />
                                            </div>
                                          </Link>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
