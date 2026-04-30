'use client'

import { useState } from 'react'
import Link from 'next/link'
import PeriodFilter from '@/components/PeriodFilter'
import DrillDown from './DrillDown'

const FMT = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const fmt = (n) => FMT.format(n || 0)

function IndicSynchro({ lastSyncDate }) {
  if (!lastSyncDate) {
    return <p className="text-xs text-red-400 mt-0.5">Aucune donnée synchronisée</p>
  }
  // historique_ca.date est de type date pure. On considère la donnée comme valide
  // jusqu'à la fin de la journée saisie : on ajoute +24h sur lastSyncDate pour
  // calculer un âge "en heures" cohérent (sinon "il y a 28h" affiché tout au long
  // du jour suivant la synchro = anxiogène et trompeur).
  const finJourSaisi = new Date(lastSyncDate).getTime() + 24 * 3600000
  const ageHeures = (Date.now() - finJourSaisi) / 3600000

  let label, cls
  if (ageHeures < 24) {
    const h = Math.max(1, Math.round(ageHeures))
    label = 'Données mises à jour il y a ' + h + 'h'
    cls = 'text-gray-500'
  } else if (ageHeures < 48) {
    label = 'Pas synchro depuis 1 jour'
    cls = 'text-yellow-500'
  } else {
    const j = Math.floor(ageHeures / 24)
    label = 'Pas synchro depuis ' + j + ' jours'
    cls = 'text-red-400'
  }
  return <p className={"text-xs mt-0.5 " + cls}>{label}</p>
}

function VariationBadge({ variation }) {
  if (variation?.pct !== null && variation?.pct !== undefined) {
    const cls = variation.pct >= 0 ? 'text-green-400' : 'text-red-400'
    return (
      <span className={"text-xs font-mono " + cls}>
        {variation.pct >= 0 ? '+' : ''}{variation.pct.toFixed(1)}%
      </span>
    )
  }
  if (variation?.label) {
    return <span className="text-xs font-mono text-gray-500">{variation.label}</span>
  }
  return null
}

export default function DashboardClient({ data, params, periode }) {
  const [drill, setDrill] = useState(null)

  const objectifFoodCost = params?.objectif_food_cost || 30
  const alerteFoodCostMax = params?.alerte_food_cost_max || 32

  const caBrut = data?.ca?.brut || 0
  const caHT = data?.ca?.ht || 0
  const nbCommandes = data?.frequentation?.nbCommandes || 0
  const panierMoyen = data?.panierMoyen || 0
  const foodCostP = data?.foodCostP || 0
  const variations = data?.variations || { ca: {}, cmd: {}, panier: {}, label: 'vs période précédente' }
  const resteAFaire = data?.resteAFaire
  const lastSyncDate = data?.lastSyncDate

  const chargesFixesMensuelles = data?.chargesFixesMensuelles || 0
  const tauxMargeVariable = caHT > 0 ? ((caHT - caHT * (foodCostP / 100)) / caHT * 100) : 66
  const seuilJournalier = chargesFixesMensuelles > 0 ? Math.round(chargesFixesMensuelles / 30 / (tauxMargeVariable / 100)) : 0
  const caJour = data?.ca?.brut || 0
  const seuilAtteint = seuilJournalier > 0 && caJour >= seuilJournalier
  const seuilEcart = caJour - seuilJournalier

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto pb-24">

      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Mon Business</h1>
        <p className="text-blue-400 text-xs mt-0.5">{data.label} · {data.since} → {data.until}</p>
        <IndicSynchro lastSyncDate={lastSyncDate} />
      </div>

      <div className="mb-4">
        <PeriodFilter profil="pilotage" basePath="/dashboard" filtreActif={periode} />
      </div>

      {/* HERO CA refondu — tap → drill 'ca' (unifié au commit en cours) */}
      <div
        onClick={() => setDrill('ca')}
        className="bg-gray-900 rounded-2xl p-4 mb-3 border border-gray-800 cursor-pointer hover:border-gray-600 active:scale-[0.99] transition"
      >
        <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Chiffre d'affaires</p>
        <div className="flex items-baseline gap-3 mb-1">
          <p className="text-4xl font-bold tracking-tight text-green-400 font-mono">{fmt(caBrut)}</p>
          <VariationBadge variation={variations.ca} />
        </div>
        <p className="text-xs text-gray-500 mb-4">{variations.label}</p>

        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-800">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Commandes</p>
            <div className="flex items-baseline gap-2">
              <p className="text-xl font-bold font-mono text-white">{nbCommandes}</p>
              <VariationBadge variation={variations.cmd} />
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Panier moyen</p>
            <div className="flex items-baseline gap-2">
              <p className="text-xl font-bold font-mono text-white">{panierMoyen.toFixed(2)}€</p>
              <VariationBadge variation={variations.panier} />
            </div>
          </div>
        </div>

        {resteAFaire !== null && resteAFaire !== undefined && (
          <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-800">
            Reste à faire ce mois : <span className="font-mono text-gray-300">{fmt(resteAFaire)}</span>
          </p>
        )}
      </div>

      {/* FOOD COST — sera allégé au commit 3 */}
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

      {/* SEUIL — sera refondu au commit 2 */}
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

      {/* ACCES RAPIDE — sera transformé au commit 3 */}
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
          data={data}
          params={params}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  )
}
