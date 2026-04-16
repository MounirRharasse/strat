'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

export default function PLClient({ data, periode }) {
  const [onglet, setOnglet] = useState('resume')
  const [panel, setPanel] = useState(null)
  const [isMode, setIsMode] = useState('auto')
  const [isManuel, setIsManuel] = useState('')
  const donutRef = useRef(null)
  const chartInstance = useRef(null)

  const { caBrut, tvaCollectee, caHT, consommations, fraisPersonnel,
    autresChargesPersonnel, fraisDeplacement, entretiensReparations,
    energie, autresFraisInfluencables, loyersCharges, honoraires,
    redevanceMarque, prestationsOp, fraisDivers, autresCharges,
    caUberTotal, commissionCB, commissionTR, commissionUber, commissionFoxorder, totalCommissions,
    margebrute, totalPersonnel, totalInfluencables, totalFixe,
    ebe, impots, resultatNet, transactions, since, today } = data

  const isEstime = isMode === 'auto' ? impots : (parseFloat(isManuel) || 0)
  const resultatFinal = ebe - isEstime

  const fmt = (n) => new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(Math.abs(n))

  const pct = (val) => caHT > 0 ? (Math.abs(val) / caHT * 100).toFixed(1) + '%' : '0%'
  const foodCostP = caHT > 0 ? (consommations / caHT * 100) : 0
  const staffCostP = caHT > 0 ? (totalPersonnel / caHT * 100) : 0
  const ebeP = caHT > 0 ? (ebe / caHT * 100) : 0
  const posColor = (v) => v >= 0 ? 'text-green-400' : 'text-red-400'

  const getTxByCategorie = (cats) => (transactions || []).filter(t => cats.includes(t.categorie_pl))

  const openPanel = (title, cats, color) => {
    const txs = getTxByCategorie(cats)
    const total = txs.reduce((s, t) => s + t.montant_ht, 0)
    setPanel({ title, txs, total, color })
  }

  useEffect(() => {
    if (onglet !== 'resume' || !donutRef.current) return
    if (typeof window === 'undefined') return

    import('chart.js').then((ChartModule) => {
      const { Chart, ArcElement, Tooltip, Legend, DoughnutController } = ChartModule
      Chart.register(ArcElement, Tooltip, Legend, DoughnutController)
      if (chartInstance.current) chartInstance.current.destroy()

      const totalCharges = consommations + totalPersonnel + totalInfluencables + totalFixe + (totalCommissions || 0)
      if (totalCharges === 0) return

      chartInstance.current = new Chart(donutRef.current, {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [consommations, totalPersonnel, totalInfluencables, totalFixe, totalCommissions || 0],
            backgroundColor: ['#3b82f6', '#a78bfa', '#22c55e', '#06b6d4', '#f97316'],
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          cutout: '66%',
          responsive: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const labels = ['Consommations', 'Personnel', 'Influencables', 'Fixes', 'Commissions']
                  const pcts = ctx.parsed / totalCharges * 100
                  return ' ' + labels[ctx.dataIndex] + ': ' + pcts.toFixed(1) + '%'
                }
              }
            }
          }
        }
      })
    })
  }, [onglet, consommations, totalPersonnel, totalInfluencables, totalFixe, totalCommissions])

  const PRow = ({ label, value, isTotal, isSub, isMinus, indent, secteur, cats, color }) => (
    <div
      className={"flex items-center px-4 py-2.5 border-b border-gray-800 " + (isTotal ? 'bg-gray-800/80' : isSub ? 'bg-gray-900/60' : '') + (cats ? ' cursor-pointer hover:bg-gray-800/40' : '')}
      onClick={cats ? () => openPanel(label, cats, color || '#6b7280') : undefined}
    >
      <div className={"flex-1 " + (indent ? 'pl-3' : '')}>
        <p className={"text-sm " + (isTotal ? 'font-bold text-white' : isSub ? 'font-semibold text-gray-100' : 'text-gray-300')}>
          {isMinus && value !== 0 ? '− ' : ''}{label}
          {cats && <span className="text-gray-500 ml-1 text-xs">›</span>}
        </p>
        {secteur && <p className="text-xs text-gray-500 mt-0.5">Norme : {secteur}</p>}
      </div>
      <div className="text-right">
        <p className={"font-mono font-semibold " + (isTotal ? 'text-base ' : 'text-sm ') + posColor(value)}>
          {value >= 0 ? '' : '-'}{fmt(value)}
        </p>
        <p className="text-xs text-gray-500">{pct(value)}</p>
      </div>
    </div>
  )

  const SectionHeader = ({ label, color }) => (
    <div className={"px-4 py-1.5 border-b border-gray-800/50 " + color}>
      <p className="text-xs uppercase tracking-wider font-medium">{label}</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto pb-24">

      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">P&L</h1>
        <p className="text-gray-400 text-sm mt-0.5">{since} → {today}</p>
      </div>

      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Periode</p>
        <div className="flex gap-2 mb-3">
          <Link href="/pl?periode=7j" className={"flex-1 text-center text-xs py-2 rounded-xl border " + (periode === '7j' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-800 text-gray-400 border-gray-700')}>7 jours</Link>
          <Link href="/pl?periode=mtd" className={"flex-1 text-center text-xs py-2 rounded-xl border " + (periode === 'mtd' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-800 text-gray-400 border-gray-700')}>MTD</Link>
          <Link href="/pl?periode=ytd" className={"flex-1 text-center text-xs py-2 rounded-xl border " + (periode === 'ytd' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-800 text-gray-400 border-gray-700')}>YTD</Link>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 bg-gray-800 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">Debut</p>
            <p className="text-sm font-mono font-medium">{since}</p>
          </div>
          <div className="text-gray-600 flex items-center px-1">→</div>
          <div className="flex-1 bg-gray-800 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">Fin</p>
            <p className="text-sm font-mono font-medium">{today}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">CA HT</p>
          <p className="text-xl font-bold font-mono text-green-400">{fmt(caHT)}</p>
          <p className="text-xs text-gray-500 mt-1">TTC {fmt(caBrut)}</p>
          {caUberTotal > 0 && (
            <p className="text-xs text-green-700 mt-0.5">dont Uber {fmt(caUberTotal)}</p>
          )}
        </div>
        <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">EBE</p>
          <p className={"text-xl font-bold font-mono " + posColor(ebe)}>{ebe >= 0 ? '' : '-'}{fmt(ebe)}</p>
          <p className="text-xs text-gray-500 mt-1">{ebeP.toFixed(1)}% · Norme 15-20%</p>
        </div>
        <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Food cost</p>
          <p className={"text-xl font-bold font-mono " + (foodCostP > 32 ? 'text-red-400' : foodCostP > 30 ? 'text-yellow-400' : foodCostP > 0 ? 'text-green-400' : 'text-gray-500')}>
            {foodCostP > 0 ? foodCostP.toFixed(1) + '%' : 'N/A'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Norme 28-32%</p>
        </div>
        <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Staff cost</p>
          <p className={"text-xl font-bold font-mono " + (staffCostP > 35 ? 'text-red-400' : staffCostP > 0 ? 'text-green-400' : 'text-gray-500')}>
            {staffCostP > 0 ? staffCostP.toFixed(1) + '%' : 'N/A'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Norme 28-35%</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4 border-b border-gray-800 pb-3">
        {['resume', 'detail', 'comparaisons'].map(o => (
          <button key={o} onClick={() => setOnglet(o)}
            className={"px-4 py-2 rounded-xl text-sm font-medium border transition " + (onglet === o ? 'bg-white text-gray-950 border-white' : 'bg-gray-900 text-gray-400 border-gray-800')}>
            {o === 'resume' ? 'Resume' : o === 'detail' ? 'Detail' : 'Comparaisons'}
          </button>
        ))}
      </div>

      {onglet === 'resume' && (
        <>
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-4">
            <div className="px-4 py-2 bg-blue-950/40 border-b border-blue-900/30">
              <p className="text-xs text-blue-400 uppercase tracking-widest font-semibold">Compte de resultat</p>
            </div>

            <PRow label="CA brut TTC" value={caBrut} isSub />
            <PRow label="TVA collectee" value={-tvaCollectee} isMinus indent />
            <PRow label="CA HT" value={caHT} isTotal />

            <SectionHeader label="Consommations" color="bg-blue-950/20 text-blue-400" />
            <PRow label="Consommations" value={-consommations} isMinus indent secteur="28-32%" cats={['consommations']} color="#3b82f6" />
            <PRow label="Marge brute" value={margebrute} isTotal />

            <SectionHeader label="Personnel" color="bg-purple-950/20 text-purple-400" />
            <PRow label="Frais de personnel" value={-fraisPersonnel} isMinus indent cats={['frais_personnel']} color="#a78bfa" />
            <PRow label="Autres charges personnel" value={-autresChargesPersonnel} isMinus indent cats={['autres_charges_personnel']} color="#a78bfa" />
            <PRow label="Frais de deplacement" value={-fraisDeplacement} isMinus indent cats={['frais_deplacement']} color="#a78bfa" />

            <SectionHeader label="Frais influencables" color="bg-green-950/20 text-green-400" />
            <PRow label="Entretiens et Reparations" value={-entretiensReparations} isMinus indent cats={['entretiens_reparations']} color="#22c55e" />
            <PRow label="Energie" value={-energie} isMinus indent cats={['energie']} color="#22c55e" />
            <PRow label="Autres frais influencables" value={-autresFraisInfluencables} isMinus indent cats={['autres_frais_influencables']} color="#22c55e" />

            <SectionHeader label="Frais fixes" color="bg-cyan-950/20 text-cyan-400" />
            <PRow label="Loyers et Charges" value={-loyersCharges} isMinus indent secteur="max 10%" cats={['loyers_charges']} color="#06b6d4" />
            <PRow label="Honoraires" value={-honoraires} isMinus indent cats={['honoraires']} color="#06b6d4" />
            <PRow label="Redevance de Marque" value={-redevanceMarque} isMinus indent cats={['redevance_marque']} color="#06b6d4" />
            <PRow label="Prestations Operationnelles" value={-prestationsOp} isMinus indent cats={['prestations_operationnelles']} color="#06b6d4" />
            <PRow label="Frais Divers" value={-fraisDivers} isMinus indent cats={['frais_divers']} color="#06b6d4" />
            <PRow label="Autres charges" value={-autresCharges} isMinus indent cats={['autres_charges']} color="#06b6d4" />

            <SectionHeader label="Commissions plateformes" color="bg-orange-950/20 text-orange-400" />
            <PRow label="Commissions CB / Borne" value={-commissionCB} isMinus indent />
            <PRow label="Commissions Titres-restaurant" value={-commissionTR} isMinus indent />
            {commissionUber > 0 && <PRow label="Commissions Uber Eats" value={-commissionUber} isMinus indent />}
            {commissionFoxorder > 0 && <PRow label="Commissions Foxorder" value={-commissionFoxorder} isMinus indent />}

            <PRow label="EBE" value={ebe} isTotal secteur="15-20%" />

            <SectionHeader label="Fiscalite" color="bg-red-950/20 text-red-400" />
            <PRow label="Impots sur les benefices" value={-isEstime} isMinus indent />
            <PRow label="Resultat net" value={resultatFinal} isTotal />
          </div>

          <div className="text-xs text-yellow-600 bg-yellow-950 border border-yellow-900 rounded-xl px-4 py-3 mb-4 leading-relaxed">
            IS et fiscalite sont des estimations indicatives. Valide toujours avec ton expert-comptable.
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-4">
            <div className="px-4 py-2 border-b border-gray-800">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">IS — Impot sur les benefices</p>
            </div>
            <div className="p-4">
              <div className="flex bg-gray-800 rounded-xl p-1 mb-4">
                <button onClick={() => setIsMode('auto')} className={"flex-1 py-2 rounded-lg text-xs font-medium transition " + (isMode === 'auto' ? 'bg-white text-gray-950' : 'text-gray-400')}>Estimation auto</button>
                <button onClick={() => setIsMode('manuel')} className={"flex-1 py-2 rounded-lg text-xs font-medium transition " + (isMode === 'manuel' ? 'bg-white text-gray-950' : 'text-gray-400')}>Valeur reelle</button>
              </div>
              {isMode === 'auto' ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm py-1 border-b border-gray-800">
                    <span className="text-gray-400">Resultat avant IS</span>
                    <span className={"font-mono " + posColor(ebe)}>{ebe >= 0 ? '' : '-'}{fmt(ebe)}</span>
                  </div>
                  <div className="flex justify-between text-sm py-1 border-b border-gray-800">
                    <span className="text-gray-400">Taux applique</span>
                    <span className="font-mono text-white">{ebe <= 0 ? '0%' : ebe <= 42500 ? '15%' : '25%'}</span>
                  </div>
                  <div className="flex justify-between text-sm py-1">
                    <span className="font-medium text-white">IS estime</span>
                    <span className={"font-mono font-bold " + (isEstime > 0 ? 'text-red-400' : 'text-green-400')}>
                      {isEstime > 0 ? '-' : ''}{fmt(isEstime)}
                    </span>
                  </div>
                  {ebe <= 0 && <p className="text-xs text-green-600 mt-1">Resultat negatif — pas d'IS du. Deficit reportable.</p>}
                </div>
              ) : (
                <div>
                  <p className="text-xs text-gray-400 mb-3">Entre le montant IS reel avec ton comptable</p>
                  <div className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3">
                    <span className="text-gray-400">€</span>
                    <input
                      type="number"
                      value={isManuel}
                      onChange={e => setIsManuel(e.target.value)}
                      className="flex-1 bg-transparent text-white font-mono text-lg focus:outline-none"
                      placeholder="0"
                    />
                  </div>
                  {isManuel && (
                    <div className="flex justify-between text-sm mt-3 pt-3 border-t border-gray-800">
                      <span className="font-medium text-white">Resultat net apres IS</span>
                      <span className={"font-mono font-bold " + posColor(resultatFinal)}>{resultatFinal >= 0 ? '' : '-'}{fmt(resultatFinal)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-4">Repartition des charges</p>
            <div className="flex items-center gap-4">
              <canvas ref={donutRef} width={110} height={110} className="flex-shrink-0"></canvas>
              <div className="flex-1 space-y-2">
                {[
                  { label: 'Consommations', val: consommations, color: '#3b82f6', cats: ['consommations'] },
                  { label: 'Personnel', val: totalPersonnel, color: '#a78bfa', cats: ['frais_personnel', 'autres_charges_personnel', 'frais_deplacement'] },
                  { label: 'Frais influencables', val: totalInfluencables, color: '#22c55e', cats: ['entretiens_reparations', 'energie', 'autres_frais_influencables'] },
                  { label: 'Frais fixes', val: totalFixe, color: '#06b6d4', cats: ['loyers_charges', 'honoraires', 'redevance_marque', 'prestations_operationnelles', 'frais_divers', 'autres_charges'] },
                  { label: 'Commissions', val: totalCommissions || 0, color: '#f97316', cats: [] },
                ].filter(i => i.val > 0).map(item => (
                  <div key={item.label} className="flex items-center justify-between cursor-pointer hover:bg-gray-800/50 rounded-lg px-2 py-1"
                    onClick={() => item.cats.length > 0 ? openPanel(item.label, item.cats, item.color) : null}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }}></div>
                      <span className="text-xs text-gray-300">{item.label}</span>
                    </div>
                    <span className="text-xs font-mono text-gray-400">{caHT > 0 ? (item.val / caHT * 100).toFixed(1) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {onglet === 'detail' && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          {(transactions || []).length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">Aucune depense saisie sur cette periode</div>
          ) : (
            Object.entries(
              (transactions || []).reduce((acc, t) => {
                const cat = t.categorie_pl || 'autres'
                if (!acc[cat]) acc[cat] = []
                acc[cat].push(t)
                return acc
              }, {})
            ).map(([cat, txs]) => {
              const total = txs.reduce((s, t) => s + t.montant_ht, 0)
              return (
                <div key={cat}>
                  <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-700">
                    <div className="flex justify-between">
                      <p className="text-xs text-gray-400 uppercase tracking-wider">{cat.replace(/_/g, ' ')}</p>
                      <p className="text-xs font-mono text-red-400">-{fmt(total)}</p>
                    </div>
                  </div>
                  {txs.map(t => (
                    <div key={t.id} className="flex items-center px-4 py-2.5 border-b border-gray-800 last:border-0">
                      <div className="flex-1">
                        <p className="text-sm text-gray-300">{t.fournisseur_nom}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{t.date}</p>
                        {t.note && <p className="text-xs text-gray-600 mt-0.5">{t.note}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono text-red-400">-{fmt(t.montant_ht)}</p>
                        <p className="text-xs text-gray-500">TVA {t.taux_tva}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </div>
      )}

      {onglet === 'comparaisons' && (
        <div>
          <div className="bg-blue-950/30 border border-blue-900/30 rounded-xl px-4 py-3 mb-4 text-xs text-blue-400">
            Comparaison avancee multi-periodes disponible dans Analyses →
          </div>
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            <div className="grid grid-cols-3 border-b border-gray-800">
              <div className="px-4 py-2 text-xs text-gray-500 uppercase">Indicateur</div>
              <div className="px-4 py-2 text-xs text-gray-500 uppercase text-right">Ce mois</div>
              <div className="px-4 py-2 text-xs text-gray-500 uppercase text-right">Norme</div>
            </div>
            {[
              { label: 'CA HT', val: fmt(caHT), norme: '—' },
              { label: 'Food cost', val: foodCostP.toFixed(1) + '%', norme: '28-32%', ok: foodCostP <= 32 && foodCostP > 0 },
              { label: 'Staff cost', val: staffCostP.toFixed(1) + '%', norme: '28-35%', ok: staffCostP <= 35 && staffCostP > 0 },
              { label: 'Commissions', val: fmt(totalCommissions || 0), norme: '—' },
              { label: 'EBE', val: ebeP.toFixed(1) + '%', norme: '15-20%', ok: ebeP >= 15 },
              { label: 'Resultat net', val: (resultatFinal >= 0 ? '' : '-') + fmt(resultatFinal), norme: '> 0', ok: resultatFinal >= 0 },
            ].map(row => (
              <div key={row.label} className="grid grid-cols-3 border-b border-gray-800 last:border-0">
                <div className="px-4 py-3 text-sm text-gray-300">{row.label}</div>
                <div className={"px-4 py-3 text-sm font-mono text-right " + (row.ok === true ? 'text-green-400' : row.ok === false ? 'text-red-400' : 'text-white')}>{row.val}</div>
                <div className="px-4 py-3 text-xs text-gray-500 text-right">{row.norme}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {panel && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setPanel(null)}></div>
          <div className="fixed top-0 right-0 h-full w-4/5 max-w-sm bg-gray-900 border-l border-gray-800 z-50 overflow-y-auto pb-8">
            <div className="flex items-center gap-3 p-4 border-b border-gray-800">
              <button onClick={() => setPanel(null)} className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <polyline points="9,2 4,7 9,12"/>
                </svg>
              </button>
              <div className="flex-1">
                <p className="font-semibold" style={{ color: panel.color }}>{panel.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{panel.txs.length} ecriture(s)</p>
              </div>
              <p className="text-lg font-mono font-bold text-red-400">-{fmt(panel.total)}</p>
            </div>
            {panel.txs.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">Aucune ecriture sur cette periode</div>
            ) : (
              <>
                <div className="p-4 border-b border-gray-800">
                  <p className="text-xs text-gray-500 mb-3">Repartition par fournisseur</p>
                  {panel.txs.map((t) => {
                    const pctBar = panel.total > 0 ? (t.montant_ht / panel.total * 100) : 0
                    return (
                      <div key={t.id} className="mb-3">
                        <div className="flex justify-between mb-1">
                          <span className="text-sm text-gray-300">{t.fournisseur_nom}</span>
                          <span className="text-sm font-mono text-red-400">-{fmt(t.montant_ht)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full">
                          <div className="h-1.5 rounded-full" style={{ width: pctBar + '%', backgroundColor: panel.color }}></div>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-xs text-gray-600">{t.date}</span>
                          <span className="text-xs text-gray-600">{pctBar.toFixed(0)}% du total</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-500 mb-3">Toutes les ecritures</p>
                  {panel.txs.map(t => (
                    <div key={t.id} className="flex items-center py-2.5 border-b border-gray-800 last:border-0">
                      <div className="flex-1">
                        <p className="text-sm text-gray-300">{t.fournisseur_nom}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{t.date} · TVA {t.taux_tva}%</p>
                        {t.note && <p className="text-xs text-gray-600 mt-0.5">{t.note}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono text-red-400">-{fmt(t.montant_ht)}</p>
                        <p className="text-xs text-gray-600">TTC {fmt(t.montant_ttc)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}