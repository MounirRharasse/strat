import { getAllReports, getAllOrders } from '@/lib/popina'
import { supabase } from '@/lib/supabase'

// Classification des paiements par substring sur paymentName.
// Anti-pattern flaggé dans l'audit, à refondre quand la table modes_paiement
// sera typée. Pour V1, comportement préservé tel quel.
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

/**
 * Calcule les KPIs métier pour une période donnée.
 *
 * Logique :
 * - Si la période contient des dates manquantes dans historique_ca ou inclut today,
 *   appel direct à Popina via getAllReports/getAllOrders pour les chiffres frais.
 * - Sinon (période entièrement historisée), agrégation depuis historique_ca pour
 *   éviter les appels Popina coûteux.
 *
 * Le caller passe `parametres` (déjà fetché) pour éviter une 2e lecture Supabase.
 */
export async function getAnalysesKPIs({ parametre_id, since, until, parametres }) {
  const toEuros = (c) => Math.round(c) / 100
  const today = new Date().toISOString().split('T')[0]
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = yesterdayDate.toISOString().split('T')[0]

  const [{ data: transactions }, { data: historique }, { data: entreesUber }, { data: inventaires }] = await Promise.all([
    supabase.from('transactions').select('*').eq('parametre_id', parametre_id).gte('date', since).lte('date', until),
    supabase.from('historique_ca').select('*').eq('parametre_id', parametre_id).gte('date', since).lte('date', until),
    supabase.from('entrees').select('*').eq('parametre_id', parametre_id).gte('date', since).lte('date', until).eq('source', 'uber_eats'),
    supabase.from('inventaires').select('date, valeur_totale').eq('parametre_id', parametre_id).order('date', { ascending: true })
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

  let caBrut, caHT, tva, caisseCA, foxorderCA, caUberTotal, nbCommandes, nbCommandesUber, paiements, cashADeposer, commissions

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
    nbCommandesUber = nbCmdUber
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
    // Convention V1 Krousty : historique_ca.nb_commandes représente Uber (pas de Popina sur période passée).
    // V1.1 : refacto vers une vraie séparation par canal quand table `sources` arrivera.
    nbCommandesUber = nbCmdHist + nbCmdUber
  }

  const panierMoyen = nbCommandes > 0 ? caBrut / nbCommandes : 0
  const getD = (cats) => (transactions || []).filter(t => cats.includes(t.categorie_pl)).reduce((s, t) => s + t.montant_ht, 0)
  const consommations = getD(['consommations'])
  const personnel = getD(['frais_personnel', 'autres_charges_personnel', 'frais_deplacement'])
  const totalCharges = (transactions || []).reduce((s, t) => s + t.montant_ht, 0)
  const margebrute = caHT - consommations
  const margeBruteP = caHT > 0 ? margebrute / caHT * 100 : 0
  let foodCostP = caHT > 0 ? consommations / caHT * 100 : 0
  const staffCostP = caHT > 0 ? personnel / caHT * 100 : 0
  const ebe = caHT - totalCharges
  const ebeP = caHT > 0 ? ebe / caHT * 100 : 0

  // === Food cost ajusté ===
  // Sélection :
  //   Stock_début = priorité au plus récent inventaire ≤ since (peut être avant since),
  //                 à défaut le plus ancien dans [since, until]
  //   Stock_fin   = le plus récent inventaire ≤ until ET > Stock_début.date
  //
  // Calcul exact possible si Stock_début ET Stock_fin distincts.
  // Branche !needsPopina (période passée) : refetch des données manquantes si la sous-période
  // déborde de [since, until] (cas stockDebut.date < since).
  // Branche needsPopina (période en cours) : skip exact en V1 — fallback estimé.
  // Cf. STRAT_CADRAGE.md §14 + décision produit du 2026-04-28.
  let foodCostMode = 'estime'
  let foodCostPeriode = { since, until }

  const invs = inventaires || []
  let stockDebut = null
  let stockFin = null

  const invsAvantOuEgalSince = invs.filter(i => i.date <= since)
  if (invsAvantOuEgalSince.length > 0) {
    stockDebut = invsAvantOuEgalSince[invsAvantOuEgalSince.length - 1]
  } else {
    const invsDansPeriode = invs.filter(i => i.date >= since && i.date <= until)
    if (invsDansPeriode.length > 0) {
      stockDebut = invsDansPeriode[0]
    }
  }

  if (stockDebut) {
    const candidatsFin = invs.filter(i => i.date <= until && i.date > stockDebut.date)
    if (candidatsFin.length > 0) {
      stockFin = candidatsFin[candidatsFin.length - 1]
    }
  }

  if (stockDebut && stockFin && !needsPopina) {
    const debutDate = stockDebut.date
    const finDate = stockFin.date

    // Si la sous-période déborde avant `since`, refetch les datasets sur la plage manquante.
    let histPourExact = historique || []
    let entreesUberPourExact = entreesUber || []
    let transactionsPourExact = transactions || []

    if (debutDate < since) {
      const [{ data: histAvant }, { data: entreesAvant }, { data: transactionsAvant }] = await Promise.all([
        supabase.from('historique_ca').select('*').eq('parametre_id', parametre_id).gte('date', debutDate).lt('date', since),
        supabase.from('entrees').select('*').eq('parametre_id', parametre_id).gte('date', debutDate).lt('date', since).eq('source', 'uber_eats'),
        supabase.from('transactions').select('*').eq('parametre_id', parametre_id).gte('date', debutDate).lt('date', since)
      ])
      histPourExact = [...(histAvant || []), ...histPourExact]
      entreesUberPourExact = [...(entreesAvant || []), ...entreesUberPourExact]
      transactionsPourExact = [...(transactionsAvant || []), ...transactionsPourExact]
    }

    const histExact = histPourExact.filter(h => h.date >= debutDate && h.date <= finDate)
    const caHistExact = histExact.reduce((s, r) => s + (r.ca_ht || 0), 0)
    const uberManuelExact = entreesUberPourExact
      .filter(e => e.date >= debutDate && e.date <= finDate)
      .reduce((s, e) => s + (e.montant_ttc || 0), 0)
    const caHTExact = caHistExact + (uberManuelExact / 1.1)

    const achatsExact = transactionsPourExact
      .filter(t => t.date >= debutDate && t.date <= finDate && t.categorie_pl === 'consommations')
      .reduce((s, t) => s + (t.montant_ht || 0), 0)

    if (caHTExact > 0) {
      const variationStock = stockDebut.valeur_totale - stockFin.valeur_totale
      const foodCostExact = ((variationStock + achatsExact) / caHTExact) * 100
      foodCostP = Math.round(foodCostExact * 100) / 100
      foodCostMode = 'exact'
      foodCostPeriode = { since: debutDate, until: finDate }
    }
  }

  return {
    since, until, nbJours,
    ca: {
      brut: Math.round(caBrut * 100) / 100,
      ht: Math.round(caHT * 100) / 100,
      tva: Math.round(tva * 100) / 100,
      caisse: Math.round(caisseCA * 100) / 100,
      foxorder: Math.round(foxorderCA * 100) / 100,
      uber: Math.round(caUberTotal * 100) / 100,
      online: Math.round((foxorderCA + caUberTotal) * 100) / 100,
      moyenParJour: Math.round((caBrut / Math.max(nbJours, 1)) * 100) / 100
    },
    frequentation: { nbCommandes, nbCommandesUber, moyenParJour: Math.round((nbCommandes / Math.max(nbJours, 1)) * 100) / 100 },
    panierMoyen: Math.round(panierMoyen * 100) / 100,
    paiements, cashADeposer, commissions,
    foodCostP: Math.round(foodCostP * 100) / 100,
    foodCostMode,
    foodCostPeriode,
    staffCostP: Math.round(staffCostP * 100) / 100,
    margeBruteP: Math.round(margeBruteP * 100) / 100,
    ebeP: Math.round(ebeP * 100) / 100,
    ebe: Math.round(ebe * 100) / 100,
    consommations: Math.round(consommations * 100) / 100,
    personnel: Math.round(personnel * 100) / 100,
    nbReports: historique?.length || 0
  }
}
