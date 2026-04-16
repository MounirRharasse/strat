'use client'

import { useState, useEffect } from 'react'

const toISODate = (d) => new Date(d).toISOString().split('T')[0]

function getPeriodeDates(granularite, offset) {
  const now = new Date()
  let since, until, label, souslabel

  if (granularite === 'semaine') {
    const lundi = new Date(now)
    const day = now.getDay() || 7
    lundi.setDate(now.getDate() - day + 1 - offset * 7)
    const dimanche = new Date(lundi)
    dimanche.setDate(lundi.getDate() + 6)
    since = toISODate(lundi)
    until = toISODate(dimanche > now ? now : dimanche)
    const opts = { day: 'numeric', month: 'short' }
    label = offset === 0 ? 'Cette semaine' : offset === 1 ? 'Semaine derniere' : 'S-' + offset
    souslabel = lundi.toLocaleDateString('fr-FR', opts) + ' - ' + (dimanche > now ? now : dimanche).toLocaleDateString('fr-FR', opts)
  } else if (granularite === 'mois') {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    since = toISODate(d)
    const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    until = toISODate(fin > now ? now : fin)
    label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    souslabel = since + ' - ' + until
  } else if (granularite === 'trimestre') {
    const moisActuel = now.getMonth()
    const qActuel = Math.floor(moisActuel / 3)
    const qTotal = qActuel - offset
    const annee = now.getFullYear() + Math.floor(qTotal / 4)
    const q = ((qTotal % 4) + 4) % 4
    const debut = new Date(annee, q * 3, 1)
    const fin = new Date(annee, q * 3 + 3, 0)
    since = toISODate(debut)
    until = toISODate(fin > now ? now : fin)
    label = 'T' + (q + 1) + ' ' + annee
    souslabel = since + ' - ' + until
  }

  return { since, until, label, souslabel }
}

export default function AnalysesClient() {
  const [granularite, setGranularite] = useState('semaine')
  const [periodes, setPeriodes] = useState([
    { id: 0, offset: 0, data: null, loading: true, dates: null },
    { id: 1, offset: 1, data: null, loading: true, dates: null }
  ])
  const [aiInsight, setAiInsight] = useState(null)
  const [loadingAI, setLoadingAI] = useState(false)

  const fmt = (n) => new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(n || 0)

  async function loadPeriode(id, offset, gran) {
    const dates = getPeriodeDates(gran || granularite, offset)
    setPeriodes(prev => prev.map(p => p.id === id ? { ...p, loading: true, dates } : p))
    try {
      const res = await fetch('/api/analyses?since=' + dates.since + '&until=' + dates.until)
      const data = await res.json()
      setPeriodes(prev => prev.map(p => p.id === id ? { ...p, data, loading: false, dates } : p))
    } catch {
      setPeriodes(prev => prev.map(p => p.id === id ? { ...p, loading: false, dates } : p))
    }
  }

  useEffect(() => {
    periodes.forEach(p => loadPeriode(p.id, p.offset, granularite))
  }, [granularite])

  // Générer l'insight IA quand les deux premières périodes sont chargées
  useEffect(() => {
    const p0 = periodes.find(p => p.id === 0)
    const p1 = periodes.find(p => p.id === 1)
    if (!p0?.data || !p1?.data) return
    setLoadingAI(true)
    setAiInsight(null)
    fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'analyses',
        data: {
          labelRef: p0.dates?.label || 'Periode 1',
          caRef: p0.data.ca.ht,
          cmdRef: p0.data.frequentation.nbCommandes,
          panierRef: p0.data.panierMoyen,
          fcRef: p0.data.foodCostP,
          ebeRef: p0.data.ebe,
          labelComp: p1.dates?.label || 'Periode 2',
          caComp: p1.data.ca.ht,
          cmdComp: p1.data.frequentation.nbCommandes,
          panierComp: p1.data.panierMoyen,
          fcComp: p1.data.foodCostP,
          ebeComp: p1.data.ebe,
        }
      })
    })
    .then(r => r.json())
    .then(d => { setAiInsight(d.insight); setLoadingAI(false) })
    .catch(() => setLoadingAI(false))
  }, [periodes[0]?.data, periodes[1]?.data])

  function navPeriode(id, dir) {
    const p = periodes.find(x => x.id === id)
    if (!p) return
    const newOffset = p.offset + dir
    if (newOffset < 0) return
    setPeriodes(prev => prev.map(x => x.id === id ? { ...x, offset: newOffset, data: null, loading: true } : x))
    loadPeriode(id, newOffset, granularite)
  }

  function ajouterPeriode() {
    if (periodes.length >= 3) return
    const newId = Math.max(...periodes.map(p => p.id)) + 1
    const newOffset = Math.max(...periodes.map(p => p.offset)) + 1
    setPeriodes(prev => [...prev, { id: newId, offset: newOffset, data: null, loading: true, dates: null }])
    loadPeriode(newId, newOffset, granularite)
  }

  function supprimerPeriode(id) {
    if (periodes.length <= 2) return
    setPeriodes(prev => prev.filter(p => p.id !== id))
  }

  const periodesDiffDurees = periodes.filter(p => p.data).length >= 2 &&
    new Set(periodes.filter(p => p.data).map(p => p.data.nbJours)).size > 1

  const kpis = [
    { key: 'ca', label: 'CA HT', fmt: (d) => fmt(d.ca.ht), val: (d) => d.ca.ht, higher: true },
    { key: 'freq', label: 'Commandes', fmt: (d) => d.frequentation.nbCommandes, val: (d) => d.frequentation.nbCommandes, higher: true },
    { key: 'panier', label: 'Panier moyen', fmt: (d) => d.panierMoyen.toFixed(2) + '€', val: (d) => d.panierMoyen, higher: true },
    { key: 'fc', label: 'Food cost', fmt: (d) => d.foodCostP.toFixed(1) + '%', val: (d) => d.foodCostP, higher: false },
    { key: 'staff', label: 'Staff cost', fmt: (d) => d.staffCostP.toFixed(1) + '%', val: (d) => d.staffCostP, higher: false },
    { key: 'marge', label: 'Marge brute', fmt: (d) => d.margeBruteP.toFixed(1) + '%', val: (d) => d.margeBruteP, higher: true },
    { key: 'ebe', label: 'EBE', fmt: (d) => fmt(d.ebe), val: (d) => d.ebe, higher: true },
  ]

  const ref = periodes[0]

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto pb-24">

      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Analyses</h1>
        <p className="text-gray-400 text-sm mt-0.5">Comparez vos periodes librement</p>
      </div>

      <div className="flex gap-2 mb-4">
        {['semaine', 'mois', 'trimestre'].map(g => (
          <button key={g} onClick={() => setGranularite(g)}
            className={"flex-1 text-center text-xs py-2 rounded-xl border transition capitalize " + (granularite === g ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>
            {g === 'semaine' ? 'Semaine' : g === 'mois' ? 'Mois' : 'Trimestre'}
          </button>
        ))}
      </div>

      {periodesDiffDurees && (
        <div className="bg-yellow-950 border border-yellow-900 rounded-xl px-4 py-2 mb-3 text-xs text-yellow-400">
          Periodes de durees differentes — comparaison indicative
        </div>
      )}

      <div className="mb-4">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Periodes a comparer</p>
        <div className={"grid gap-2 " + (periodes.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
          {periodes.map((p, idx) => (
            <div key={p.id} className={"bg-gray-900 rounded-2xl border p-3 " + (idx === 0 ? 'border-blue-800' : 'border-gray-800')}>
              <div className="flex justify-between items-center mb-2">
                <button onClick={() => navPeriode(p.id, -1)} className="w-6 h-6 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 text-xs">‹</button>
                {idx === 0 && <span className="text-xs text-blue-400 font-medium">Ref.</span>}
                {idx > 0 && periodes.length > 2 && (
                  <button onClick={() => supprimerPeriode(p.id)} className="text-gray-600 text-xs">✕</button>
                )}
                <button onClick={() => navPeriode(p.id, 1)} disabled={p.offset === 0} className="w-6 h-6 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 text-xs disabled:opacity-30">›</button>
              </div>
              {p.loading ? (
                <div className="text-center py-2">
                  <p className="text-xs text-gray-500">Chargement...</p>
                </div>
              ) : p.dates ? (
                <>
                  <p className="text-xs font-semibold text-white text-center">{p.dates.label}</p>
                  <p className="text-xs text-gray-500 text-center mt-0.5">{p.dates.souslabel}</p>
                  {p.data && (
                    <>
                      <p className="text-sm font-mono font-bold text-green-400 text-center mt-2">{fmt(p.data.ca.ht)}</p>
                      <p className="text-xs text-gray-600 text-center">HT</p>
                    </>
                  )}
                </>
              ) : null}
            </div>
          ))}
          {periodes.length < 3 && (
            <button onClick={ajouterPeriode} className="bg-gray-900 rounded-2xl border border-dashed border-gray-700 p-3 flex items-center justify-center text-gray-600 hover:text-gray-400 hover:border-gray-600 transition">
              <span className="text-2xl">+</span>
            </button>
          )}
        </div>
      </div>

      {ref.data && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Resume periode de reference</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'CA HT', val: fmt(ref.data.ca.ht) },
              { label: 'Commandes', val: ref.data.frequentation.nbCommandes },
              { label: 'Panier moyen', val: ref.data.panierMoyen.toFixed(2) + '€' },
              { label: 'EBE', val: fmt(ref.data.ebe) },
            ].map(k => (
              <div key={k.label} className="bg-gray-800 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                <p className="text-base font-mono font-bold text-white">{k.val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* INSIGHT IA */}
      <div className="bg-blue-950/30 border border-blue-900/30 border-l-4 border-l-blue-500 rounded-xl px-4 py-3 mb-4">
        <p className="text-xs text-blue-400 uppercase tracking-wider mb-1">Analyse IA</p>
        {loadingAI ? (
          <p className="text-sm text-gray-500 animate-pulse">Analyse en cours...</p>
        ) : aiInsight ? (
          <p className="text-sm text-gray-300 leading-relaxed">{aiInsight}</p>
        ) : (
          <p className="text-sm text-gray-500">Chargement des donnees...</p>
        )}
      </div>

      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Tableau comparatif</p>
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className={"grid border-b border-gray-700 " + (periodes.length === 3 ? 'grid-cols-4' : 'grid-cols-3')}>
            <div className="px-3 py-2 text-xs text-gray-500 uppercase">Indicateur</div>
            {periodes.map((p, idx) => (
              <div key={p.id} className={"px-3 py-2 text-xs uppercase text-right " + (idx === 0 ? 'text-blue-400' : 'text-gray-500')}>
                {p.dates?.label?.split(' ')[0] || 'P' + (idx + 1)}
              </div>
            ))}
          </div>

          {kpis.map(kpi => {
            const vals = periodes.map(p => p.data ? kpi.val(p.data) : null)
            const refVal = vals[0]

            return (
              <div key={kpi.key} className={"grid border-b border-gray-800 last:border-0 " + (periodes.length === 3 ? 'grid-cols-4' : 'grid-cols-3')}>
                <div className="px-3 py-3">
                  <p className="text-sm text-gray-300">{kpi.label}</p>
                </div>
                {periodes.map((p, idx) => {
                  if (p.loading) return <div key={p.id} className="px-3 py-3 text-right"><p className="text-xs text-gray-600">...</p></div>
                  if (!p.data) return <div key={p.id} className="px-3 py-3 text-right"><p className="text-xs text-gray-600">—</p></div>

                  const val = kpi.val(p.data)
                  const fmtVal = kpi.fmt(p.data)

                  if (idx === 0) {
                    return (
                      <div key={p.id} className="px-3 py-3 text-right">
                        <p className="text-sm font-mono font-semibold text-white">{fmtVal}</p>
                      </div>
                    )
                  }

                  const diff = refVal !== null && val !== null ? refVal - val : null
                  const diffPct = val !== null && val !== 0 ? (diff / Math.abs(val) * 100) : null
                  const isGood = diff !== null ? (kpi.higher ? diff > 0 : diff < 0) : null

                  return (
                    <div key={p.id} className="px-3 py-3 text-right">
                      <p className="text-sm font-mono text-gray-300">{fmtVal}</p>
                      {diffPct !== null && (
                        <p className={"text-xs font-mono mt-0.5 " + (isGood ? 'text-green-400' : isGood === false ? 'text-red-400' : 'text-gray-500')}>
                          {diff > 0 ? '+' : ''}{diffPct.toFixed(1)}%
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}