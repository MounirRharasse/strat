// POST refuser un candidat IA + apprentissage refus.
// Lot 3 Charges Récurrentes V1.1.
//
// UPDATE candidate.statut='dismissed' + INSERT charges_ignores avec
// cle='fournisseur:<fournisseur_nom_norm>'. Le scan IA Layer 1 (Lot 5)
// exclura ce fournisseur des futurs candidats.

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
  const { motif } = body

  // 1. Fetch candidate
  const { data: candidate, error: cErr } = await supabase
    .from('recurrence_candidates')
    .select('*')
    .eq('id', params.id)
    .eq('parametre_id', parametre_id)
    .maybeSingle()
  if (cErr) return Response.json({ error: cErr.message }, { status: 500 })
  if (!candidate) return Response.json({ error: 'Candidate introuvable ou hors tenant' }, { status: 404 })
  if (candidate.statut !== 'pending' && candidate.statut !== 'proposed') {
    return Response.json({ error: `Candidate en statut ${candidate.statut}, dismiss impossible` }, { status: 409 })
  }

  // 2. UPDATE candidate → dismissed
  const { error: uErr } = await supabase
    .from('recurrence_candidates')
    .update({ statut: 'dismissed', updated_at: new Date().toISOString() })
    .eq('id', candidate.id)
    .eq('parametre_id', parametre_id)
  if (uErr) return Response.json({ error: uErr.message }, { status: 500 })

  // 3. INSERT charges_ignores (apprentissage)
  const cle = `fournisseur:${candidate.fournisseur_nom_norm}`
  const { data: ignoreRow, error: iErr } = await supabase
    .from('charges_ignores')
    .upsert(
      { parametre_id, cle, motif: motif || null, ne_plus_proposer: true },
      { onConflict: 'parametre_id,cle' }
    )
    .select()
    .single()
  if (iErr) {
    return Response.json(
      { candidate_id: candidate.id, statut: 'dismissed', warning: `INSERT charges_ignores: ${iErr.message}` },
      { status: 200 }
    )
  }

  return Response.json({
    candidate_id: candidate.id,
    statut: 'dismissed',
    ignore_id: ignoreRow.id,
    cle,
  })
}
