import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'

const TYPES_VALIDES = ['trou_jour', 'trou_canal', 'trou_categorie', 'anomalie_montant']

// POST { type, cle } → INSERT (ignore conflit unique : déjà ignoré = no-op).
// Utilisé quand l'utilisateur tape "Marquer comme OK" sur une alerte du journal.
export async function POST(request) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const { type, cle } = body || {}
  if (!type || !TYPES_VALIDES.includes(type)) {
    return Response.json({ error: 'type invalide' }, { status: 400 })
  }
  if (!cle || typeof cle !== 'string') {
    return Response.json({ error: 'cle requise' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('audits_ignores')
    .upsert(
      { parametre_id, type, cle },
      { onConflict: 'parametre_id,type,cle', ignoreDuplicates: true }
    )
    .select()
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data || { success: true })
}

// DELETE ?type=...&cle=... → suppression d'un ignore (= ré-activation de l'alerte).
export async function DELETE(request) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const cle = searchParams.get('cle')

  if (!type || !TYPES_VALIDES.includes(type)) {
    return Response.json({ error: 'type invalide' }, { status: 400 })
  }
  if (!cle) {
    return Response.json({ error: 'cle requise' }, { status: 400 })
  }

  const { error } = await supabase
    .from('audits_ignores')
    .delete()
    .eq('parametre_id', parametre_id)
    .eq('type', type)
    .eq('cle', cle)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
