'use client'

import { useState } from 'react'

export default function PreviClient({ kpis, caActuel, nbJours, nbJoursEcoules, nbJoursRestants, panierMoyen, commandesParJour }) {
  const [onglet, setOnglet] = useState('projection')
  const [ticketSim, setTicketSim] = useState(panierMoyen)
  const [foodSim, setFoodSim] = useState(30)
  const [ticketsJourSim, setTicketsJourSim] = useState(commandesParJour)

  const objectifCA = 45000

  const fmt = (n) => new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(n || 0)

  // Projection CA
  const caParJour = nbJoursEcoules > 0 ? caActuel / nbJoursEcoules : 0
  const caProjecte = Math.round(caParJour * nbJours)
  const caRestant = caProjecte - caActuel
  const pctObjectif = objectifCA > 0 ? Math.min((caProjecte / objectifCA) * 100, 120) : 0
  const pctAtteint = objectifCA > 0 ? (caActuel / objectifCA) * 100 : 0

  // Projection résultat (on suppose food cost 32% et staff 30% comme norme)
  const foodCostEstime = caProjecte * 0.32
  const staffCostEstime = caProjecte * 0.30
  const chargesFixesEstimees = 8000 // loyer + honoraires + redevance estimés
  const resultatProjecte = caProjecte - foodCostEstime - staffCostEstime - chargesFixesEstimees
  const objectifResultat = objectifCA - (objectifCA * 0.32) - (objectifCA * 0.30) - chargesFixesEstimees
  const pctResultat = objectifResultat > 0 ? Math.min((resultatProjecte / objectifResultat) * 100, 120) : 0

  // Simulateur
  const caSimule = Math.round(ticketSim * ticketsJourSim * nbJours)
  const foodCostSimule = caSimule * (foodSim / 100)
  const staffSimule = caSimule * 0.30
  const resultatSimule = caSimule - foodCostSimule - staffSimule - chargesFixesEstimees

  // TVA estimée depuis Popina
  const tvaEstimee = caActuel > 0 ? Math.round(caActuel * (kpis?.tvaCollectee / kpis?.caBrut || 0.095)) : 0
  const tvaProjetee = Math.round(tvaEstimee * (nbJours / Math.max(nbJoursEcoules, 1)))

  const echeances = [
    { nom: 'Loyer', date: '1er du mois', montant: 3200, type: 'fixe', icone: '🏪' },
    { nom: 'Redevance Krousty', date: '5 du mois', montant: 1500, type: 'fixe', icone: '™️' },
    { nom: 'TVA collectee', date: 'Declaration mensuelle', montant: tvaProjetee, type: 'estime', icone: '📋' },
    { nom: 'URSSAF', date: '15 du mois', montant: Math.round(caActuel * 0.08), type: 'estime', icone: '👥' },
    { nom: 'Expert-comptable', date: 'Mensuel', montant: 300, type: 'fixe', icone: '📊' },
  ]

  const totalEcheances = echeances.reduce((s, e) => s + e.montant, 0)

  const posColor = (v) => v >= 0 ? 'text-green-400' : 'text-red-400'

  const ProgressBar = ({ value, max, color }) => {
    const pct = Math.min((value / max) * 100, 100)
    return (
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden mt-2">
        <div className={"h-2 rounded-full transition-all " + color} style={{ width: pct + '%' }}></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto pb-24">

      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Previsions</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          {' · '}{nbJoursEcoules}j ecoules / {nbJours}j au total
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        {[
          { key: 'projection', label: 'Projection' },
          { key: 'echeances', label: 'Echeances' },
          { key: 'simulateur', label: 'Simulateur' }
        ].map(o => (
          <button key={o.key} onClick={() => setOnglet(o.key)}
            className={"flex-1 text-center text-xs py-2 rounded-xl border transition " + (onglet === o.key ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>
            {o.label}
          </button>
        ))}
      </div>

      {onglet === 'projection' && (
        <div className="space-y-3">

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
            <div className="flex justify-between items-start mb-1">
              <p className="text-xs text-gray-400 uppercase tracking-wider">CA projete fin de mois</p>
              <span className="text-xs text-gray-500">Obj. {fmt(objectifCA)}</span>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <p className={"text-2xl font-bold font-mono " + (caProjecte >= objectifCA ? 'text-green-400' : 'text-yellow-400')}>
                {fmt(caProjecte)}
              </p>
              <p className="text-sm text-gray-400">{fmt(caActuel)} realise</p>
            </div>
            <ProgressBar value={caActuel} max={objectifCA} color={caProjecte >= objectifCA ? 'bg-green-500' : 'bg-yellow-500'} />
            <div className="flex justify-between mt-1">
              <p className="text-xs text-gray-500">Aujourd'hui</p>
              <p className="text-xs text-gray-500">Objectif {fmt(objectifCA)}</p>
            </div>
            <p className={"text-xs mt-2 font-medium " + (caProjecte >= objectifCA ? 'text-green-400' : 'text-yellow-400')}>
              {caProjecte >= objectifCA
                ? '+' + Math.round(pctObjectif - 100) + '% au-dessus objectif'
                : 'Il manque ' + fmt(objectifCA - caProjecte) + ' pour atteindre l\'objectif'}
            </p>
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
            <div className="flex justify-between items-start mb-1">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Resultat op. projete</p>
              <span className="text-xs text-gray-500">Obj. {fmt(objectifResultat)}</span>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <p className={"text-2xl font-bold font-mono " + posColor(resultatProjecte)}>
                {resultatProjecte >= 0 ? '' : '-'}{fmt(Math.abs(resultatProjecte))}
              </p>
              <p className="text-sm text-gray-400">{(resultatProjecte / caProjecte * 100).toFixed(1)}% du CA</p>
            </div>
            <ProgressBar value={Math.max(resultatProjecte, 0)} max={Math.max(objectifResultat, 1)} color={resultatProjecte >= objectifResultat ? 'bg-green-500' : 'bg-orange-500'} />
            <p className="text-xs text-gray-500 mt-2">
              Hypotheses : food cost 32%, staff 30%, charges fixes {fmt(chargesFixesEstimees)}
            </p>
          </div>

          <div className="bg-blue-950/30 border border-blue-900/30 border-l-4 border-l-blue-500 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-400 uppercase tracking-wider mb-1">Lecture</p>
            <p className="text-sm text-gray-300 leading-relaxed">
              A ce rythme ({fmt(caParJour)}/jour), tu atteindras {fmt(caProjecte)} fin de mois.
              {caProjecte >= objectifCA
                ? " Tu es en avance sur ton objectif."
                : " Pour atteindre " + fmt(objectifCA) + ", il faut faire " + fmt(Math.round((objectifCA - caActuel) / Math.max(nbJoursRestants, 1))) + "/jour sur les " + nbJoursRestants + " jours restants."}
            </p>
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Progression du mois</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Jours ecoules</p>
                <p className="text-xl font-bold font-mono">{nbJoursEcoules}</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Jours restants</p>
                <p className="text-xl font-bold font-mono text-yellow-400">{nbJoursRestants}</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">CA/jour moy.</p>
                <p className="text-lg font-bold font-mono text-green-400">{fmt(caParJour)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {onglet === 'echeances' && (
        <div className="space-y-3">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            {echeances.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0">
                <div className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center flex-shrink-0">
                  <span>{e.icone}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{e.nom}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{e.date}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono font-semibold text-red-400">-{fmt(e.montant)}</p>
                  <span className={"text-xs px-2 py-0.5 rounded-full " + (e.type === 'fixe' ? 'bg-gray-800 text-gray-400' : 'bg-yellow-950 text-yellow-500')}>
                    {e.type === 'fixe' ? 'fixe' : 'estimee'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 flex justify-between items-center">
            <p className="text-sm font-medium">Total echeances du mois</p>
            <p className="text-lg font-mono font-bold text-red-400">-{fmt(totalEcheances)}</p>
          </div>

          <div className="bg-yellow-950 border border-yellow-900 rounded-xl px-4 py-3 text-xs text-yellow-400 leading-relaxed">
            TVA et URSSAF sont des estimations indicatives. Les montants fixes (loyer, redevance) sont des exemples — configure tes vraies echeances dans Parametres.
          </div>
        </div>
      )}

      {onglet === 'simulateur' && (
        <div className="space-y-3">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-4">Ajuste les parametres</p>

            <div className="mb-5">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-300">Ticket moyen</span>
                <span className="text-sm font-mono font-semibold">{ticketSim.toFixed(2)}€</span>
              </div>
              <input type="range" min="8" max="25" step="0.25" value={ticketSim}
                onChange={e => setTicketSim(parseFloat(e.target.value))}
                className="w-full accent-white" />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-600">8€</span>
                <span className="text-xs text-gray-600">25€</span>
              </div>
            </div>

            <div className="mb-5">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-300">Food cost cible</span>
                <span className={"text-sm font-mono font-semibold " + (foodSim > 32 ? 'text-red-400' : foodSim > 30 ? 'text-yellow-400' : 'text-green-400')}>
                  {foodSim}%
                </span>
              </div>
              <input type="range" min="20" max="45" step="1" value={foodSim}
                onChange={e => setFoodSim(parseInt(e.target.value))}
                className="w-full accent-white" />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-600">20%</span>
                <span className="text-xs text-gray-600">45%</span>
              </div>
            </div>

            <div className="mb-2">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-300">Commandes / jour</span>
                <span className="text-sm font-mono font-semibold">{ticketsJourSim}</span>
              </div>
              <input type="range" min="50" max="400" step="1" value={ticketsJourSim}
                onChange={e => setTicketsJourSim(parseInt(e.target.value))}
                className="w-full accent-white" />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-600">50</span>
                <span className="text-xs text-gray-600">400</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">CA fin de mois</p>
              <p className={"text-xl font-bold font-mono " + (caSimule >= objectifCA ? 'text-green-400' : 'text-yellow-400')}>
                {fmt(caSimule)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {caSimule >= objectifCA ? '+' + Math.round((caSimule / objectifCA - 1) * 100) + '% vs obj.' : '-' + Math.round((1 - caSimule / objectifCA) * 100) + '% vs obj.'}
              </p>
            </div>
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Resultat op.</p>
              <p className={"text-xl font-bold font-mono " + posColor(resultatSimule)}>
                {resultatSimule >= 0 ? '' : '-'}{fmt(Math.abs(resultatSimule))}
              </p>
              <p className="text-xs text-gray-500 mt-1">{(resultatSimule / Math.max(caSimule, 1) * 100).toFixed(1)}% du CA</p>
            </div>
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Detail simulation</p>
            <div className="space-y-2">
              {[
                { label: 'CA simule', val: caSimule, color: 'text-green-400' },
                { label: 'Food cost (' + foodSim + '%)', val: -foodCostSimule, color: 'text-red-400' },
                { label: 'Staff cost (30%)', val: -staffSimule, color: 'text-red-400' },
                { label: 'Charges fixes', val: -chargesFixesEstimees, color: 'text-red-400' },
                { label: 'Resultat op.', val: resultatSimule, color: posColor(resultatSimule), bold: true },
              ].map(row => (
                <div key={row.label} className={"flex justify-between py-1 " + (row.bold ? 'border-t border-gray-700 pt-2 mt-1' : '')}>
                  <span className={"text-sm " + (row.bold ? 'font-semibold text-white' : 'text-gray-400')}>{row.label}</span>
                  <span className={"text-sm font-mono " + row.color}>{row.val >= 0 ? '' : '-'}{fmt(Math.abs(row.val))}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}