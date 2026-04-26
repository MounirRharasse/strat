import { getAllReports, getAllOrders } from '@/lib/popina'
import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PreviClient from './PreviClient'

export default async function Previsions() {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    redirect('/login')
  }

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const firstDay = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]
  const nbJours = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const nbJoursEcoules = now.getDate()
  const nbJoursRestants = nbJours - nbJoursEcoules

  const toEuros = (c) => Math.round(c) / 100

  const [reports, orders, { data: transactions }, { data: historique }, { data: entreesUber }, { data: parametres }] = await Promise.all([
    getAllReports(firstDay, today),
    getAllOrders(firstDay, today),
    supabase.from('transactions').select('*').gte('date', firstDay).lte('date', today),
    supabase.from('historique_ca').select('*').gte('date', firstDay).lte('date', today),
    supabase.from('entrees').select('*').gte('date', firstDay).lte('date', today).eq('source', 'uber_eats'),
    supabase.from('parametres').select('*').eq('id', parametre_id).single()
  ])

  // CA Popina
  const caBrutPopina = reports.reduce((s, r) => s + toEuros(r.totalSales), 0)
  const tvaCollectee = reports.reduce((s, r) => s + (r.reportTaxes || []).reduce((t, x) => t + toEuros(x.taxAmount), 0), 0)

  // CA Uber
  const caUberHist = (historique || []).reduce((s, r) => s + (r.uber || 0), 0)
  const caUberManuel = (entreesUber || []).reduce((s, e) => s + (e.montant_ttc || 0), 0)
  const caUberTotal = caUberHist + caUberManuel
  const tvaUber = caUberTotal / 1.1 * 0.1

  // CA Total
  const caBrut = caBrutPopina + caUberTotal
  const tvaTotale = tvaCollectee + tvaUber

  // TVA déductible sur achats
  const tvaDeductible = (transactions || []).reduce((s, t) => s + (t.montant_tva || 0), 0)
  const tvaAPayer = Math.max(tvaTotale - tvaDeductible, 0)

  // Commandes
  const nbCmdValides = orders.filter(o => !o.isCanceled).length
  const nbCmdUber = (historique || []).reduce((s, r) => s + (r.nb_commandes || 0), 0) +
    (entreesUber || []).reduce((s, e) => s + (e.nb_commandes || 0), 0)
  const nbCommandes = nbCmdValides + nbCmdUber
  const panierMoyen = nbCommandes > 0 ? caBrut / nbCommandes : 0
  const commandesParJour = nbJoursEcoules > 0 ? Math.round(nbCommandes / nbJoursEcoules) : 150

  // Charges depuis transactions
  const getD = (cats) => (transactions || []).filter(t => cats.includes(t.categorie_pl)).reduce((s, t) => s + t.montant_ht, 0)
  const loyer = getD(['loyers_charges'])
  const redevance = getD(['redevance_marque'])
  const honoraires = getD(['honoraires'])
  const salaires = getD(['frais_personnel'])
  const consommations = getD(['consommations'])
  const totalCharges = (transactions || []).reduce((s, t) => s + t.montant_ht, 0)

  // URSSAF estimée
  const tauxUrssaf = (parametres?.taux_urssaf ?? 42) / 100
  const urssaf = Math.round(salaires * tauxUrssaf)

  // Commissions
  const tauxCB = (parametres?.taux_commission_cb ?? 1.5) / 100
  const tauxTR = (parametres?.taux_commission_tr ?? 4.0) / 100
  const tauxUber = (parametres?.taux_commission_uber ?? 15.0) / 100
  const allPayments = reports.flatMap(r => r.reportPayments || [])
  let borne = 0, cb = 0, tr = 0
  for (const p of allPayments) {
    const nom = (p.paymentName || '').toLowerCase()
    const m = toEuros(p.paymentAmount)
    if (nom.includes('borne')) borne += m
    else if (nom.includes('carte') || nom.includes('credit')) cb += m
    else if (nom.includes('titre') || nom.includes('restaurant')) tr += m
  }
  const commissionsCB = (borne + cb) * tauxCB
  const commissionsTR = tr * tauxTR
  const commissionsUber = caUberTotal * tauxUber

  // Caisse HT
  const caHT = caBrut - tvaTotale

  return (
    <PreviClient
      caBrut={caBrut}
      caHT={caHT}
      nbJours={nbJours}
      nbJoursEcoules={nbJoursEcoules}
      nbJoursRestants={nbJoursRestants}
      panierMoyen={panierMoyen}
      commandesParJour={commandesParJour}
      consommations={consommations}
      totalCharges={totalCharges}
      loyer={loyer}
      redevance={redevance}
      honoraires={honoraires}
      salaires={salaires}
      urssaf={urssaf}
      tvaAPayer={tvaAPayer}
      commissionsCB={commissionsCB}
      commissionsTR={commissionsTR}
      commissionsUber={commissionsUber}
      parametres={parametres || {}}
      regimeTva={parametres?.regime_tva || 'mensuel'}
    />
  )
}