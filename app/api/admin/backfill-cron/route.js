import { getAllOrders, getAllReports } from '@/lib/popina'
import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const PLAGE_MAX_JOURS = 31

// Endpoint POST de backfill ciblé pour réparer des trous dans historique_ca / amplitude_horaire.
// Réutilise la logique du cron nocturne /api/cron/nightly mais en boucle sur une plage.
// Idempotent : utilise UPSERT, donc relancer écrase proprement.
//
// Bug latent connu (préservé pour cohérence stricte avec le cron) :
// le calcul d'amplitude utilise (getUTCHours() + 2) % 24 qui ignore le DST.
// À fixer dans le cron en même temps qu'ici, dans une passe dédiée.
export async function POST(request) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { from, to } = body

  if (typeof from !== 'string' || !DATE_REGEX.test(from)) {
    return Response.json({ error: 'from invalide (YYYY-MM-DD requis)' }, { status: 400 })
  }
  if (typeof to !== 'string' || !DATE_REGEX.test(to)) {
    return Response.json({ error: 'to invalide (YYYY-MM-DD requis)' }, { status: 400 })
  }
  if (from > to) {
    return Response.json({ error: 'from doit être <= to' }, { status: 400 })
  }

  const dureeJours = Math.round((new Date(to) - new Date(from)) / 86400000) + 1
  if (dureeJours > PLAGE_MAX_JOURS) {
    return Response.json({ error: `Plage trop large (${dureeJours} jours, max ${PLAGE_MAX_JOURS})` }, { status: 400 })
  }

  // Construire la liste des jours à traiter (inclusif)
  const jours = []
  const dateDebut = new Date(from + 'T12:00:00Z')
  const dateFin = new Date(to + 'T12:00:00Z')
  for (let d = new Date(dateDebut); d <= dateFin; d.setUTCDate(d.getUTCDate() + 1)) {
    jours.push(d.toISOString().split('T')[0])
  }

  let jours_traites = 0
  let jours_avec_donnees = 0
  let jours_vides = 0
  const errors = []

  for (const date of jours) {
    try {
      const [orders, reports] = await Promise.all([
        getAllOrders(date, date),
        getAllReports(date, date)
      ])

      const valides = orders.filter(o => !o.isCanceled && o.total > 0)

      // Amplitude horaire (regroupement par heure)
      const parHeure = {}
      for (const order of valides) {
        const dt = new Date(order.openedAt || order.createdAt)
        const hFrance = (dt.getUTCHours() + 2) % 24
        if (!parHeure[hFrance]) parHeure[hFrance] = { nb: 0, ca: 0 }
        parHeure[hFrance].nb += 1
        parHeure[hFrance].ca += order.total / 100
      }

      const amplitudeRecords = Object.entries(parHeure).map(([heure, data]) => ({
        parametre_id,
        date,
        heure: parseInt(heure),
        nb_commandes: data.nb,
        ca: Math.round(data.ca * 100) / 100,
        canal: 'popina',
      }))

      if (amplitudeRecords.length > 0) {
        const { error: errAmp } = await supabase
          .from('amplitude_horaire')
          .upsert(amplitudeRecords, { onConflict: 'parametre_id,date,heure,canal' })
        if (errAmp) errors.push({ date, step: 'amplitude', error: errAmp.message })
      }

      // historique_ca
      if (reports.length > 0) {
        const toEuros = (c) => Math.round(c) / 100
        const caBrut = reports.reduce((s, r) => s + toEuros(r.totalSales), 0)
        const tva = reports.reduce((s, r) => s + (r.reportTaxes || []).reduce((t, x) => t + toEuros(x.taxAmount), 0), 0)
        const caHT = caBrut - tva

        const allPayments = reports.flatMap(r => r.reportPayments || [])
        let especes = 0, cb = 0, tpa = 0, tr = 0
        for (const p of allPayments) {
          const nom = (p.paymentName || '').toLowerCase()
          const m = toEuros(p.paymentAmount)
          if (nom.includes('esp')) especes += m
          else if (nom.includes('carte') || nom.includes('credit')) cb += m
          else if (nom.includes('borne')) tpa += m
          else if (nom.includes('titre') || nom.includes('restaurant')) tr += m
        }

        const { error: errHist } = await supabase
          .from('historique_ca')
          .upsert({
            parametre_id,
            date,
            ca_brut: Math.round(caBrut * 100) / 100,
            ca_ht: Math.round(caHT * 100) / 100,
            especes: Math.round(especes * 100) / 100,
            cb: Math.round(cb * 100) / 100,
            tpa: Math.round(tpa * 100) / 100,
            tr: Math.round(tr * 100) / 100,
            nb_commandes: valides.length,
          }, { onConflict: 'parametre_id,date' })

        if (errHist) errors.push({ date, step: 'historique_ca', error: errHist.message })
        else jours_avec_donnees++
      } else {
        jours_vides++
      }

      jours_traites++
    } catch (e) {
      errors.push({ date, step: 'fetch', error: e.message })
      jours_traites++
    }
  }

  return Response.json({
    success: true,
    from,
    to,
    jours_traites,
    jours_avec_donnees,
    jours_vides,
    errors: errors.slice(0, 20)
  })
}
