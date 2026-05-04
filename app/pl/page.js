import { getAllReports } from '@/lib/popina'
import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'
import { getRowsCompatHCA } from '@/lib/data/ventes'
import { getPeriodeFromFiltreId } from '@/lib/periods'
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
    since, today, periode
  }

  return <PLClient data={data} periode={periode} />
}