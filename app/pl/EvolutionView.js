'use client'

// Vue Évolution P&L mois × mois (remplace l'onglet Comparaisons).
//
// Q1=D : sélecteur 6m / 12m / année (filtre côté client depuis fenêtre 12m fixe).
// Q2=C : macros par défaut + accordéon expand vers categorie_pl.
// Q3=B : montant HT + % CA HT en sous-texte.
// Couleurs : C+D — flèches ↑↓ vs M-1 sur montants (rouge/vert avec inversion sémantique
//            CA/RN = ↑ vert / charges = ↑ rouge), highlight ratios food cost/staff cost/EBE
//            selon norme métier.

import { useState, useMemo, Fragment } from 'react'

const fmt = (n) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0
}).format(n || 0)

const fmtCompact = (n) => {
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k'
  return Math.round(n).toString()
}

// Lignes du P&L : structure hiérarchique pour permettre l'accordéon macros → categorie_pl
const STRUCTURE = [
  { key: 'caBrut',      label: 'CA brut TTC',        type: 'haut',   sens: 'haut' },
  { key: 'tvaCollectee', label: 'TVA collectée',     type: 'sub',    sens: 'neutre', minus: true },
  { key: 'caHT',        label: 'CA HT',              type: 'total',  sens: 'haut' },
  { key: 'consommations', label: 'Consommations',    type: 'charge', sens: 'bas',  minus: true,
    expandKey: 'consommations', cats: ['consommations'] },
  { key: 'margeBrute',  label: 'Marge brute',        type: 'total',  sens: 'haut' },
  { key: 'personnel',   label: 'Personnel',          type: 'charge', sens: 'bas',  minus: true,
    expandKey: 'personnel',
    detail: [
      { cat: 'frais_personnel',           label: 'Frais de personnel' },
      { cat: 'autres_charges_personnel',  label: 'Autres charges personnel' },
      { cat: 'frais_deplacement',         label: 'Frais de déplacement' },
    ]
  },
  { key: 'influencables', label: 'Frais influençables', type: 'charge', sens: 'bas', minus: true,
    expandKey: 'influencables',
    detail: [
      { cat: 'entretiens_reparations',     label: 'Entretiens & Réparations' },
      { cat: 'energie',                    label: 'Énergie' },
      { cat: 'autres_frais_influencables', label: 'Autres frais influençables' },
    ]
  },
  { key: 'fixes',       label: 'Frais fixes',        type: 'charge', sens: 'bas',  minus: true,
    expandKey: 'fixes',
    detail: [
      { cat: 'loyers_charges',            label: 'Loyers et Charges' },
      { cat: 'honoraires',                label: 'Honoraires' },
      { cat: 'redevance_marque',          label: 'Redevance de Marque' },
      { cat: 'prestations_operationnelles', label: 'Prestations' },
      { cat: 'frais_divers',              label: 'Frais Divers' },
      { cat: 'autres_charges',            label: 'Autres charges' },
    ]
  },
  { key: 'commissions', label: 'Commissions',        type: 'charge', sens: 'bas',  minus: true },
  { key: 'ebe',         label: 'EBE',                type: 'total',  sens: 'haut' },
  { key: 'impots',      label: 'Impôts (IS)',        type: 'charge', sens: 'neutre', minus: true },
  { key: 'resultatNet', label: 'Résultat net',       type: 'total',  sens: 'haut' },
]

// Lignes ratios : separées en bas du tableau (Q3=B + couleurs D)
const RATIOS = [
  { key: 'foodCostP',  label: 'Food cost',  norme: { min: 28, max: 32 }, alerte: 32 },
  { key: 'staffCostP', label: 'Staff cost', norme: { min: 28, max: 35 }, alerte: 35 },
  { key: 'ebeP',       label: 'EBE %',      norme: { min: 15, max: 20 }, alerte: 0, sens: 'haut' },
]

// Variation + flèche selon sens (haut = ↑ bon, bas = ↑ mauvais, neutre = pas de couleur)
function variationFleche(actuel, precedent, sens) {
  if (precedent == null || precedent === 0) return null
  const pct = ((actuel - precedent) / Math.abs(precedent)) * 100
  if (Math.abs(pct) < 10) return null  // seuil de bruit, pas de marquage
  const isUp = pct > 0
  const isBon = sens === 'haut' ? isUp : sens === 'bas' ? !isUp : null
  if (isBon === null) return null
  return {
    fleche: isUp ? '↑' : '↓',
    color: isBon ? 'text-green-400' : 'text-red-400',
    pct: pct.toFixed(0),
  }
}

// Highlight ratio selon norme (Q3=D)
function colorRatio(value, ratio) {
  if (!value) return 'text-gray-500'
  const { norme, alerte, sens } = ratio
  if (sens === 'haut') {
    // EBE % : haut = bon
    if (value >= norme.min) return 'text-green-400'
    if (value >= norme.min - 5) return 'text-yellow-400'
    return 'text-red-400'
  }
  // food cost / staff cost : bas = bon
  if (value > alerte) return 'text-red-400'
  if (value > norme.max) return 'text-yellow-400'
  if (value >= norme.min) return 'text-green-400'
  return 'text-gray-300'  // sous-norme = pas anormal mais à surveiller
}

export default function EvolutionView({ evolutionMois }) {
  const [plage, setPlage] = useState('12m')
  const [expanded, setExpanded] = useState(new Set())
  const [unite, setUnite] = useState('eur')  // 'eur' ou 'pct' — pour Q3 si on veut toggle plus tard

  // Filtre les mois selon plage choisie
  const moisAffiches = useMemo(() => {
    if (!evolutionMois || evolutionMois.length === 0) return []
    if (plage === '6m') return evolutionMois.slice(-6)
    if (plage === '12m') return evolutionMois
    if (plage === 'annee') {
      // Année calendaire courante : YYYY-01 jusqu'à mois courant -1
      const anneeCour = new Date().getFullYear()
      return evolutionMois.filter(m => m.mois.startsWith(String(anneeCour)))
    }
    return evolutionMois
  }, [evolutionMois, plage])

  const toggleExpand = (key) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!evolutionMois || evolutionMois.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
        <p className="text-gray-400 text-sm">Aucune donnée disponible pour la vue évolution</p>
      </div>
    )
  }

  // Cellule montant : € + % CA HT en sous-texte + flèche variation
  const Cell = ({ valeur, caHT, sens, variationData, alignRight = true }) => {
    const pctCA = caHT > 0 ? Math.abs(valeur) / caHT * 100 : 0
    return (
      <div className={"px-2 py-1.5 " + (alignRight ? 'text-right' : '')}>
        <p className="text-xs font-mono text-gray-200 whitespace-nowrap">
          {valeur < 0 ? '-' : ''}{fmt(Math.abs(valeur))}
          {variationData && (
            <span className={"ml-1 text-[10px] " + variationData.color}>
              {variationData.fleche}
            </span>
          )}
        </p>
        {pctCA > 0 && pctCA < 200 && (
          <p className="text-[10px] text-gray-600 font-mono">{pctCA.toFixed(0)}%</p>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Sélecteur plage */}
      <div className="flex gap-2 mb-3">
        {[
          { val: '6m',    label: '6 mois' },
          { val: '12m',   label: '12 mois' },
          { val: 'annee', label: 'Année' },
        ].map(p => (
          <button
            key={p.val}
            onClick={() => setPlage(p.val)}
            className={"flex-1 text-xs py-1.5 rounded-xl border transition " + (plage === p.val ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-500 mb-2">
        Mois courant exclu (en cours, données partielles). Sous-texte gris = % du CA HT du mois. Flèche ↑↓ si variation vs M-1 &gt; 10%.
      </p>

      {/* Tableau scroll horizontal — sticky-left labels */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-800/60">
              <tr>
                <th className="text-left px-3 py-2 sticky left-0 bg-gray-800/60 z-10 min-w-[140px] uppercase tracking-wider text-gray-400 text-[10px]">
                  Indicateur
                </th>
                {moisAffiches.map(m => (
                  <th key={m.mois} className="text-right px-2 py-2 uppercase tracking-wider text-gray-400 text-[10px] min-w-[80px]">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STRUCTURE.map((row, idx) => {
                const isExpandable = !!row.expandKey && (!!row.detail || row.cats?.length > 0)
                const isOpen = isExpandable && expanded.has(row.expandKey)
                const rowClass =
                  row.type === 'total' ? 'bg-gray-800/40 font-bold' :
                  row.type === 'sub' ? 'text-gray-400' :
                  row.type === 'haut' ? 'font-semibold' :
                  ''
                return (
                  <Fragment key={row.key}>
                    <tr
                      className={"border-t border-gray-800/40 " + rowClass + (isExpandable ? ' cursor-pointer hover:bg-gray-800/30' : '')}
                      onClick={isExpandable ? () => toggleExpand(row.expandKey) : undefined}
                    >
                      <td className="px-3 py-2 sticky left-0 bg-gray-900 z-10 whitespace-nowrap">
                        <span className="flex items-center">
                          {isExpandable && (
                            <span className={"inline-block text-gray-500 mr-1 text-[10px] transition-transform " + (isOpen ? 'rotate-90' : '')}>›</span>
                          )}
                          {row.minus && '− '}{row.label}
                        </span>
                      </td>
                      {moisAffiches.map((m, i) => {
                        const valeur = row.minus ? -m[row.key] : m[row.key]
                        const valeurPrec = i > 0 ? (row.minus ? -moisAffiches[i - 1][row.key] : moisAffiches[i - 1][row.key]) : null
                        const varData = variationFleche(valeur, valeurPrec, row.sens)
                        return (
                          <td key={m.mois} className="px-0 py-0">
                            <Cell valeur={valeur} caHT={m.caHT} sens={row.sens} variationData={varData} />
                          </td>
                        )
                      })}
                    </tr>

                    {isOpen && row.detail && row.detail.map(d => (
                      <tr key={d.cat} className="border-t border-gray-800/20 bg-gray-950/40">
                        <td className="px-3 py-1 pl-8 sticky left-0 bg-gray-950/80 z-10 whitespace-nowrap text-gray-400 text-[11px]">
                          {d.label}
                        </td>
                        {moisAffiches.map((m, i) => {
                          const v = m.detailCat?.[d.cat] || 0
                          const vPrec = i > 0 ? (moisAffiches[i - 1].detailCat?.[d.cat] || 0) : null
                          const varData = vPrec != null ? variationFleche(v, vPrec, 'bas') : null
                          return (
                            <td key={m.mois} className="px-2 py-1 text-right">
                              <span className="text-[11px] font-mono text-gray-400 whitespace-nowrap">
                                -{fmtCompact(v)}€
                                {varData && (
                                  <span className={"ml-1 text-[9px] " + varData.color}>{varData.fleche}</span>
                                )}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </Fragment>
                )
              })}

              {/* Séparateur ratios */}
              <tr><td colSpan={moisAffiches.length + 1} className="h-2 bg-gray-950"></td></tr>
              <tr className="bg-blue-950/30">
                <td colSpan={moisAffiches.length + 1} className="px-3 py-1 text-[10px] uppercase tracking-wider text-blue-400">
                  Ratios clés
                </td>
              </tr>

              {RATIOS.map(ratio => (
                <tr key={ratio.key} className="border-t border-gray-800/40">
                  <td className="px-3 py-2 sticky left-0 bg-gray-900 z-10 whitespace-nowrap text-gray-300">
                    {ratio.label}
                    <span className="ml-2 text-[10px] text-gray-600">norme {ratio.norme.min}-{ratio.norme.max}%</span>
                  </td>
                  {moisAffiches.map(m => {
                    const v = m[ratio.key] || 0
                    return (
                      <td key={m.mois} className="px-2 py-2 text-right">
                        <span className={"text-xs font-mono whitespace-nowrap " + colorRatio(v, ratio)}>
                          {v > 0 ? v.toFixed(1) + '%' : '—'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-gray-600 mt-2">
        Couleurs ratios : <span className="text-green-400">vert</span> = dans la norme, <span className="text-yellow-400">jaune</span> = limite, <span className="text-red-400">rouge</span> = au-dessus du seuil d&apos;alerte.
      </p>
    </div>
  )
}
