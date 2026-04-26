import { getAllReports, getAllOrders } from '@/lib/popina'
import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'

function repartitionPaiements(payments) {
  const r = { borne: 0, cb: 0, especes: 0, tr: 0, avoir: 0 }
  for (const p of payments) {
    const nom = (p.paymentName || '').toLowerCase()
    const montant = Math.round(p.paymentAmount) / 100
    if (nom.includes('borne')) r.borne += montant
    else if (nom.includes('carte') || nom.includes('credit') || nom.includes('crédit')) r.cb += montant
    else if (nom.includes('esp')) r.especes += montant
    else if (nom.includes('titre') || nom.includes('restaurant')) r.tr += montant
    else if (nom.includes('avoir')) r.avoir += montant
  }
  return r
}

export async function GET(request) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const since = searchParams.get('since')
  const until = searchParams.get('until')
  if (!since || !until) return Response.json({ error: 'since et until requis' }, { status: 400 })
  const toEuros = (c) => Math.round(c) / 100
  const today = new Date().toISOString().split('T')[0]
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = yesterdayDate.toISOString().split('T')[0]
  try {
    const [{ data: transactions }, { data: historique }, { data: entreesUber }, { data: parametres }] = await Promise.all([
      supabase.from('transactions').select('*').gte('date', since).lte('date', until),
      supabase.from('historique_ca').select('*').gte('date', since).lte('date', until),
      supabase.from('entrees').select('*').gte('date', since).lte('date', until).eq('source', 'uber_eats'),
      supabase.from('parametres').select('*').eq('id', parametre_id).single()
    ])
    const tauxCB = (parametres?.taux_commission_cb ?? 1.5) / 100
    const tauxTR = (parametres?.taux_commission_tr ?? 4.0) / 100
    const tauxUber = (parametres?.taux_commission_uber ?? 15.0) / 100
    const tauxFoxorder = (parametres?.taux_commission_foxorder ?? 0) / 100
    const nbJours = Math.round((new Date(until) - new Date(since)) / 86400000) + 1
    const histDates = new Set((historique || []).map(h => h.date))
const datesManquantes = []
const dateDebut = new Date(since + 'T12:00:00')
const dateLimite = new Date((until < today ? until : yesterday) + 'T12:00:00')
for (let d = new Date(dateDebut); d <= dateLimite; d.setDate(d.getDate() + 1)) {
  const dateStr = d.toISOString().split('T')[0]
  if (!histDates.has(dateStr)) datesManquantes.push(dateStr)
}
const needsPopina = datesManquantes.length > 0 || until >= today
    let caBrut, caHT, tva, caisseCA, foxorderCA, caUberTotal, nbCommandes, paiements, cashADeposer, commissions
    if (needsPopina) {
      const [reports, orders] = await Promise.all([getAllReports(since, until), getAllOrders(since, until)])
      const caBrutPopina = reports.reduce((s, r) => s + toEuros(r.totalSales), 0)
      tva = reports.reduce((s, r) => s + (r.reportTaxes || []).reduce((t, x) => t + toEuros(x.taxAmount), 0), 0)
      const caHTPopina = caBrutPopina - tva
      const caUberHistorique = (historique || []).reduce((s, r) => s + (r.uber || 0), 0)
      const caUberManuel = (entreesUber || []).reduce((s, e) => s + (e.montant_ttc || 0), 0)
      caUberTotal = caUberHistorique + caUberManuel
      caBrut = caBrutPopina + caUberTotal
      caHT = caHTPopina + (caUberTotal / 1.1)
      const allProducts = reports.flatMap(r => r.reportProducts || [])
      const allPayments = reports.flatMap(r => r.reportPayments || [])
      caisseCA = allProducts.filter(p => p.category !== 'FOXORDERS').reduce((s, p) => s + toEuros(p.productSales), 0)
      foxorderCA = allProducts.filter(p => p.category === 'FOXORDERS').reduce((s, p) => s + toEuros(p.productSales), 0)
      const nbCmdPopina = orders.filter(o => !o.isCanceled).length
      const nbCmdUber = (historique || []).reduce((s, r) => s + (r.nb_commandes || 0), 0) + (entreesUber || []).reduce((s, e) => s + (e.nb_commandes || 0), 0)
      nbCommandes = nbCmdPopina + nbCmdUber
      paiements = repartitionPaiements(allPayments)
      cashADeposer = paiements.especes
      commissions = { cb: (paiements.borne + paiements.cb) * tauxCB, tr: paiements.tr * tauxTR, uber: caUberTotal * tauxUber, foxorder: foxorderCA * tauxFoxorder }
    } else {
      const uberHist = historique.reduce((s, r) => s + (r.uber || 0), 0)
      const uberManuel = (entreesUber || []).reduce((s, e) => s + (e.montant_ttc || 0), 0)
      caUberTotal = uberHist + uberManuel
      const caHistBrut = historique.reduce((s, r) => s + (r.ca_brut || 0), 0)
      const caHistHT = historique.reduce((s, r) => s + (r.ca_ht || 0), 0)
      caBrut = caHistBrut + uberManuel
      caHT = caHistHT + (uberManuel / 1.1)
      tva = caBrut - caHT
      const caHorUber = caHistBrut - uberHist
      caisseCA = caHorUber * 0.55
      foxorderCA = caHorUber * 0.45
      const especes = historique.reduce((s, r) => s + (r.especes || 0), 0)
      const cb = historique.reduce((s, r) => s + (r.cb || 0), 0)
      const tr = historique.reduce((s, r) => s + (r.tr || 0), 0)
      const tpa = historique.reduce((s, r) => s + (r.tpa || 0), 0)
      paiements = { borne: tpa, cb, especes, tr, avoir: 0 }
      cashADeposer = especes
      commissions = { cb: (tpa + cb) * tauxCB, tr: tr * tauxTR, uber: caUberTotal * tauxUber, foxorder: foxorderCA * tauxFoxorder }
      const nbCmdHist = historique.reduce((s, r) => s + (r.nb_commandes || 0), 0)
      const nbCmdUber = (entreesUber || []).reduce((s, e) => s + (e.nb_commandes || 0), 0)
      nbCommandes = nbCmdHist + nbCmdUber
    }
    const panierMoyen = nbCommandes > 0 ? caBrut / nbCommandes : 0
    const getD = (cats) => (transactions || []).filter(t => cats.includes(t.categorie_pl)).reduce((s, t) => s + t.montant_ht, 0)
    const consommations = getD(['consommations'])
    const personnel = getD(['frais_personnel', 'autres_charges_personnel', 'frais_deplacement'])
    const totalCharges = (transactions || []).reduce((s, t) => s + t.montant_ht, 0)
    const margebrute = caHT - consommations
    const margeBruteP = caHT > 0 ? margebrute / caHT * 100 : 0
    const foodCostP = caHT > 0 ? consommations / caHT * 100 : 0
    const staffCostP = caHT > 0 ? personnel / caHT * 100 : 0
    const ebe = caHT - totalCharges
    const ebeP = caHT > 0 ? ebe / caHT * 100 : 0
    return Response.json({
      since, until, nbJours,
      ca: { brut: Math.round(caBrut*100)/100, ht: Math.round(caHT*100)/100, tva: Math.round(tva*100)/100, caisse: Math.round(caisseCA*100)/100, foxorder: Math.round(foxorderCA*100)/100, uber: Math.round(caUberTotal*100)/100, online: Math.round((foxorderCA+caUberTotal)*100)/100, moyenParJour: Math.round((caBrut/Math.max(nbJours,1))*100)/100 },
      frequentation: { nbCommandes, moyenParJour: Math.round((nbCommandes/Math.max(nbJours,1))*100)/100 },
      panierMoyen: Math.round(panierMoyen*100)/100,
      paiements, cashADeposer, commissions,
      foodCostP: Math.round(foodCostP*100)/100,
      staffCostP: Math.round(staffCostP*100)/100,
      margeBruteP: Math.round(margeBruteP*100)/100,
      ebeP: Math.round(ebeP*100)/100,
      ebe: Math.round(ebe*100)/100,
      consommations: Math.round(consommations*100)/100,
      personnel: Math.round(personnel*100)/100,
      nbReports: historique?.length || 0
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}