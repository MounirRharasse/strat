import { getAllReports } from '@/lib/popina'
import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'
import { getRowsCompatHCA } from '@/lib/data/ventes'
import { getPeriodeFromFiltreId } from '@/lib/periods'
import { agregerHierarchie } from '@/lib/analyses/sorties'
import { redirect } from 'next/navigation'
import PLClient from './PLClient'

export default async function PL({ searchParams }) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    redirect('/login')
  }

  const { data: parametres } = await supabase.from('parametres').select('*').eq('id', parametre_id).single()
  const timezone = parametres?.timezone || 'Europe/Paris'

  const periode = searchParams?.periode || 'ce-mois'
  const { since, until } = getPeriodeFromFiltreId(periode, { timezone })
  const today = until

  const toEuros = (c) => Math.round(c) / 100

  // Migration étape 5 Lot 4 : historique + entrees uber → getRowsCompatHCA.
  // historique[i].uber = VPS uber_eats.montant_ttc (cohérent avec legacy historique_ca.uber).
  const [reports, { data: transactions }, historique] = await Promise.all([
    getAllReports(since, today),
    supabase.from('transactions').select('*').eq('parametre_id', parametre_id).gte('date', since).lte('date', today),
    getRowsCompatHCA(parametre_id, since, today)
  ])

  // CA Popina
  const caBrutPopina = reports.reduce((s, r) => s + toEuros(r.totalSales), 0)
  const tvaCollectee = reports.reduce((s, r) => s + (r.reportTaxes || []).reduce((t, x) => t + toEuros(x.taxAmount), 0), 0)
  const caHTPopina = caBrutPopina - tvaCollectee

  // CA Uber (depuis VPS uber_eats via adaptateur)
  const caUberTotal = (historique || []).reduce((s, r) => s + (r.uber || 0), 0)

  // CA Total
  const caBrut = caBrutPopina + caUberTotal
  const caHT = caHTPopina + (caUberTotal / 1.1)
  const tvaTotale = caBrut - caHT

  // Taux commissions depuis paramètres
  const tauxCB = (parametres?.taux_commission_cb ?? 1.5) / 100
  const tauxTR = (parametres?.taux_commission_tr ?? 4.0) / 100
  const tauxUber = (parametres?.taux_commission_uber ?? 15.0) / 100
  const tauxFoxorder = (parametres?.taux_commission_foxorder ?? 0) / 100

  // Calcul commissions
  const allPayments = reports.flatMap(r => r.reportPayments || [])
  const allProducts = reports.flatMap(r => r.reportProducts || [])

  let borne = 0, cb = 0, tr = 0
  for (const p of allPayments) {
    const nom = (p.paymentName || '').toLowerCase()
    const m = toEuros(p.paymentAmount)
    if (nom.includes('borne')) borne += m
    else if (nom.includes('carte') || nom.includes('credit')) cb += m
    else if (nom.includes('titre') || nom.includes('restaurant')) tr += m
  }
  const foxorderCA = allProducts.filter(p => p.category === 'FOXORDERS').reduce((s, p) => s + toEuros(p.productSales), 0)

  const commissionCB = (borne + cb) * tauxCB
  const commissionTR = tr * tauxTR
  const commissionUber = caUberTotal * tauxUber
  const commissionFoxorder = foxorderCA * tauxFoxorder
  const totalCommissions = commissionCB + commissionTR + commissionUber + commissionFoxorder

  const getD = (cats) => (transactions || []).filter(t => cats.includes(t.categorie_pl)).reduce((s, t) => s + t.montant_ht, 0)

  const consommations = getD(['consommations'])
  const fraisPersonnel = getD(['frais_personnel'])
  const autresChargesPersonnel = getD(['autres_charges_personnel'])
  const fraisDeplacement = getD(['frais_deplacement'])
  const entretiensReparations = getD(['entretiens_reparations'])
  const energie = getD(['energie'])
  const autresFraisInfluencables = getD(['autres_frais_influencables'])
  const loyersCharges = getD(['loyers_charges'])
  const honoraires = getD(['honoraires'])
  const redevanceMarque = getD(['redevance_marque'])
  const prestationsOp = getD(['prestations_operationnelles'])
  const fraisDivers = getD(['frais_divers'])
  const autresCharges = getD(['autres_charges'])

  const margebrute = caHT - consommations
  const totalPersonnel = fraisPersonnel + autresChargesPersonnel + fraisDeplacement
  const totalInfluencables = entretiensReparations + energie + autresFraisInfluencables
  const totalFixe = loyersCharges + honoraires + redevanceMarque + prestationsOp + fraisDivers + autresCharges
  const ebe = margebrute - totalPersonnel - totalInfluencables - totalFixe - totalCommissions

  const impots = ebe <= 0 ? 0 : ebe <= 42500 ? Math.round(ebe * 0.15) : Math.round(ebe * 0.25)
  const resultatNet = ebe - impots

  // Hiérarchie 4 niveaux (macro → cat → sous-cat → fournisseur) pour PRow expandables.
  // Réutilise agregerHierarchie de /analyses pour cohérence et éviter duplication logique.
  // total_ht ajouté à chaque niveau (Lot post-V1.1) pour affichage HT cohérent /pl.
  const hierarchie = agregerHierarchie(transactions || [])

  // ─────────────────────────────────────────────────────────────────
  // ÉVOLUTION : calcul P&L mensuel sur 12 mois calendaires glissants
  // (terminant au dernier mois clos, mois courant exclu).
  //
  // Fix bornes mois : on construit les strings ISO directement à partir des
  // composants Y/M/D (jamais via toISOString() qui shift en UTC et casse les
  // bornes mois dans les fuseaux non-UTC).
  //
  // Source des chiffres : on lit la BDD pré-agrégée par cron, PAS Popina API
  // live. ventes_par_source via getRowsCompatHCA (popina + uber TTC/HT par
  // jour) + paiements_caisse (cb/tpa/tr par jour) + transactions (charges).
  // Beaucoup plus fiable que de re-fetcher Popina + filtrer (timezone, doublons
  // de sessions caisse, etc.).
  // ─────────────────────────────────────────────────────────────────
  const now = new Date()
  // Dernier mois clos = mois précédent. Si on est le 6 mai 2026, dernier mois clos = avril 2026.
  const dernierMoisClos = new Date(now.getFullYear(), now.getMonth(), 0)  // dernier jour du mois précédent

  // Helper : construit 'YYYY-MM-DD' directement depuis y/m/d (évite tout problème timezone).
  const fmtISO = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const fmtMois = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`

  const debutEvolutionY = dernierMoisClos.getFullYear()
  const debutEvolutionM = dernierMoisClos.getMonth() - 11
  const debutEvolutionDate = new Date(debutEvolutionY, debutEvolutionM, 1)
  const debutEvolution = fmtISO(debutEvolutionDate.getFullYear(), debutEvolutionDate.getMonth(), 1)
  const finEvolution = fmtISO(dernierMoisClos.getFullYear(), dernierMoisClos.getMonth(), dernierMoisClos.getDate())

  // Fetch BDD : pas de Popina API live pour Évolution (cron déjà-agrégé est fiable + dédupliqué).
  const [{ data: transactionsEvol }, historiqueEvol, { data: paiementsEvol }] = await Promise.all([
    supabase.from('transactions').select('*').eq('parametre_id', parametre_id).gte('date', debutEvolution).lte('date', finEvolution),
    getRowsCompatHCA(parametre_id, debutEvolution, finEvolution),
    supabase.from('paiements_caisse').select('date, especes, cb, tr').eq('parametre_id', parametre_id).gte('date', debutEvolution).lte('date', finEvolution),
  ])

  // Construit la liste des 12 mois ISO (mai 2025 → avril 2026 par exemple)
  const moisList = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(dernierMoisClos.getFullYear(), dernierMoisClos.getMonth() - i, 1)
    const moisISO = fmtMois(d.getFullYear(), d.getMonth())
    const moisLabel = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }).replace('.', '')
    const debut = `${moisISO}-01`
    // Dernier jour du mois : new Date(y, m+1, 0).getDate() retourne 28/29/30/31 selon le mois
    const dernierJour = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    const fin = fmtISO(d.getFullYear(), d.getMonth(), dernierJour)
    moisList.push({ mois: moisISO, label: moisLabel, debut, fin })
  }

  // Pour chaque mois, calcule les agrégats P&L à partir de la BDD pré-agrégée
  const evolutionMois = moisList.map((m) => {
    const transM = (transactionsEvol || []).filter(t => t.date >= m.debut && t.date <= m.fin)
    const histM = (historiqueEvol || []).filter(h => h.date >= m.debut && h.date <= m.fin)
    const paieM = (paiementsEvol || []).filter(p => p.date >= m.debut && p.date <= m.fin)

    // CA depuis BDD agrégée (popina + uber TTC/HT par jour, déjà dédupliqué cron)
    const caBrutM = histM.reduce((s, r) => s + (r.ca_brut || 0), 0)
    const caHTM = histM.reduce((s, r) => s + (r.ca_ht || 0), 0)
    const caUberM = histM.reduce((s, r) => s + (r.uber || 0), 0)
    const tvaTotaleM = caBrutM - caHTM

    // Charges par macro (HT)
    const sumCat = (cats) => transM.filter(t => cats.includes(t.categorie_pl)).reduce((s, t) => s + (t.montant_ht || 0), 0)
    const consoM = sumCat(['consommations'])
    const personnelM = sumCat(['frais_personnel', 'autres_charges_personnel', 'frais_deplacement'])
    const influencablesM = sumCat(['entretiens_reparations', 'energie', 'autres_frais_influencables'])
    const fixesM = sumCat(['loyers_charges', 'honoraires', 'redevance_marque', 'prestations_operationnelles', 'frais_divers', 'autres_charges'])

    // Détail par categorie_pl (pour expand accordéon Q2=C)
    const detailCat = {}
    for (const cat of ['frais_personnel', 'autres_charges_personnel', 'frais_deplacement',
                       'entretiens_reparations', 'energie', 'autres_frais_influencables',
                       'loyers_charges', 'honoraires', 'redevance_marque', 'prestations_operationnelles',
                       'frais_divers', 'autres_charges']) {
      detailCat[cat] = sumCat([cat])
    }

    // Commissions depuis paiements_caisse (cb / tpa fusionné dans cb post-Lot 3-ter, tr) + uber
    // Note V1.1 : foxorder skip (tauxFoxorder=0 pour Krousty actuellement, négligeable).
    const cbM = paieM.reduce((s, p) => s + (Number(p.cb) || 0), 0)
    const trM = paieM.reduce((s, p) => s + (Number(p.tr) || 0), 0)
    const commissionsM = cbM * tauxCB + trM * tauxTR + caUberM * tauxUber

    // EBE / IS / Résultat
    const margeBruteM = caHTM - consoM
    const ebeM = margeBruteM - personnelM - influencablesM - fixesM - commissionsM
    const isM = ebeM <= 0 ? 0 : ebeM <= 42500 ? Math.round(ebeM * 0.15) : Math.round(ebeM * 0.25)
    const resultatNetM = ebeM - isM

    // Ratios
    const foodCostP = caHTM > 0 ? (consoM / caHTM * 100) : 0
    const staffCostP = caHTM > 0 ? (personnelM / caHTM * 100) : 0
    const ebeP = caHTM > 0 ? (ebeM / caHTM * 100) : 0

    return {
      mois: m.mois, label: m.label,
      caBrut: caBrutM, tvaCollectee: tvaTotaleM, caHT: caHTM,
      consommations: consoM, margeBrute: margeBruteM,
      personnel: personnelM, influencables: influencablesM, fixes: fixesM,
      commissions: commissionsM, ebe: ebeM, impots: isM, resultatNet: resultatNetM,
      detailCat,
      foodCostP, staffCostP, ebeP,
    }
  })

  const data = {
    caBrut, tvaCollectee: tvaTotale, caHT,
    consommations, fraisPersonnel,
    autresChargesPersonnel, fraisDeplacement, entretiensReparations,
    energie, autresFraisInfluencables, loyersCharges, honoraires,
    redevanceMarque, prestationsOp, fraisDivers, autresCharges,
    commissionCB, commissionTR, commissionUber, commissionFoxorder, totalCommissions,
    caUberTotal,
    margebrute, totalPersonnel, totalInfluencables, totalFixe,
    ebe, impots, resultatNet, transactions,
    since, today, periode,
    hierarchie,
    evolutionMois,
  }

  return <PLClient data={data} periode={periode} />
}