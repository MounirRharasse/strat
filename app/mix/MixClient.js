'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function MixClient({ mix, uberTop, uberParHeure, caUber, caRestaurant, caTotal, periode }) {
  const [onglet, setOnglet] = useState('amplitude')

  const fmt = (n) => new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(n || 0)

  const pct = (val, total) => total > 0 ? Math.round(val / total * 100) : 0

  const heures = Array.from({ length: 13 }, (_, i) => String(i + 10).padStart(2, '0'))
  const amplitudeData = heures.map(h => {
    const uber = uberParHeure[h] || { nb: 0, ca: 0 }
    return {
      heure: h + 'h',
      caUber: Math.round(uber.ca),
      nbUber: uber.nb,
      caTotal: Math.round(uber.ca),
    }
  }).filter(h => h.caTotal > 0 || h.nbUber > 0)

  const maxAmplitude = Math.max(...amplitudeData.map(h => h.caTotal), 1)
  const picHeure = amplitudeData.reduce((max, h) => h.caTotal > max.caTotal ? h : max, { caTotal: 0, heure: '—' })

  const popinaTop = (mix.top || []).map(p => ({ ...p, canal: p.canal === 'online' ? 'foxorder' : 'caisse' }))
  const fusionMap = {}
  for (const p of [...popinaTop, ...uberTop]) {
    const key = p.nom.toLowerCase().trim()
    if (!fusionMap[key]) fusionMap[key] = { nom: p.nom, ca: 0, quantite: 0, canaux: [] }
    fusionMap[key].ca += p.ca
    fusionMap[key].quantite += p.quantite
    if (!fusionMap[key].canaux.includes(p.canal)) fusionMap[key].canaux.push(p.canal)
  }
  const topFusion = Object.values(fusionMap).sort((a, b) => b.ca - a.ca).slice(0, 15)
  const maxCA = topFusion.length > 0 ? topFusion[0].ca : 1

  const canalColor = (canaux) => {
    if (canaux.includes('uber') && (canaux.includes('caisse') || canaux.includes('foxorder'))) return 'bg-purple-500'
    if (canaux.includes('uber')) return 'bg-green-500'
    if (canaux.includes('foxorder')) return 'bg-orange-500'
    return 'bg-blue-500'
  }

  const nbUberTotal = Object.values(uberParHeure).reduce((s, h) => s + h.nb, 0)

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto pb-24">

      <div className="flex items-center gap-3 mb-4">
        <Link href="/dashboard" className="w-9 h-9 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <polyline points="10,3 5,8 10,13"/>
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Mix ventes</h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">CA période</p>
          <p className="text-base font-mono font-bold text-green-400">{fmt(caTotal)}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {[
          { val: 'today', label: 'Auj.' },
          { val: 'week', label: '7 jours' },
          { val: 'month', label: '30 jours' },
        ].map(p => (
          <Link key={p.val} href={`/mix?periode=${p.val}`}
            className={"flex-1 text-center text-xs py-2 rounded-xl border " + (periode === p.val ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>
            {p.label}
          </Link>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        {[
          { key: 'amplitude', label: '⏱ Amplitude' },
          { key: 'canaux', label: '📊 Canaux' },
          { key: 'produits', label: '🏆 Produits' },
        ].map(o => (
          <button key={o.key} onClick={() => setOnglet(o.key)}
            className={"flex-1 text-center text-xs py-2 rounded-xl border transition " + (onglet === o.key ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>
            {o.label}
          </button>
        ))}
      </div>

      {onglet === 'amplitude' && (
        <div className="space-y-3">
          {amplitudeData.length === 0 ? (
            <div className="bg-gray-900 rounded-2xl p-8 text-center border border-gray-800">
              <p className="text-gray-400 text-sm">Pas de données d'amplitude</p>
              <p className="text-gray-600 text-xs mt-1">Importe les rapports Uber Eats pour voir les amplitudes</p>
            </div>
          ) : (
            <>
              <div className="bg-blue-950/30 border border-blue-900/30 rounded-2xl p-4">
                <p className="text-xs text-blue-400 uppercase tracking-wider mb-1">Pic d'activité Uber</p>
                <p className="text-2xl font-bold">{picHeure.heure}</p>
                <p className="text-gray-400 text-sm">{fmt(picHeure.caTotal)} · {picHeure.nbUber} commandes</p>
              </div>

              <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-4">CA par heure — Uber Eats</p>
                <div className="space-y-2">
                  {amplitudeData.map(h => (
                    <div key={h.heure} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-gray-500 w-8 flex-shrink-0">{h.heure}</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-5 relative overflow-hidden">
                        <div className="h-5 rounded-full bg-green-600 transition-all"
                          style={{ width: (h.caUber / maxAmplitude * 100) + '%' }}></div>
                        <span className="absolute inset-0 flex items-center px-2 text-xs text-white font-medium">
                          {h.caUber > 0 ? fmt(h.caUber) : ''}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 w-12 text-right flex-shrink-0">{h.nbUber} cmd</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-gray-800 flex items-center gap-2 text-xs text-gray-500">
                  <div className="w-2 h-2 rounded-full bg-green-600"></div>
                  <span>Uber Eats uniquement · Données Popina à venir</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {onglet === 'canaux' && (
        <div className="space-y-3">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-4">Répartition du CA</p>
            <div className="flex gap-0.5 h-3 rounded-full overflow-hidden mb-4">
              <div className="bg-blue-500 transition-all" style={{ flex: caRestaurant || 0.01 }}></div>
              <div className="bg-green-500 transition-all" style={{ flex: caUber || 0.01 }}></div>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Restaurant (VSP)', ca: caRestaurant, color: 'bg-blue-500' },
                { label: 'Uber Eats (VAE)', ca: caUber, color: 'bg-green-500' },
              ].map(c => (
                <div key={c.label} className="flex items-center gap-3">
                  <div className={"w-3 h-3 rounded-full flex-shrink-0 " + c.color}></div>
                  <span className="text-sm text-gray-300 flex-1">{c.label}</span>
                  <span className="text-sm font-mono font-semibold">{fmt(c.ca)}</span>
                  <span className="text-xs text-gray-500 w-10 text-right">{pct(c.ca, caTotal)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
              <p className="text-xs text-gray-500 mb-1">Restaurant</p>
              <p className="text-xl font-bold font-mono text-blue-400">{fmt(caRestaurant)}</p>
              <p className="text-xs text-gray-600 mt-1">{pct(caRestaurant, caTotal)}% du CA</p>
            </div>
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
              <p className="text-xs text-gray-500 mb-1">Uber Eats</p>
              <p className="text-xl font-bold font-mono text-green-400">{fmt(caUber)}</p>
              <p className="text-xs text-gray-600 mt-1">{nbUberTotal} commandes</p>
            </div>
          </div>
        </div>
      )}

      {onglet === 'produits' && (
        <div className="space-y-3">
          <div className="flex gap-3 text-xs text-gray-500 px-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>Restaurant</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>Uber</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span>Les deux</span>
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            {topFusion.map((p, i) => (
              <div key={p.nom} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0">
                <span className="text-sm font-mono text-gray-500 w-6 flex-shrink-0">{i + 1}</span>
                <div className={"w-2 h-2 rounded-full flex-shrink-0 " + canalColor(p.canaux)}></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.nom}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-green-500"
                        style={{ width: (p.ca / maxCA * 100) + '%' }}></div>
                    </div>
                    <span className="text-xs text-gray-500 flex-shrink-0">{pct(p.ca, caTotal)}%</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-mono font-semibold text-green-400">{fmt(p.ca)}</p>
                  <p className="text-xs text-gray-500">x{Math.round(p.quantite)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}