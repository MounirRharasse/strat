// POST /api/charges-recurrentes/scan
// Lot 5 Charges Récurrentes V1.1 — détection IA Layer 1 manuel trigger.
//
// Body optionnel : { fenetreJours?: number, dateMax?: 'YYYY-MM-DD' }
// Réponse : { nb_candidats, nb_inserts, nb_updates, candidats: [...] }
//
// L'algo est synchrone (Layer 1 = pure stat, pas d'API externe ni LLM).
// Lot 6 ajoutera un Layer 2 LLM Haiku enrichissement post-detection.

import { getParametreIdFromSession } from '@/lib/auth'
import { scannerEtUpserter } from '@/lib/ia/recurrence-detection'

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
    const result = await scannerEtUpserter(parametre_id, options)
    return Response.json(result)
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
