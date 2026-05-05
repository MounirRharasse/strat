// POST ignorer une suggestion (skip ce mois ou définitivement).
// Lot 3 Charges Récurrentes V1.1.
//
// Si body.ne_plus_proposer=true → INSERT charges_ignores avec
//   cle='charge_type:<charge_recurrente_id>' (Lot 8 cron skip de cette charge)
// Le format charge_type:<id_charge_recurrente> est volontaire : on ignore
// la charge récurrente précise du tenant, pas le charge_type catalogue
// (qui pourrait correspondre à plusieurs charges chez le même tenant).

import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'

export async function POST(request, { params }) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { motif, ne_plus_proposer = false } = body

  // 1. Fetch suggestion (scope tenant)
  const { data: suggestion, error: sErr } = await supabase
    .from('charges_suggestions')
    .select('*')
    .eq('id', params.id)
    .eq('parametre_id', parametre_id)
    .maybeSingle()
  if (sErr) return Response.json({ error: sErr.message }, { status: 500 })
  if (!suggestion) return Response.json({ error: 'Suggestion introuvable ou hors tenant' }, { status: 404 })

  if (suggestion.statut !== 'pending') {
    return Response.json({ error: `Suggestion en statut ${suggestion.statut}, ignore impossible` }, { status: 409 })
  }

  // 2. UPDATE suggestion → ignored
  const { error: uErr } = await supabase
    .from('charges_suggestions')
    .update({
      statut: 'ignored',
      motif_ignore: motif || null,
    })
    .eq('id', suggestion.id)
    .eq('parametre_id', parametre_id)
  if (uErr) return Response.json({ error: uErr.message }, { status: 500 })

  // 3. INSERT charges_ignores si ne_plus_proposer
  let ignoreId = null
  if (ne_plus_proposer) {
    const cle = `charge_type:${suggestion.charge_recurrente_id}`
    const { data: ignoreRow, error: iErr } = await supabase
      .from('charges_ignores')
      .upsert(
        { parametre_id, cle, motif: motif || null, ne_plus_proposer: true },
        { onConflict: 'parametre_id,cle' }
      )
      .select()
      .single()
    if (iErr) return Response.json({ error: iErr.message, suggestion_ignored: true }, { status: 500 })
    ignoreId = ignoreRow.id
  }

  return Response.json({
    suggestion_id: suggestion.id,
    statut: 'ignored',
    ignore_id: ignoreId,
  })
}
