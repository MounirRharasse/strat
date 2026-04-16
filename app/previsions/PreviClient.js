'use client'

import { useState } from 'react'

export default function PreviClient({
  caBrut, caHT, nbJours, nbJoursEcoules, nbJoursRestants,
  panierMoyen, commandesParJour, consommations, totalCharges,
  loyer, redevance, honoraires, salaires, urssaf,
  tvaAPayer, commissionsCB, commissionsTR, commissionsUber,
  parametres, regimeTva
}) {
  const [onglet, setOnglet] = useState('projection')
  const [ticketSim, setTicketSim] = useState(Math.round(panierMoyen * 100) / 100)
  const [foodSim, setFoodSim] = useState(30)
  const [ticketsJourSim, setTicketsJourSim] = useState(commandesParJour)

  const objectifCA = parametres?.objectif_ca || 45000
  const objectifFoodCost = parametres?.objectif_food_cost || 30

  const fmt = (n) => new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(n || 0)

  const posColor = (v) => v >= 0 ? 'text-green-400' : 'text-red-400'

  // Projection CA
  const caParJour = nbJoursEcoules > 0 ? caBrut / nbJoursEcoules : 0
  const caProjecte = Math.round(caParJour * nbJours)
  const pctObjectif = objectifCA > 0 ? Math.min((caProjecte / objectifCA) * 100, 120) : 0

  // Food cost réel
  const foodCostP = caHT > 0 ? (consommations / caHT * 100) : 0

  // Projection résultat basé sur les vraies charges
  const chargesParJour = nbJoursEcoules > 0 ? totalCharges / nbJoursEcoules : 0
  const chargesProjetees = Math.round(chargesParJour * nbJours)
  const caHTProjecte = caProjecte / 1.1
  const resultatProjecte = Math.round(caHTProjecte - chargesProjetees)

  // Simulateur
  const caSimule = Math.round(ticketSim * ticketsJourSim * nbJours)
  const caHTSimule = caSimule / 1.1
  const foodCostSimule = caHTSimule * (foodSim / 100)
  const staffSimule = caHTSimule * 0.30
  const chargesFixesSimulees = loyer + redevance + honoraires
  const resultatSimule = Math.round(caHTSimule - foodCostSimule - staffSimule - chargesFixesSimulees)

  // Échéances depuis vraies données
  const echeances = [
    loyer > 0 && {
      nom: 'Loyer et Charges',
      date: parametres?.jour_loyer ? parametres.jour_loyer + ' du mois' : '1er du mois',
      montant: loyer,
      type: 'reel',
      icone: '🏪'
    },
    redevance > 0 && {
      nom: 'Redevance de Marque',
      date: parametres?.jour_redevance ? parametres.jour_redevance + ' du mois' : '5 du mois',
      montant: redevance,
      type: 'reel',
      icone: '™️'
    },
    honoraires > 0 && {
      nom: 'Expert-comptable',
      date: parametres?.jour_honoraires ? parametres.jour_honoraires + ' du mois' : 'Mensuel',
      montant: honoraires,
      type: 'reel',
      icone: '📊'
    },
    urssaf > 0 && {
      nom: 'URSSAF',
      date: parametres?.jour_urssaf ? parametres.jour_urssaf + ' du mois' : '15 du mois',
      montant: urssaf,
      type: 'estime',
      icone: '👥'
    },
    tvaAPayer > 0 && {
      nom: 'TVA à payer',
      date: regimeTva === 'mensuel'
        ? 'Declaration ' + (parametres?.jour_declaration_tva || 20) + ' du mois'
        : 'Declaration trimestrielle',
      montant: tvaAPayer,
      type: 'calcule',
      icone: '📋',
      detail: 'TVA collectee − TVA deductible achats'
    },
    commissionsCB > 0 && {
      nom: 'Commissions CB / Borne',
      date: 'Fin de mois',
      montant: commissionsCB,
      type: 'calcule',
      icone: '💳'
    },
    commissionsTR > 0 && {
      nom: 'Commissions Titres-restaurant',
      date: 'Fin de mois',
      montant: commissionsTR,
      type: 'calcule',
      icone: '🎫'
    },
    commissionsUber > 0 && {
      nom: 'Commissions Uber Eats',
      date: 'Hebdomadaire',
      montant: commissionsUber,
      type: 'calcule',
      icone: '🛵'
    },
  ].filter(Boolean)

  const totalEcheances = echeances.reduce((s, e) => s + e.montant, 0)

  const badgeColor = (type) => {
    if (type === 'reel') return 'bg-green-950 text-green-400'
    if (type === 'estime') return 'bg-yellow-950 text-yellow-500'
    return 'bg-blue-950 text-blue-400'
  }

  const badgeLabel = (type) => {
    if (type === 'reel') return 'reel'
    if (type === 'estime') return 'estimee'
    return 'calcule'
  }

  const ProgressBar = ({ value, max, color }) => {
    const pct = Math.min((value / Math.max(max, 1)) * 100, 100)
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
              <p className="text-sm text-gray-400">{fmt(caBrut)} realise</p>
            </div>
            <ProgressBar value={caBrut} max={objectifCA} color={caProjecte >= objectifCA ? 'bg-green-500' : 'bg-yellow-500'} />
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
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <p className={"text-2xl font-bold font-mono " + posColor(resultatProjecte)}>
                {resultatProjecte >= 0 ? '' : '-'}{fmt(Math.abs(resultatProjecte))}
              </p>
              <p className="text-sm text-gray-400">{caHTProjecte > 0 ? (resultatProjecte / caHTProjecte * 100).toFixed(1) : 0}% du CA HT</p>
            </div>
            <ProgressBar value={Math.max(resultatProjecte, 0)} max={Math.max(caHTProjecte * 0.15, 1)} color={resultatProjecte >= 0 ? 'bg-green-500' : 'bg-red-500'} />
            <p className="text-xs text-gray-500 mt-2">
              Basé sur tes vraies charges du mois · Food cost reel {foodCostP.toFixed(1)}%
            </p>
          </div>

          <div className="bg-blue-950/30 border border-blue-900/30 border-l-4 border-l-blue-500 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-400 uppercase tracking-wider mb-1">Lecture</p>
            <p className="text-sm text-gray-300 leading-relaxed">
              A ce rythme ({fmt(caParJour)}/jour), tu atteindras {fmt(caProjecte)} fin de mois.
              {caProjecte >= objectifCA
                ? " Tu es en avance sur ton objectif."
                : " Pour atteindre " + fmt(objectifCA) + ", il faut faire " + fmt(Math.round((objectifCA - caBrut) / Math.max(nbJoursRestants, 1))) + "/jour sur les " + nbJoursRestants + " jours restants."}
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
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{e.nom}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{e.date}</p>
                  {e.detail && <p className="text-xs text-gray-600 mt-0.5">{e.detail}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-mono font-semibold text-red-400">-{fmt(e.montant)}</p>
                  <span className={"text-xs px-2 py-0.5 rounded-full " + badgeColor(e.type)}>
                    {badgeLabel(e.type)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 flex justify-between items-center">
            <p className="text-sm font-medium">Total echeances du mois</p>
            <p className="text-lg font-mono font-bold text-red-400">-{fmt(totalEcheances)}</p>
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-3">
            <div className="flex gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-600 inline-block"></span>Reel (depuis transactions)</div>
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-600 inline-block"></span>Estime</div>
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span>Calcule</div>
            </div>
          </div>

          <div className="bg-yellow-950 border border-yellow-900 rounded-xl px-4 py-3 text-xs text-yellow-400 leading-relaxed">
            Configure les jours d'echeance et le regime TVA dans Parametres.
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
              <p className="text-xs text-gray-500 mt-1">{(resultatSimule / Math.max(caHTSimule, 1) * 100).toFixed(1)}% du CA HT</p>
            </div>
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Detail simulation</p>
            <div className="space-y-2">
              {[
                { label: 'CA simule TTC', val: caSimule, color: 'text-green-400' },
                { label: 'CA HT', val: caHTSimule, color: 'text-green-400' },
                { label: 'Food cost (' + foodSim + '%)', val: -foodCostSimule, color: 'text-red-400' },
                { label: 'Staff cost (30% estim.)', val: -staffSimule, color: 'text-red-400' },
                { label: 'Charges fixes reelles', val: -chargesFixesSimulees, color: 'text-red-400' },
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