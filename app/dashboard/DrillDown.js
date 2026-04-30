'use client'

import { useState } from 'react'
import Link from 'next/link'

const fmt = (n) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0
}).format(n || 0)

// Couleurs pour les barres de décomposition matières premières (5 sous-cats max)
const COULEURS_DECOMPOSITION = [
  'bg-red-500',
  'bg-orange-500',
  'bg-blue-500',
  'bg-purple-500',
  'bg-gray-500',
  'bg-pink-500'
]

// Courbe SVG remplie (Bézier cubique lissée). Utilisée par les sections CA, Cmd, Panier.
function Courbe({ vals, color = '#3b82f6' }) {
  if (!vals || vals.length < 2) {
    return (
      <div className="h-20 flex items-center justify-center">
        <p className="text-xs text-gray-500">Pas assez de donnees</p>
      </div>
    )
  }
  const W = 300
  const H = 80
  const pad = 8
  const max = Math.max(...vals, 1)
  const min = Math.min(...vals.filter(v => v > 0), 0)
  const range = max - min || 1

  const pts = vals.map((v, i) => ({
    x: pad + (i / (vals.length - 1)) * (W - pad * 2),
    y: H - pad - ((v - min) / range) * (H - pad * 2)
  }))

  let path = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const cpx = (pts[i - 1].x + pts[i].x) / 2
    path += ` C ${cpx} ${pts[i - 1].y} ${cpx} ${pts[i].y} ${pts[i].x} ${pts[i].y}`
  }
  const fill = `${path} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }}>
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#grad)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="4" fill={color} />
    </svg>
  )
}

// Courbe food cost avec ligne objectif en pointillé. Couleur courbe selon
// la valeur actuelle vs objectif (rouge si > obj, vert sinon).
function FoodCostCourbe({ data, objectif }) {
  if (!data || data.length < 2) {
    return (
      <div className="h-20 flex items-center justify-center">
        <p className="text-xs text-gray-500">Pas assez de donnees</p>
      </div>
    )
  }
  const W = 300
  const H = 80
  const pad = 12
  const vals = data.map(d => d.foodCost)
  const max = Math.max(...vals, objectif, 1)
  const min = Math.min(...vals, objectif, 0)
  const range = max - min || 1

  const pts = vals.map((v, i) => ({
    x: pad + (i / (vals.length - 1)) * (W - pad * 2),
    y: H - pad - ((v - min) / range) * (H - pad * 2)
  }))

  let path = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const cpx = (pts[i - 1].x + pts[i].x) / 2
    path += ` C ${cpx} ${pts[i - 1].y} ${cpx} ${pts[i].y} ${pts[i].x} ${pts[i].y}`
  }

  const yObjectif = H - pad - ((objectif - min) / range) * (H - pad * 2)
  const valActuel = vals[vals.length - 1]
  const couleur = valActuel > objectif ? '#ef4444' : '#22c55e'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }}>
      <line x1={pad} y1={yObjectif} x2={W - pad} y2={yObjectif} stroke="#22c55e" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
      <text x={W - pad - 2} y={yObjectif - 4} fontSize="9" fill="#22c55e" textAnchor="end" opacity="0.8">obj. {objectif}%</text>
      <path d={path} fill="none" stroke={couleur} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="4" fill={couleur} />
    </svg>
  )
}

function StatGrid({ stats }) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-3">
      {stats.map((s, i) => (
        <div key={i} className="bg-gray-800 rounded-xl p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{s.label}</p>
          <p className={"text-base font-bold font-mono " + (s.color === 'g' ? 'text-green-400' : s.color === 'r' ? 'text-red-400' : s.color === 'a' ? 'text-yellow-400' : 'text-white')}>
            {s.val}
          </p>
        </div>
      ))}
    </div>
  )
}

function VariationBadge({ variation }) {
  if (variation?.pct !== null && variation?.pct !== undefined) {
    const cls = variation.pct >= 0 ? 'text-green-400' : 'text-red-400'
    return (
      <span className={"text-sm font-mono " + cls}>
        {variation.pct >= 0 ? '+' : ''}{variation.pct.toFixed(1)}%
      </span>
    )
  }
  if (variation?.label) {
    return <span className="text-sm font-mono text-gray-500">{variation.label}</span>
  }
  return null
}

// Variant : variation food cost en POINTS (pas %). Couleur inversée :
// food cost qui MONTE = rouge (mauvais), food cost qui BAISSE = vert (bien).
function VariationFoodCostBadge({ pts }) {
  if (pts === null || pts === undefined || Math.abs(pts) < 0.05) return null
  const cls = pts > 0 ? 'text-red-400' : 'text-green-400'
  return (
    <span className={"text-sm font-mono " + cls}>
      {pts > 0 ? '+' : ''}{pts.toFixed(1)}pts
    </span>
  )
}

export default function DrillDown({ type, data, params, onClose }) {
  const [foodcostTooltipOpen, setFoodcostTooltipOpen] = useState(false)

  const objectifCA = params?.objectif_ca || 45000
  const objectifJour = Math.round(objectifCA / 30)
  const alerteTicketMin = params?.alerte_ticket_min || 14.5
  const objectifFoodCost = params?.objectif_food_cost || 30
  const alerteFoodCostMax = params?.alerte_food_cost_max || 32
  const foodCostP = data?.foodCostP || 0
  const chargesFixesMensuelles = data?.chargesFixesMensuelles || 0

  const caBrut = data?.ca?.brut || 0
  const caHT = data?.ca?.ht || 0
  const caTVA = data?.ca?.tva || 0
  const nbCommandes = data?.frequentation?.nbCommandes || 0
  const nbCommandesUber = data?.frequentation?.nbCommandesUber || 0
  const panierMoyen = data?.panierMoyen || 0
  const paiements = data?.paiements || {}
  const cashADeposer = data?.cashADeposer ?? 0
  const caUber = data?.canaux?.uber || 0
  const variations = data?.variations || { ca: {}, cmd: {}, panier: {}, label: 'vs période précédente' }
  const canauxRegroupes = data?.canauxRegroupes || { restaurant: 0, livraisons: 0, total: 0, pctRestaurant: 0, pctLivraisons: 0 }
  const historique = data?.historique || []
  const periode = data?.periodeActuelle || {}
  const nbJours = data?.nbJours || 1

  // Spécifique food cost
  const variationFoodCostPts = data?.variationFoodCostPts
  const decompositionMatieres = data?.decompositionMatieres || []
  const topFournisseurs = data?.topFournisseurs || []
  const foodCost6Mois = data?.foodCost6Mois || []
  const totalDecomposition = decompositionMatieres.reduce((s, d) => s + d.total, 0)
  const moisLeMoinsCher = foodCost6Mois.length > 0
    ? foodCost6Mois.reduce((min, m) => (m.foodCost > 0 && (min === null || m.foodCost < min.foodCost)) ? m : min, null)
    : null
  const moisActuel = foodCost6Mois.length > 0 ? foodCost6Mois[foodCost6Mois.length - 1] : null

  const tauxMargeVariable = caHT > 0 ? ((caHT - caHT * (foodCostP / 100)) / caHT * 100) : 66
  const seuilJournalier = chargesFixesMensuelles > 0 ? Math.round(chargesFixesMensuelles / 30 / (tauxMargeVariable / 100)) : 0
  const seuilMensuel = chargesFixesMensuelles > 0 ? Math.round(chargesFixesMensuelles / (tauxMargeVariable / 100)) : 0
  const seuilAtteint = caBrut >= seuilJournalier
  const seuilEcart = caBrut - seuilJournalier

  const objectifPeriode = objectifJour * (nbJours || 1)
  const tauxAtteinte = objectifPeriode > 0 ? Math.round(caBrut / objectifPeriode * 100) : 0

  // ───────────────────────────────────────────────────────────────────
  // Drill UNIFIÉ — type='ca' : 6 sections empilées (commit 1).
  // ───────────────────────────────────────────────────────────────────
  const renderUnifie = () => (
    <>
      <div className="mb-5">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Chiffre d'affaires</p>
        <div className="flex items-baseline gap-3 mb-1">
          <p className="text-3xl font-bold font-mono text-green-400">{fmt(caBrut)}</p>
          <VariationBadge variation={variations.ca} />
        </div>
        <p className="text-xs text-gray-500 mb-3">{variations.label}</p>
        <Courbe vals={historique.map(r => r.ca_brut || 0)} color="#22c55e" />
        <StatGrid stats={[
          { label: 'Atteinte objectif', val: tauxAtteinte + '%', color: tauxAtteinte >= 100 ? 'g' : '' },
          { label: 'Moy. CA/jour', val: fmt(Math.round(caBrut / nbJours)) },
          { label: 'CA HT', val: fmt(caHT) },
          { label: 'TVA collectée', val: fmt(caTVA) },
        ]} />
      </div>

      <div className="mb-5 pt-4 border-t border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Commandes</p>
        <div className="flex items-baseline gap-3 mb-1">
          <p className="text-3xl font-bold font-mono text-white">{nbCommandes}</p>
          <VariationBadge variation={variations.cmd} />
        </div>
        <p className="text-xs text-gray-500 mb-3">{variations.label}</p>
        <Courbe vals={historique.map(r => r.nb_commandes || 0)} color="#60a5fa" />
        <StatGrid stats={[
          { label: 'Moy. par jour', val: Math.round(nbCommandes / nbJours) },
          { label: 'Commandes Uber', val: nbCommandesUber },
        ]} />
      </div>

      <div className="mb-5 pt-4 border-t border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Panier moyen</p>
        <div className="flex items-baseline gap-3 mb-1">
          <p className="text-3xl font-bold font-mono text-white">{panierMoyen.toFixed(2)}€</p>
          <VariationBadge variation={variations.panier} />
        </div>
        <p className="text-xs text-gray-500 mb-3">{variations.label}</p>
        <Courbe vals={historique.map(r => r.nb_commandes > 0 ? r.ca_brut / r.nb_commandes : 0)} color="#a78bfa" />
        <StatGrid stats={[
          { label: 'Objectif', val: alerteTicketMin + '€' },
          { label: 'Écart', val: (panierMoyen - alerteTicketMin).toFixed(2) + '€', color: panierMoyen >= alerteTicketMin ? 'g' : 'r' },
        ]} />
      </div>

      <div className="mb-5 pt-4 border-t border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Restaurant / Livraisons</p>
        <div className="space-y-2 mb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-sm text-gray-300">Restaurant</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-mono font-medium">{fmt(canauxRegroupes.restaurant)}</span>
              <span className="text-xs text-gray-500 ml-2">{canauxRegroupes.pctRestaurant}%</span>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-sm text-gray-300">Livraisons</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-mono font-medium">{fmt(canauxRegroupes.livraisons)}</span>
              <span className="text-xs text-gray-500 ml-2">{canauxRegroupes.pctLivraisons}%</span>
            </div>
          </div>
        </div>
        <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden">
          <div className="bg-blue-500" style={{ flex: canauxRegroupes.restaurant || 0.01 }}></div>
          <div className="bg-green-500" style={{ flex: canauxRegroupes.livraisons || 0.01 }}></div>
        </div>
      </div>

      <div className="mb-5 pt-4 border-t border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Répartition paiements</p>
        <div className="space-y-2">
          {[
            { label: 'CB + Borne', val: (paiements.borne || 0) + (paiements.cb || 0), color: 'bg-indigo-500' },
            { label: 'Espèces', val: paiements.especes || 0, color: 'bg-yellow-500' },
            { label: 'Titres-restaurant', val: paiements.tr || 0, color: 'bg-purple-500' },
            { label: 'Livraisons (Uber)', val: caUber, color: 'bg-green-500' },
          ].filter(p => p.val > 0).map(p => (
            <div key={p.label} className="flex items-center gap-3">
              <div className={"w-2 h-2 rounded-full flex-shrink-0 " + p.color}></div>
              <span className="text-sm text-gray-300 flex-1">{p.label}</span>
              <span className="text-sm font-mono font-medium">{fmt(p.val)}</span>
              <span className="text-xs text-gray-500 w-10 text-right">
                {caBrut > 0 ? (p.val / caBrut * 100).toFixed(0) + '%' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-yellow-950 rounded-2xl p-4 border border-yellow-900 mb-3">
        <p className="text-yellow-500 text-xs font-medium mb-1">Cash à déposer</p>
        <p className="text-2xl font-bold font-mono">{fmt(cashADeposer)}</p>
        <p className="text-yellow-700 text-xs mt-1">Espèces encaissées sur la période</p>
      </div>
    </>
  )

  // ───────────────────────────────────────────────────────────────────
  // Drill FOOD COST — refondu pour persona 10h café (commit 2).
  // 5 sections : hero + ⓘ tooltip · évolution 6 mois · décomposition ·
  // top fournisseurs · CTA inventaire (si provisoire).
  // ───────────────────────────────────────────────────────────────────
  const renderFoodCost = () => (
    <>
      {/* Section 1 — Hero contextuel + ⓘ pédagogique (expand inline) */}
      <div className="mb-5">
        <div className="flex justify-between items-start mb-2">
          <p className="text-xs text-gray-500 uppercase tracking-widest">Food cost · {periode.label || ''}</p>
          <button
            onClick={() => setFoodcostTooltipOpen(o => !o)}
            type="button"
            className={"flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border " + (data.foodCostMode === 'exact' ? 'bg-green-950 text-green-400 border-green-900' : 'bg-yellow-950 text-yellow-500 border-yellow-900')}
          >
            <span className="text-sm leading-none">ⓘ</span>
            <span>{data.foodCostMode === 'exact' ? 'exact' : 'provisoire'}</span>
          </button>
        </div>
        <div className="flex items-baseline gap-3 mb-1">
          <p className={"text-4xl font-bold font-mono " + (foodCostP > alerteFoodCostMax ? 'text-red-400' : foodCostP > 0 ? 'text-green-400' : 'text-gray-500')}>
            {foodCostP > 0 ? foodCostP.toFixed(1) + '%' : 'N/A'}
          </p>
          <VariationFoodCostBadge pts={variationFoodCostPts} />
        </div>
        <p className="text-xs text-gray-500">vs mois dernier · objectif {objectifFoodCost}%</p>

        {foodcostTooltipOpen && (
          <div className="mt-3 bg-blue-950/30 border border-blue-900/30 border-l-4 border-l-blue-500 rounded-xl px-4 py-3">
            <p className="text-sm text-gray-300 leading-relaxed">
              Le food cost représente le rapport entre les achats de matières premières et le chiffre d'affaires. Il permet de mesurer la part du chiffre d'affaires consacrée à l'alimentation.
            </p>
            {data.foodCostMode === 'exact' ? (
              <p className="text-sm text-gray-300 leading-relaxed mt-3">
                Ce ratio est exact car calculé avec tes inventaires saisis : (stock début + achats - stock fin) ÷ CA HT.
              </p>
            ) : (
              <p className="text-sm text-gray-300 leading-relaxed mt-3">
                <span className="font-semibold text-yellow-400">Pourquoi ce ratio est-il provisoire ?</span> Ce ratio est calculé uniquement sur la base des achats saisis à ce jour. Il ne tient pas encore compte de la variation de stock entre le dernier inventaire réalisé et le prochain. Le ratio sera définitif une fois l'inventaire enregistré.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Section 2 — Évolution 6 mois */}
      <div className="mb-5 pt-4 border-t border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Évolution sur 6 mois</p>
        <FoodCostCourbe data={foodCost6Mois} objectif={objectifFoodCost} />
        <div className="flex justify-between mt-2 text-xs">
          {moisLeMoinsCher && moisLeMoinsCher.foodCost > 0 ? (
            <span className="text-green-400">
              {moisLeMoinsCher.mois} : {moisLeMoinsCher.foodCost.toFixed(1)}% · plus bas
            </span>
          ) : <span></span>}
          {moisActuel && moisActuel.foodCost > 0 && (
            <span className={moisActuel.foodCost > objectifFoodCost ? 'text-red-400' : 'text-green-400'}>
              {moisActuel.mois} : {moisActuel.foodCost.toFixed(1)}% · actuel
            </span>
          )}
        </div>
      </div>

      {/* Section 3 — Décomposition matières premières */}
      {decompositionMatieres.length > 0 && (
        <div className="mb-5 pt-4 border-t border-gray-800">
          <p className="text-xs text-gray-500 uppercase tracking-widest">D'où vient ce chiffre ?</p>
          <p className="text-xs text-gray-600 mt-1 mb-3">Décomposition matières premières</p>
          <div className="space-y-3">
            {decompositionMatieres.map((d, i) => (
              <div key={d.sousCategorie || i}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm text-gray-300">{d.label}</span>
                  <span className="text-sm font-mono">
                    {fmt(d.total)} <span className="text-xs text-gray-500 ml-1">{d.pct}%</span>
                  </span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={"h-full rounded-full " + COULEURS_DECOMPOSITION[i % COULEURS_DECOMPOSITION.length]}
                    style={{ width: d.pct + '%' }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-800">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Total</span>
            <span className="text-sm font-mono font-semibold text-white">{fmt(totalDecomposition)}</span>
          </div>
        </div>
      )}

      {/* Section 4 — Top 5 fournisseurs Consommations */}
      {topFournisseurs.length > 0 && (
        <div className="mb-5 pt-4 border-t border-gray-800">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">
            Tes {topFournisseurs.length} plus gros fournisseurs
          </p>
          <div className="space-y-1">
            {topFournisseurs.map(f => (
              <Link
                key={f.fournisseur}
                href={`/analyses/sorties/${encodeURIComponent(f.fournisseur)}?periode=${periode.filtreId || 'ce-mois'}`}
                className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-800/50"
              >
                <span className="text-sm text-gray-300 truncate flex-1 min-w-0">{f.fournisseur}</span>
                <div className="flex items-center gap-2 whitespace-nowrap ml-2">
                  <span className="text-sm font-mono">{fmt(f.total)}</span>
                  <VariationBadge variation={{ pct: f.variationPct, label: f.variationLabel }} />
                  <span className="text-gray-600 text-xs">›</span>
                </div>
              </Link>
            ))}
          </div>
          <Link
            href={`/analyses?onglet=sorties&periode=${periode.filtreId || 'ce-mois'}`}
            className="block mt-3 text-xs text-blue-400 text-center hover:text-blue-300"
          >
            Voir tous mes fournisseurs Consommations ›
          </Link>
        </div>
      )}

      {/* Section 5 — CTA passer en exact (uniquement si mode provisoire) */}
      {data.foodCostMode !== 'exact' && (
        <div className="bg-yellow-950/40 border border-yellow-900 rounded-2xl p-4 mb-3">
          <p className="text-sm text-yellow-500 font-semibold mb-1">Passer en food cost exact</p>
          <p className="text-xs text-gray-300 mb-3 leading-relaxed">
            Pour avoir un chiffre précis qui tient compte de tes stocks, saisis ton inventaire de fin de mois.
          </p>
          <Link
            href="/parametres?openFab=inventaire"
            className="inline-block bg-yellow-500 text-gray-950 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-yellow-400 transition"
          >
            Saisir mon inventaire
          </Link>
        </div>
      )}
    </>
  )

  // ───────────────────────────────────────────────────────────────────
  // Drill SEUIL — conservé tel quel, refonte au commit 3.
  // ───────────────────────────────────────────────────────────────────
  const renderSeuil = () => (
    <>
      <div className="mb-4">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Seuil de rentabilite</p>
        <p className={"text-4xl font-bold " + (seuilAtteint ? 'text-green-400' : 'text-red-400')}>
          {seuilAtteint ? 'Atteint ✓' : 'Non atteint'}
        </p>
        <span className={"text-xs px-2 py-0.5 rounded-full border mt-2 inline-block " + (seuilAtteint ? 'bg-green-950 text-green-400 border-green-900' : 'bg-red-950 text-red-400 border-red-900')}>
          {seuilEcart >= 0 ? '+' : ''}{fmt(seuilEcart)} vs seuil
        </span>
      </div>
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-4">
        <div className="px-4 py-2 bg-blue-950/40 border-b border-blue-900/30">
          <p className="text-xs text-blue-400 font-mono">Seuil = Charges fixes / Taux marge sur CV</p>
        </div>
        {[
          { label: 'Charges fixes mensuelles', val: fmt(chargesFixesMensuelles) },
          { label: 'Taux marge sur CV', val: tauxMargeVariable.toFixed(0) + '%' },
          { label: 'Seuil mensuel', val: fmt(seuilMensuel), bold: true },
          { label: 'Seuil journalier (÷30)', val: fmt(seuilJournalier), highlight: true },
        ].map((r, i) => (
          <div key={i} className={"flex justify-between items-center px-4 py-3 border-b border-gray-800 last:border-0 " + (r.highlight ? 'bg-gray-800' : '')}>
            <span className={"text-sm " + (r.bold || r.highlight ? 'font-semibold text-white' : 'text-gray-400')}>{r.label}</span>
            <span className={"font-mono font-semibold " + (r.highlight ? 'text-lg text-white' : 'text-sm text-gray-300')}>{r.val}</span>
          </div>
        ))}
      </div>
      <div className="bg-blue-950/30 border border-blue-900/30 border-l-4 border-l-blue-500 rounded-xl px-4 py-3 mb-4">
        <p className="text-xs text-blue-400 uppercase tracking-wider mb-1">Lecture</p>
        <p className="text-sm text-gray-300 leading-relaxed">
          {seuilAtteint
            ? "Aujourd'hui ton CA de " + fmt(caBrut) + " depasse ton seuil de " + fmt(seuilJournalier) + " de " + fmt(seuilEcart) + ". Tu couvres tes charges fixes et tu generes un benefice."
            : "Aujourd'hui ton CA de " + fmt(caBrut) + " n'atteint pas encore le seuil de " + fmt(seuilJournalier) + ". Il manque " + fmt(-seuilEcart) + " pour couvrir tes charges."}
        </p>
      </div>
      {chargesFixesMensuelles === 0 && (
        <div className="bg-yellow-950/30 border border-yellow-900/30 rounded-xl px-4 py-3">
          <p className="text-xs text-yellow-500 mb-1">Donnees insuffisantes</p>
          <p className="text-xs text-gray-400">Saisis tes charges fixes via le bouton + pour un calcul precis.</p>
        </div>
      )}
    </>
  )

  const titre = type === 'ca'
    ? "Détail · " + (periode.label || '')
    : type === 'foodcost'
      ? 'Food cost · ' + (periode.label || '')
      : 'Seuil de rentabilite'

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="relative w-full max-w-md mx-auto bg-gray-900 rounded-t-2xl border border-gray-800 z-10 max-h-[88vh] flex flex-col">
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mt-3 mb-1 flex-shrink-0"></div>
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 flex-shrink-0">
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="9,2 4,7 9,12"/>
            </svg>
          </button>
          <p className="text-sm font-semibold text-gray-300">{titre}</p>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {type === 'ca' && renderUnifie()}
          {type === 'foodcost' && renderFoodCost()}
          {type === 'seuil' && renderSeuil()}
        </div>
      </div>
    </div>
  )
}
