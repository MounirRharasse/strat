import { getAllOrders, getAllReports } from '@/lib/popina'
import { supabase } from '@/lib/supabase'
import { buildClassifier } from '@/lib/payments-classifier'

// TODO V1+ : boucler sur tous les parametres actifs au lieu de hardcoder Krousty
const PARAMETRE_ID_KROUSTY = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'

export async function GET(request) {
  // Sécurité — vérifier le token Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const date = yesterday.toISOString().split('T')[0]

  const results = { date, steps: [] }

  try {
    // ÉTAPE 1 — Récupérer les commandes Popina d'hier
    const [orders, reports] = await Promise.all([
      getAllOrders(date, date),
      getAllReports(date, date)
    ])

    const valides = orders.filter(o => !o.isCanceled && o.total > 0)
    results.steps.push({ step: 'orders', nb: valides.length })

    // ÉTAPE 2 — Amplitude horaire
    const parHeure = {}
    for (const order of valides) {
      const d = new Date(order.openedAt || order.createdAt)
      const hFrance = (d.getUTCHours() + 2) % 24
      if (!parHeure[hFrance]) parHeure[hFrance] = { nb: 0, ca: 0 }
      parHeure[hFrance].nb += 1
      parHeure[hFrance].ca += order.total / 100
    }

    // Stocker amplitude dans Supabase
    const amplitudeRecords = Object.entries(parHeure).map(([heure, data]) => ({
      parametre_id: PARAMETRE_ID_KROUSTY,
      date,
      heure: parseInt(heure),
      nb_commandes: data.nb,
      ca: Math.round(data.ca * 100) / 100,
      canal: 'popina',
    }))

    if (amplitudeRecords.length > 0) {
      const { error } = await supabase
        .from('amplitude_horaire')
        .upsert(amplitudeRecords, { onConflict: 'parametre_id,date,heure,canal' })
      if (error) results.steps.push({ step: 'amplitude', error: error.message })
      else results.steps.push({ step: 'amplitude', nb: amplitudeRecords.length })
    }

    // ÉTAPE 3 — Mettre à jour historique_ca
    if (reports.length > 0) {
      const toEuros = (c) => Math.round(c) / 100
      const caBrut = reports.reduce((s, r) => s + toEuros(r.totalSales), 0)
      const tva = reports.reduce((s, r) => s + (r.reportTaxes || []).reduce((t, x) => t + toEuros(x.taxAmount), 0), 0)
      const caHT = caBrut - tva

      const allPayments = reports.flatMap(r => r.reportPayments || [])
      const classifier = await buildClassifier(PARAMETRE_ID_KROUSTY)
      let especes = 0, cb = 0, tpa = 0, tr = 0
      for (const p of allPayments) {
        const m = toEuros(p.paymentAmount)
        const cat = classifier.classify(p.paymentName)
        if (cat === 'especes') especes += m
        else if (cat === 'cb') cb += m
        else if (cat === 'tpa') tpa += m
        else if (cat === 'tr') tr += m
        else if (cat === 'ignored') continue
        else console.warn(`[cron-nightly] paymentName non classifié : "${p.paymentName}" (${m.toFixed(2)} €)`)
      }

      const nbCommandes = valides.length

      const { error } = await supabase
        .from('historique_ca')
        .upsert({
          parametre_id: PARAMETRE_ID_KROUSTY,
          date,
          ca_brut: Math.round(caBrut * 100) / 100,
          ca_ht: Math.round(caHT * 100) / 100,
          especes: Math.round(especes * 100) / 100,
          cb: Math.round(cb * 100) / 100,
          tpa: Math.round(tpa * 100) / 100,
          tr: Math.round(tr * 100) / 100,
          nb_commandes: nbCommandes,
        }, { onConflict: 'parametre_id,date' })

      if (error) results.steps.push({ step: 'historique_ca', error: error.message })
      else results.steps.push({ step: 'historique_ca', date, caBrut })
    }

    results.success = true
    return Response.json(results)

  } catch (e) {
    return Response.json({ error: e.message, results }, { status: 500 })
  }
}