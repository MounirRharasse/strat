'use client'

import { useState } from 'react'
import Link from 'next/link'
import PeriodFilter from '@/components/PeriodFilter'
import DrillDown from './DrillDown'

export default function DashboardClient({ data, params, periode }) {
  const [drill, setDrill] = useState(null)

  const fmt = (n) => new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(n || 0)

  const objectifCA = params?.objectif_ca || 45000
  const objectifFoodCost = params?.objectif_food_cost || 30
  const alerteFoodCostMax = params?.alerte_food_cost_max || 32
  const alerteTicketMin = params?.alerte_ticket_min || 14.5
  const objectifJour = Math.round(objectifCA / 30)

  const caBrut = data?.ca?.brut || 0
  const caHT = data?.ca?.ht || 0
  const caTVA = data?.ca?.tva || 0
  const caCaisse = data?.canaux?.caisse || 0
  const caFoxorder = data?.canaux?.foxorder || 0
  const caUber = data?.canaux?.uber || 0
  const nbCommandes = data?.frequentation?.nbCommandes || 0
  const panierMoyen = data?.panierMoyen || 0
  const cashADeposer = data?.cashADeposer ?? 0
  const paiements = data?.paiements || {}
  const commissions = data?.commissions || {}
  const foodCostP = data?.foodCostP || 0
  const weekly = data?.weekly || []

  const chargesFixesMensuelles = data?.chargesFixesMensuelles || 0
  const tauxMargeVariable = caHT > 0 ? ((caHT - caHT * (foodCostP / 100)) / caHT * 100) : 66
  const seuilJournalier = chargesFixesMensuelles > 0 ? Math.round(chargesFixesMensuelles / 30 / (tauxMargeVariable / 100)) : 0
  const caJour = data?.ca?.brut || 0
  const seuilAtteint = seuilJournalier > 0 && caJour >= seuilJournalier
  const seuilEcart = caJour - seuilJournalier

  const alertes = []
  if (foodCostP > alerteFoodCostMax && foodCostP > 0) {
    alertes.push({ type: 'danger', titre: 'Food cost au-dessus objectif', detail: foodCostP.toFixed(1) + '% vs ' + objectifFoodCost + '% objectif' })
  }
  if (panierMoyen > 0 && panierMoyen < alerteTicketMin) {
    alertes.push({ type: 'warning', titre: 'Ticket moyen sous objectif', detail: panierMoyen.toFixed(2) + '€ vs ' + alerteTicketMin + '€ objectif' })
  }
  if (alertes.length === 0 && caJour > 0) {
    alertes.push({ type: 'ok', titre: 'Bonne journee !', detail: 'CA ' + fmt(caJour) + (seuilAtteint ? ' · Seuil atteint ✓' : '') })
  }

  const insight = caJour > 0
    ? (seuilAtteint ? 'Seuil de rentabilite atteint (+' + fmt(seuilEcart) + '). ' : '') +
      (foodCostP > 0 ? 'Food cost : ' + foodCostP.toFixed(1) + '%. ' : '') +
      'Panier moyen : ' + panierMoyen.toFixed(2) + '€.'
    : null

  const maxCA = weekly.length > 0 ? Math.max(...weekly.map(j => j.ca), objectifJour) : objectifJour

  const drillData = {
    ca: { brut: caBrut, ht: caHT, tva: caTVA },
    canaux: { caisse: caCaisse, foxorder: caFoxorder, uber: caUber },
    frequentation: { nbCommandes },
    panierMoyen,
    paiements,
    cashADeposer,
    foodCostP,
    chargesFixesMensuelles,
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto pb-24">

      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mon Business</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <p className="text-blue-400 text-xs mt-0.5">
            {data.label} · {data.since} → {data.until}
          </p>
        </div>
        <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm">K</div>
      </div>

      <div className="mb-4">
        <PeriodFilter profil="pilotage" basePath="/dashboard" filtreActif={periode} />
      </div>

          {/* KPI 3 CARDS CLIQUABLES */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div onClick={() => setDrill('ca')} className="bg-gray-900 rounded-xl p-3 border border-gray-800 cursor-pointer hover:border-gray-600 active:scale-95 transition">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">CA</p>
              <p className="text-lg font-bold font-mono">{fmt(caBrut)}</p>
              <p className="text-gray-600 text-xs mt-1">Tap ›</p>
            </div>
            <div onClick={() => setDrill('freq')} className="bg-gray-900 rounded-xl p-3 border border-gray-800 cursor-pointer hover:border-gray-600 active:scale-95 transition">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Commandes</p>
              <p className="text-lg font-bold font-mono">{nbCommandes}</p>
              <p className="text-gray-600 text-xs mt-1">Tap ›</p>
            </div>
            <div onClick={() => setDrill('panier')} className="bg-gray-900 rounded-xl p-3 border border-gray-800 cursor-pointer hover:border-gray-600 active:scale-95 transition">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Panier</p>
              <p className="text-lg font-bold font-mono">{panierMoyen.toFixed(2)}€</p>
              <p className="text-gray-600 text-xs mt-1">Tap ›</p>
            </div>
          </div>

          {/* CA HERO */}
          <div className="bg-gray-900 rounded-2xl p-4 mb-3 border border-gray-800">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Chiffre d'affaires</p>
                <p className="text-4xl font-bold tracking-tight text-green-400">{fmt(caBrut)}</p>
                <p className="text-gray-500 text-xs mt-1">HT {fmt(caHT)} · TVA {fmt(caTVA)}</p>
              </div>
              <span className="bg-green-900 text-green-400 text-xs px-2 py-1 rounded-full border border-green-800">
                {nbCommandes} cmd
              </span>
            </div>

            <div className="space-y-2 mb-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="text-sm text-gray-300">Caisse / Borne</span>
                </div>
                <span className="text-sm font-mono font-medium">{fmt(caCaisse)}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  <span className="text-sm text-gray-300">Foxorder</span>
                </div>
                <span className="text-sm font-mono font-medium">{fmt(caFoxorder)}</span>
              </div>
              {caUber > 0 && (
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-sm text-gray-300">Uber Eats</span>
                  </div>
                  <span className="text-sm font-mono font-medium">{fmt(caUber)}</span>
                </div>
              )}
            </div>

            <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden mb-3">
              <div className="bg-blue-500" style={{ flex: caCaisse || 1 }}></div>
              <div className="bg-orange-500" style={{ flex: caFoxorder || 0.01 }}></div>
              {caUber > 0 && <div className="bg-green-500" style={{ flex: caUber }}></div>}
            </div>

            <div className="space-y-2 pt-3 border-t border-gray-800">
              {[
                { label: 'Borne', val: paiements.borne || 0, color: 'bg-blue-500' },
                { label: 'Carte bancaire', val: paiements.cb || 0, color: 'bg-indigo-500' },
                { label: 'Especes', val: paiements.especes || 0, color: 'bg-yellow-500' },
                { label: 'Titres-restaurant', val: paiements.tr || 0, color: 'bg-purple-500' },
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

            <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-800">
              <span className="text-xs text-gray-400">Commissions estimees</span>
              <span className="text-xs font-mono text-red-400">-{fmt((commissions.cb || 0) + (commissions.tr || 0) + (commissions.uber || 0) + (commissions.foxorder || 0))}</span>
            </div>
          </div>

          {/* CASH */}
          <div className="bg-yellow-950 rounded-2xl p-4 mb-3 border border-yellow-900 flex justify-between items-center">
            <div>
              <p className="text-yellow-500 text-xs font-medium mb-1">Cash a deposer</p>
              <p className="text-2xl font-bold font-mono">{fmt(cashADeposer)}</p>
              <p className="text-yellow-700 text-xs mt-1">Especes encaissees</p>
            </div>
          </div>

          {/* FOOD COST — CLIQUABLE */}
          <div onClick={() => setDrill('foodcost')} className="bg-gray-900 rounded-2xl p-4 mb-3 border border-gray-800 cursor-pointer hover:border-gray-600 transition">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
                  Food cost · {data.foodCostMode === 'exact'
                    ? `exact ${data.foodCostPeriode.since} → ${data.foodCostPeriode.until}`
                    : `${data.label} (estimé)`}
                </p>
                <p className={"text-3xl font-bold font-mono " + (foodCostP > alerteFoodCostMax ? 'text-red-400' : foodCostP > 0 ? 'text-green-400' : 'text-gray-500')}>
                  {foodCostP > 0 ? foodCostP.toFixed(1) + '%' : 'N/A'}
                </p>
                <p className="text-xs text-gray-500 mt-1">Objectif {objectifFoodCost}% · Saisir via +</p>
              </div>
              <div className="text-right">
                {foodCostP > 0 && (
                  <span className={"text-xs px-2 py-1 rounded-full border " + (foodCostP > alerteFoodCostMax ? 'bg-red-950 text-red-400 border-red-900' : 'bg-green-950 text-green-400 border-green-900')}>
                    {foodCostP > objectifFoodCost ? '+' : ''}{(foodCostP - objectifFoodCost).toFixed(1)}pts
                  </span>
                )}
                {data.foodCostMode === 'estime' && (
                  <p className="text-xs text-yellow-600 mt-2 bg-yellow-950 border border-yellow-900 px-2 py-0.5 rounded-full">estimé</p>
                )}
                {data.foodCostMode === 'exact' && (
                  <p className="text-xs text-green-500 mt-2 bg-green-950 border border-green-900 px-2 py-0.5 rounded-full">exact</p>
                )}
                <p className="text-gray-600 text-xs mt-1">Tap ›</p>
              </div>
            </div>
          </div>

          {/* SEUIL — CLIQUABLE */}
          {seuilJournalier > 0 && (
            <div onClick={() => setDrill('seuil')} className="bg-gray-900 rounded-2xl p-4 mb-3 border border-gray-800 cursor-pointer hover:border-gray-600 transition">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Seuil de rentabilite</p>
                  <p className={"text-2xl font-bold " + (seuilAtteint ? 'text-green-400' : 'text-red-400')}>
                    {seuilAtteint ? 'Atteint' : 'Non atteint'}
                  </p>
                </div>
                <div className="text-right">
                  <span className={"text-xs px-2 py-1 rounded-full border " + (seuilAtteint ? 'bg-green-950 text-green-400 border-green-900' : 'bg-red-950 text-red-400 border-red-900')}>
                    {seuilEcart >= 0 ? '+' : ''}{fmt(seuilEcart)}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">Seuil : {fmt(seuilJournalier)}/j</p>
                  <p className="text-gray-600 text-xs mt-1">Tap ›</p>
                </div>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative">
                <div className={"h-2 rounded-full " + (seuilAtteint ? 'bg-green-500' : 'bg-red-500')}
                  style={{ width: Math.min((caJour / (seuilJournalier * 1.5)) * 100, 100) + '%' }}></div>
                <div className="absolute top-0 h-2 w-0.5 bg-white opacity-60"
                  style={{ left: Math.min((seuilJournalier / (seuilJournalier * 1.5)) * 100, 100) + '%' }}></div>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-600">0€</span>
                <span className="text-xs text-gray-400">Seuil {fmt(seuilJournalier)}</span>
                <span className="text-xs text-gray-600">CA {fmt(caJour)}</span>
              </div>
            </div>
          )}

          {/* ALERTES */}
          {alertes.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Alertes</p>
              <div className="space-y-2">
                {alertes.map((a, i) => (
                  <div key={i} className={"rounded-xl px-4 py-3 border " + (
                    a.type === 'danger' ? 'bg-red-950/50 border-red-900' :
                    a.type === 'warning' ? 'bg-yellow-950/50 border-yellow-900' :
                    'bg-green-950/50 border-green-900'
                  )}>
                    <p className={"text-sm font-medium " + (a.type === 'danger' ? 'text-red-400' : a.type === 'warning' ? 'text-yellow-400' : 'text-green-400')}>{a.titre}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* INSIGHT */}
          {insight && (
            <div className="bg-blue-950/30 border border-blue-900/30 border-l-4 border-l-blue-500 rounded-xl px-4 py-3 mb-3">
              <p className="text-xs text-blue-400 uppercase tracking-wider mb-1">Analyse automatique</p>
              <p className="text-sm text-gray-300 leading-relaxed">{insight}</p>
            </div>
          )}

          {/* GRAPHE 7 JOURS */}
          <div className="bg-gray-900 rounded-2xl p-4 mb-4 border border-gray-800">
            <div className="flex justify-between items-center mb-3">
              <p className="text-gray-400 text-xs uppercase tracking-widest">CA — 7 derniers jours</p>
              <p className="text-xs text-gray-600">Obj. {fmt(objectifJour)}/j</p>
            </div>
            <div className="flex items-end gap-2 h-16 mb-2">
              {weekly.map((jour, i) => {
                const isToday = i === weekly.length - 1
                const atteint = jour.ca >= objectifJour
                const hauteur = maxCA > 0 ? Math.max((jour.ca / maxCA) * 100, 4) : 4
                return (
                  <div key={jour.date} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div className="w-full rounded-t" style={{
                      height: hauteur + '%',
                      backgroundColor: isToday ? (atteint ? '#22c55e' : '#3b82f6') : (atteint ? '#166534' : '#374151')
                    }}></div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 mb-2">
              {weekly.map((jour) => (
                <div key={jour.date} className="flex-1 text-center">
                  <p className="text-gray-500" style={{ fontSize: '9px' }}>{jour.label}</p>
                  <p className="text-gray-400 font-mono" style={{ fontSize: '8px' }}>
                    {jour.ca > 0 ? (jour.ca / 1000).toFixed(1) + 'k' : '-'}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-3 border-t border-gray-800">
              <span className="text-xs text-gray-400">Total 7j</span>
              <span className="text-xs font-mono font-medium">{fmt(weekly.reduce((s, j) => s + j.ca, 0))}</span>
            </div>
          </div>

          {/* ACCES RAPIDE */}
          <div className="mt-2">
            <p className="text-gray-400 text-xs uppercase tracking-widest mb-3">Acces rapide</p>
            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
              {[
                { href: '/journal', label: 'Journal', sub: 'Transactions du jour · Historique · Saisie', icon: '📋' },
                { href: '/mix', label: 'Mix ventes', sub: 'Top/Flop produits · Amplitudes', icon: '📊' },
                { href: '/previsions', label: 'Previsions', sub: 'Projection fin de mois · Simulateur', icon: '🕐' },
                { href: '/pl', label: 'P&L complet', sub: 'Resume · Detail · Comparaisons', icon: '📈' },
              ].map(item => (
                <Link key={item.href} href={item.href}
                  className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition">
                  <div className="w-9 h-9 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
                    <span>{item.icon}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.sub}</p>
                  </div>
                  <span className="text-gray-600">›</span>
                </Link>
              ))}
              <div className="flex items-center gap-3 px-4 py-3 opacity-40">
                <div className="w-9 h-9 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
                  <span>💡</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Apprendre</p>
                  <p className="text-xs text-gray-400 mt-0.5">Comprendre tes indicateurs</p>
                </div>
                <span className="text-xs text-gray-600 bg-gray-800 px-2 py-1 rounded-md">Bientot</span>
              </div>
            </div>
          </div>

      {drill && (
        <DrillDown
          type={drill}
          data={drillData}
          params={params}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  )
}