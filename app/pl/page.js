import { getAllReports } from '@/lib/popina'
import { supabase } from '@/lib/supabase'
import PLClient from './PLClient'

export default async function PL({ searchParams }) {
  const now = new Date()
  const periode = searchParams?.periode || 'mtd'
  const today = now.toISOString().split('T')[0]
  const firstDayMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]
  const firstDayYear = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  let since = firstDayMonth
  if (periode === '7j') since = weekAgo
  if (periode === 'ytd') since = firstDayYear

  const toEuros = (c) => Math.round(c) / 100

  const [reports, { data: transactions }] = await Promise.all([
    getAllReports(since, today),
    supabase.from('transactions').select('*').gte('date', since).lte('date', today)
  ])

  const caBrut = reports.reduce((s, r) => s + toEuros(r.totalSales), 0)
  const tvaCollectee = reports.reduce((s, r) => s + (r.reportTaxes || []).reduce((t, x) => t + toEuros(x.taxAmount), 0), 0)
  const caHT = caBrut - tvaCollectee

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
  const ebe = margebrute - totalPersonnel - totalInfluencables - totalFixe

  const impots = ebe <= 0 ? 0 : ebe <= 42500 ? Math.round(ebe * 0.15) : Math.round(ebe * 0.25)
  const resultatNet = ebe - impots

  const data = {
    caBrut, tvaCollectee, caHT, consommations, fraisPersonnel,
    autresChargesPersonnel, fraisDeplacement, entretiensReparations,
    energie, autresFraisInfluencables, loyersCharges, honoraires,
    redevanceMarque, prestationsOp, fraisDivers, autresCharges,
    margebrute, totalPersonnel, totalInfluencables, totalFixe,
    ebe, impots, resultatNet, transactions,
    since, today, periode
  }

  return <PLClient data={data} periode={periode} />
}