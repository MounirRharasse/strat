import { getAllReports } from '@/lib/popina'
import { supabase } from '@/lib/supabase'

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
  const { searchParams } = new URL(request.url)
  const since = searchParams.get('since')
  const until = searchParams.get('until')

  if (!since || !until) return Response.json({ error: 'since et until requis' }, { status: 400 })

  const toEuros = (c) => Math.round(c) / 100

  try {
    const [reports, { data: transactions }] = await Promise.all([
      getAllReports(since, until),
      supabase.from('transactions').select('*').gte('date', since).lte('date', until)
    ])

    const caBrut = reports.reduce((s, r) => s + toEuros(r.totalSales), 0)
    const tva = reports.reduce((s, r) => s + (r.reportTaxes || []).reduce((t, x) => t + toEuros(x.taxAmount), 0), 0)
    const caHT = caBrut - tva

    const allProducts = reports.flatMap(r => r.reportProducts || [])
    const allPayments = reports.flatMap(r => r.reportPayments || [])

    const caisseCA = allProducts.filter(p => p.category !== 'FOXORDERS').reduce((s, p) => s + toEuros(p.productSales), 0)
    const onlineCA = allProducts.filter(p => p.category === 'FOXORDERS').reduce((s, p) => s + toEuros(p.productSales), 0)

    const nbCommandes = reports.reduce((s, r) => s + (r.orders?.length || 0), 0)
    const panierMoyen = nbCommandes > 0 ? caBrut / nbCommandes : 0

    const paiements = repartitionPaiements(allPayments)
    const cashADeposer = paiements.especes
    const commissions = {
      cb: (paiements.borne + paiements.cb) * 0.015,
      tr: paiements.tr * 0.04
    }

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

    const nbJours = Math.round((new Date(until) - new Date(since)) / 86400000) + 1
    const caMoyen = nbJours > 0 ? caBrut / nbJours : 0

    return Response.json({
      since, until, nbJours,
      ca: {
        brut: caBrut,
        ht: caHT,
        tva,
        caisse: caisseCA,
        online: onlineCA,
        moyenParJour: caMoyen
      },
      frequentation: {
        nbCommandes,
        moyenParJour: nbJours > 0 ? nbCommandes / nbJours : 0
      },
      panierMoyen,
      paiements,
      cashADeposer,
      commissions,
      foodCostP,
      staffCostP,
      margeBruteP,
      ebeP,
      ebe,
      consommations,
      personnel,
      nbReports: reports.length
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}