import { getAllOrders, getAllReports } from '@/lib/popina'
import { supabase } from '@/lib/supabase'
import { buildClassifier } from '@/lib/payments-classifier'

// TODO V1+ : boucler sur tous les parametres actifs au lieu de hardcoder Krousty
const PARAMETRE_ID_KROUSTY = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'
// TODO V1+ : fetch dynamique via slug='popina' au lieu de hardcoder l'UUID
const SOURCE_POPINA_ID_KROUSTY = 'a4e92432-7d3c-4b3f-aafb-745d19e6b2f8'

// Note dual-write étape 4 : le cron écrit dans 3 tables en parallèle
// (historique_ca legacy + ventes_par_source.popina + paiements_caisse).
// uber_eats est hors scope — la migration FAB pour qu'il écrive directement
// dans ventes_par_source.uber_eats arrive en étape 7 (cf. PLANNING_V1.md).

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

      // ─── Push 1/3 : historique_ca (legacy, source de vérité actuelle) ───
      let hcaError = null
      {
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

        if (error) {
          hcaError = error.message
          results.steps.push({ step: 'historique_ca', error: error.message })
        } else {
          results.steps.push({ step: 'historique_ca', date, caBrut })
        }
      }

      // ─── Push 2/3 : ventes_par_source.popina (nouveau, dual-write étape 4) ───
      let vpsError = null
      {
        const { error } = await supabase
          .from('ventes_par_source')
          .upsert({
            parametre_id: PARAMETRE_ID_KROUSTY,
            date,
            source_id: SOURCE_POPINA_ID_KROUSTY,
            montant_ttc: Math.round(caBrut * 100) / 100,
            montant_ht: Math.round(caHT * 100) / 100,
            nb_commandes: nbCommandes,
            commission_ttc: null,
            commission_ht: null,
          }, { onConflict: 'parametre_id,date,source_id' })

        if (error) {
          vpsError = error.message
          results.steps.push({ step: 'ventes_par_source.popina', error: error.message })
        } else {
          results.steps.push({ step: 'ventes_par_source.popina', date })
        }
      }

      // ─── Push 3/3 : paiements_caisse (nouveau, dual-write étape 4) ───
      // Fusion D3 TPA→cb côté pousseur (cohérent étapes 2/3/3-ter) : le classifier
      // rend 'tpa' brut, on additionne tpa dans cb au moment du push.
      let pcError = null
      {
        const { error } = await supabase
          .from('paiements_caisse')
          .upsert({
            parametre_id: PARAMETRE_ID_KROUSTY,
            date,
            especes: Math.round(especes * 100) / 100,
            cb: Math.round((cb + tpa) * 100) / 100,  // fusion D3
            tr: Math.round(tr * 100) / 100,
          }, { onConflict: 'parametre_id,date' })

        if (error) {
          pcError = error.message
          results.steps.push({ step: 'paiements_caisse', error: error.message })
        } else {
          results.steps.push({ step: 'paiements_caisse', date })
        }
      }

      // ─── Stratégie d'erreur "legacy first" (cf. cadrage étape 4 Q2) ───
      // HCA reste source de vérité tant que l'étape 6 (cutover) n'est pas faite.
      // Échec HCA = vraie alerte Vercel (HTTP 500). Échec VPS ou PC = warning
      // dans body (best-effort, le re-run manuel idempotent ON CONFLICT répare).
      if (hcaError) {
        return Response.json(
          { ...results, success: false, error: 'historique_ca write failed', details: hcaError },
          { status: 500 }
        )
      }
      if (vpsError || pcError) {
        results.warnings = []
        if (vpsError) results.warnings.push({ table: 'ventes_par_source.popina', error: vpsError })
        if (pcError) results.warnings.push({ table: 'paiements_caisse', error: pcError })
      }
    }

    results.success = true
    return Response.json(results)

  } catch (e) {
    return Response.json({ error: e.message, results }, { status: 500 })
  }
}