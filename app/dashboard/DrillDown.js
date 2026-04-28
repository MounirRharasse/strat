'use client'

import { useState, useEffect } from 'react'

export default function DrillDown({ type, data, params, onClose }) {
  const [tf, setTf] = useState('hier')
  const [historique, setHistorique] = useState([])
  const [kpis, setKpis] = useState(null)
  const [loading, setLoading] = useState(false)

  const fmt = (n) => new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(n || 0)

  const objectifCA = params?.objectif_ca || 45000
  const objectifJour = Math.round(objectifCA / 30)
  const alerteTicketMin = params?.alerte_ticket_min || 14.5
  const objectifFoodCost = params?.objectif_food_cost || 30
  const alerteFoodCostMax = params?.alerte_food_cost_max || 32
  const foodCostP = data?.foodCostP || 0
  const chargesFixesMensuelles = data?.chargesFixesMensuelles || 0

  // Données de la période sélectionnée
  const caBrut = kpis ? kpis.ca.brut : (data?.ca?.brut || 0)
  const caHT = kpis ? kpis.ca.ht : (data?.ca?.ht || 0)
  const nbCommandes = kpis ? kpis.frequentation.nbCommandes : (data?.frequentation?.nbCommandes || 0)
  const panierMoyen = kpis ? kpis.panierMoyen : (data?.panierMoyen || 0)
  const paiements = kpis ? kpis.paiements : (data?.paiements || {})
  const cashADeposer = kpis ? kpis.cashADeposer : (data?.cashADeposer || 0)
  const caCaisse = kpis ? kpis.ca.caisse : (data?.canaux?.caisse || 0)
  const caFoxorder = kpis ? (kpis.ca.foxorder || kpis.ca.online) : (data?.canaux?.foxorder || 0)
  const caUber = kpis ? kpis.ca.uber : (data?.canaux?.uber || 0)
  const nbJours = kpis?.nbJours || 1

  const tauxMargeVariable = caHT > 0 ? ((caHT - caHT * (foodCostP / 100)) / caHT * 100) : 66
  const seuilJournalier = chargesFixesMensuelles > 0 ? Math.round(chargesFixesMensuelles / 30 / (tauxMargeVariable / 100)) : 0
  const seuilMensuel = chargesFixesMensuelles > 0 ? Math.round(chargesFixesMensuelles / (tauxMargeVariable / 100)) : 0
  const caJourRef = data?.ca?.brut || 0
  const seuilAtteint = caJourRef >= seuilJournalier
  const seuilEcart = caJourRef - seuilJournalier
  const objectifMensuel = objectifCA
const objectifPeriode = tf === 'hier' ? objectifJour
  : tf === '7-derniers-jours' ? objectifJour * 7
  : tf === 'ce-mois' ? objectifMensuel
  : tf === '6-derniers-mois' ? objectifMensuel * 6
  : tf === '12-derniers-mois' ? objectifMensuel * 12
  : objectifMensuel * 12

const labelObjectif = tf === 'hier' ? 'Taux objectif jour'
  : tf === '7-derniers-jours' ? 'Taux objectif semaine'
  : tf === 'ce-mois' ? 'Taux objectif mois'
  : tf === '6-derniers-mois' ? 'Taux objectif 6 mois'
  : tf === '12-derniers-mois' ? 'Taux objectif annuel'
  : 'Taux objectif annuel'

const tauxAtteinte = objectifPeriode > 0 ? Math.round(caBrut / objectifPeriode * 100) : 0
const resteAFaire = Math.max(objectifPeriode - caBrut, 0)

  function getSince(t) {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  if (t === 'hier') {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}
  if (t === '7-derniers-jours') return new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  if (t === 'ce-mois') return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]
  if (t === '6-derniers-mois') return new Date(Date.UTC(now.getFullYear(), now.getMonth() - 6, 1)).toISOString().split('T')[0]
  if (t === '12-derniers-mois') return new Date(Date.UTC(now.getFullYear() - 1, now.getMonth(), 1)).toISOString().split('T')[0]
  // TODO V1+ : remplacer le hardcode '2024-01-01' (début historique Krousty) par
  // une lecture dynamique depuis parametres ou la 1ère date présente en base.
  return '2024-01-01'
}

 useEffect(() => {
  setLoading(true)
  const since = getSince(tf)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const until = tf === 'hier'
    ? yesterday.toISOString().split('T')[0]
    : now.toISOString().split('T')[0]

  Promise.all([
    fetch('/api/historique?since=' + since + '&until=' + until + '&granularite=jour').then(r => r.json()),
    fetch('/api/analyses?since=' + since + '&until=' + until).then(r => r.json())
  ]).then(([hist, k]) => {
    setHistorique(Array.isArray(hist) ? hist : [])
    setKpis(k)
    setLoading(false)
  }).catch(() => setLoading(false))
}, [tf])

  // Courbe SVG
  const Courbe = ({ vals, color = '#3b82f6' }) => {
    if (!vals || vals.length < 2) return (
      <div className="h-20 flex items-center justify-center">
        <p className="text-xs text-gray-500">Pas assez de donnees</p>
      </div>
    )
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

  const Graphe = ({ type: t }) => {
    let vals = []
    if (t === 'ca') vals = historique.map(r => r.ca_brut || 0)
    else if (t === 'freq') vals = historique.map(r => r.nb_commandes || 0)
    else if (t === 'panier') vals = historique.map(r => r.nb_commandes > 0 ? Math.round(r.ca_brut / r.nb_commandes * 100) / 100 : 0)

    return (
      <div className="bg-gray-900 rounded-xl p-3 mb-4 border border-gray-800">
        {loading ? (
          <div className="h-20 flex items-center justify-center">
            <p className="text-xs text-gray-500">Chargement...</p>
          </div>
        ) : (
          <>
            <Courbe vals={vals} />
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-500">{historique[0]?.date?.substring(5) || ''}</span>
              <span className="text-xs text-gray-400 font-mono">
                {vals.filter(v => v > 0).length} jours
              </span>
              <span className="text-xs text-gray-500">{historique[historique.length - 1]?.date?.substring(5) || ''}</span>
            </div>
          </>
        )}
      </div>
    )
  }

  const StatGrid = ({ stats }) => (
    <div className="grid grid-cols-2 gap-2 mb-4">
      {stats.map((s, i) => (
        <div key={i} className="bg-gray-800 rounded-xl p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{s.label}</p>
          <p className={"text-lg font-bold font-mono " + (s.color === 'g' ? 'text-green-400' : s.color === 'r' ? 'text-red-400' : s.color === 'a' ? 'text-yellow-400' : 'text-white')}>
            {s.val}
          </p>
        </div>
      ))}
    </div>
  )

  const TFButtons = () => (
    <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
      {[
        { value: 'hier', label: 'Hier' },
        { value: '7-derniers-jours', label: '7 derniers jours' },
        { value: 'ce-mois', label: 'Ce mois' },
        { value: '6-derniers-mois', label: '6 derniers mois' },
        { value: '12-derniers-mois', label: '12 derniers mois' },
        { value: 'tout', label: "Tout l'historique" },
      ].map(({ value, label }) => (
        <button key={value} onClick={() => setTf(value)}
          className={"flex-shrink-0 px-3 py-1.5 rounded-xl text-xs border transition " + (tf === value ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-800 text-gray-400 border-gray-700')}>
          {label}
        </button>
      ))}
    </div>
  )

  const renderCA = () => (
  <>
    <div className="mb-4">
      <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Chiffre d'affaires</p>
      <p className="text-4xl font-bold font-mono text-green-400">{fmt(caBrut)}</p>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className={"text-xs px-2 py-0.5 rounded-full border " + (tauxAtteinte >= 100 ? 'bg-green-950 text-green-400 border-green-900' : 'bg-gray-800 text-gray-400 border-gray-700')}>
          {tauxAtteinte}% {labelObjectif.toLowerCase().replace('taux ', '')}
        </span>
        <span className="text-xs text-gray-500">{nbJours} jour{nbJours > 1 ? 's' : ''} · {fmt(Math.round(caBrut / nbJours))}/j moy.</span>
      </div>
    </div>
    <TFButtons />
    <Graphe type="ca" />
    <StatGrid stats={[
      { label: labelObjectif, val: tauxAtteinte + '%', color: tauxAtteinte >= 100 ? 'g' : '' },
      { label: 'Moy. CA/jour', val: fmt(Math.round(caBrut / nbJours)), color: '' },
      { label: 'Caisse + Foxorder', val: fmt(caCaisse + caFoxorder), color: '' },
      { label: 'Uber Eats', val: caUber > 0 ? fmt(caUber) : 'N/A', color: '' },
    ]} />
    <div className="mb-4">
      <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Repartition encaissement</p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'CB + Borne', val: caBrut > 0 ? Math.round(((paiements.borne || 0) + (paiements.cb || 0)) / caBrut * 100) : 0, color: 'text-blue-400' },
          { label: 'Especes', val: caBrut > 0 ? Math.round((paiements.especes || 0) / caBrut * 100) : 0, color: 'text-yellow-400' },
          { label: 'Titres R.', val: caBrut > 0 ? Math.round((paiements.tr || 0) / caBrut * 100) : 0, color: 'text-purple-400' },
        ].map(p => (
          <div key={p.label} className="bg-gray-800 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">{p.label}</p>
            <p className={"text-xl font-bold font-mono " + p.color}>{p.val}%</p>
          </div>
        ))}
      </div>
      <div className="bg-yellow-950 border border-yellow-900 rounded-xl px-4 py-3 flex justify-between items-center">
        <p className="text-sm text-yellow-500 font-medium">Cash a deposer</p>
        <p className="text-xl font-bold font-mono text-yellow-400">{fmt(cashADeposer)}</p>
      </div>
    </div>
  </>
)

  const renderFreq = () => (
    <>
      <div className="mb-4">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Frequentation</p>
        <p className="text-4xl font-bold font-mono text-white">{nbCommandes}</p>
        <p className="text-gray-400 text-sm mt-1">{nbJours} jours · {Math.round(nbCommandes / nbJours)}/j moy.</p>
      </div>
      <TFButtons />
      <Graphe type="freq" />
      <StatGrid stats={[
        { label: 'Total commandes', val: nbCommandes, color: '' },
        { label: 'Moy. par jour', val: Math.round(nbCommandes / nbJours), color: '' },
        { label: 'CA par commande', val: nbCommandes > 0 ? fmt(caBrut / nbCommandes) : 'N/A', color: '' },
        { label: 'Uber Eats', val: caUber > 0 ? fmt(caUber) : 'N/A', color: '' },
      ]} />
    </>
  )

  const renderPanier = () => (
    <>
      <div className="mb-4">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Panier moyen</p>
        <p className="text-4xl font-bold font-mono text-white">{panierMoyen.toFixed(2)}€</p>
        <div className="flex items-center gap-2 mt-2">
          <span className={"text-xs px-2 py-0.5 rounded-full border " + (panierMoyen >= alerteTicketMin ? 'bg-green-950 text-green-400 border-green-900' : 'bg-red-950 text-red-400 border-red-900')}>
            {panierMoyen >= alerteTicketMin ? 'Au-dessus objectif' : 'Sous objectif'}
          </span>
          <span className="text-xs text-gray-500">Obj. {alerteTicketMin}€</span>
        </div>
      </div>
      <TFButtons />
      <Graphe type="panier" />
      <StatGrid stats={[
        { label: 'Panier moyen', val: panierMoyen.toFixed(2) + '€', color: panierMoyen >= alerteTicketMin ? 'g' : 'r' },
        { label: 'Objectif', val: alerteTicketMin + '€', color: '' },
        { label: 'Ecart', val: (panierMoyen - alerteTicketMin).toFixed(2) + '€', color: panierMoyen >= alerteTicketMin ? 'g' : 'r' },
        { label: 'Nb commandes', val: nbCommandes, color: '' },
      ]} />
    </>
  )

  const renderFoodCost = () => (
    <>
      <div className="mb-4">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Food cost MTD</p>
        <p className={"text-4xl font-bold font-mono " + (foodCostP > alerteFoodCostMax ? 'text-red-400' : foodCostP > 0 ? 'text-green-400' : 'text-gray-500')}>
          {foodCostP > 0 ? foodCostP.toFixed(1) + '%' : 'N/A'}
        </p>
        {foodCostP > 0 && (
          <span className={"text-xs px-2 py-0.5 rounded-full border mt-2 inline-block " + (foodCostP > objectifFoodCost ? 'bg-red-950 text-red-400 border-red-900' : 'bg-green-950 text-green-400 border-green-900')}>
            {foodCostP > objectifFoodCost ? '+' : ''}{(foodCostP - objectifFoodCost).toFixed(1)}pts vs objectif
          </span>
        )}
      </div>
      <StatGrid stats={[
        { label: 'Objectif', val: objectifFoodCost + '%', color: '' },
        { label: 'Ecart', val: foodCostP > 0 ? (foodCostP - objectifFoodCost).toFixed(1) + 'pts' : 'N/A', color: foodCostP > objectifFoodCost ? 'r' : 'g' },
        { label: 'Impact marge', val: foodCostP > 0 && caHT > 0 ? fmt(-(foodCostP - objectifFoodCost) / 100 * (data?.ca?.ht || 0)) : 'N/A', color: 'r' },
        { label: 'CA HT', val: fmt(data?.ca?.ht || 0), color: '' },
      ]} />
      <div className="bg-blue-950/30 border border-blue-900/30 border-l-4 border-l-blue-500 rounded-xl px-4 py-3 mb-4">
        <p className="text-xs text-blue-400 uppercase tracking-wider mb-1">Comment reduire le food cost</p>
        <p className="text-sm text-gray-300 leading-relaxed">Food cost = achats matieres / CA HT. Saisis tes achats via le bouton +. Objectif fast-food : 28-32%.</p>
      </div>
      {(data?.foodCostMode === 'exact' || kpis?.foodCostMode === 'exact') ? (
        <div className="bg-green-950/30 border border-green-900/30 rounded-xl px-4 py-3">
          <p className="text-xs text-green-500 font-medium mb-1">Food cost exact</p>
          <p className="text-xs text-gray-400">Calculé avec les inventaires saisis : (stock début + achats - stock fin) ÷ CA HT.</p>
        </div>
      ) : (
        <div className="bg-yellow-950/30 border border-yellow-900/30 rounded-xl px-4 py-3">
          <p className="text-xs text-yellow-500 font-medium mb-1">Food cost estimé</p>
          <p className="text-xs text-gray-400">Calculé sur les achats saisis manuellement, sans variation de stock. Saisis 2 inventaires dans la période pour un calcul exact.</p>
        </div>
      )}
    </>
  )

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
            ? "Aujourd'hui ton CA de " + fmt(data?.ca?.brut || 0) + " depasse ton seuil de " + fmt(seuilJournalier) + " de " + fmt(seuilEcart) + ". Tu couvres tes charges fixes et tu generes un benefice."
            : "Aujourd'hui ton CA de " + fmt(data?.ca?.brut || 0) + " n'atteint pas encore le seuil de " + fmt(seuilJournalier) + ". Il manque " + fmt(-seuilEcart) + " pour couvrir tes charges."}
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
          <p className="text-sm font-semibold text-gray-300">
            {type === 'ca' ? "Chiffre d'affaires" : type === 'freq' ? 'Frequentation' : type === 'panier' ? 'Panier moyen' : type === 'foodcost' ? 'Food cost' : 'Seuil de rentabilite'}
          </p>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {type === 'ca' && renderCA()}
          {type === 'freq' && renderFreq()}
          {type === 'panier' && renderPanier()}
          {type === 'foodcost' && renderFoodCost()}
          {type === 'seuil' && renderSeuil()}
        </div>
      </div>
    </div>
  )
}