// POST /api/charges-recurrentes/scan
// Lot 5+6 Charges Récurrentes V1.1 — détection IA Layer 1 + enrichissement Layer 2.
//
// Body optionnel : { fenetreJours?: number, dateMax?: 'YYYY-MM-DD', enrich?: boolean, force_enrich?: boolean }
// Réponse Layer 1 only : { nb_candidats, nb_inserts, nb_updates, candidats }
// Réponse Layer 1+2     : { ...Layer1, enrichment: { nb_enriched, nb_failed, cout_eur, ... } }
//
// Layer 1 = synchrone, statistique pure, pas d'API externe.
// Layer 2 = batch Haiku 4.5, propose libellés humains + mapping charge_types catalogue.
// Validation déterministe stricte post-LLM (anti-hallucination).
// Tracking ia_usage avec feature='charges_detection'.

import { getParametreIdFromSession } from '@/lib/auth'
import { scannerEtUpserter } from '@/lib/ia/recurrence-detection'
import { enrichirEtUpserter } from '@/lib/ia/recurrence-enrichment'

export async function POST(request) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const options = {}
  if (body.fenetreJours && typeof body.fenetreJours === 'number') options.fenetreJours = body.fenetreJours
  if (body.dateMax && /^\d{4}-\d{2}-\d{2}$/.test(body.dateMax)) options.dateMax = body.dateMax

  try {
    // Layer 1 : détection déterministe
    const result = await scannerEtUpserter(parametre_id, options)

    // Layer 2 : enrichissement LLM si demandé (default false pour compat backward Lot 5)
    if (body.enrich === true) {
      const enrichResult = await enrichirEtUpserter(parametre_id, { force: body.force_enrich === true })
      return Response.json({ ...result, enrichment: enrichResult })
    }

    return Response.json(result)
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
