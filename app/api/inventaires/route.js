import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export async function GET() {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('inventaires')
    .select('*')
    .eq('parametre_id', parametre_id)
    .order('date', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data || [])
}

export async function POST(request) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const body = await request.json()
  const { date, valeur_totale, note } = body

  if (!date || typeof date !== 'string' || !DATE_REGEX.test(date)) {
    return Response.json({ error: 'date invalide (YYYY-MM-DD requis)' }, { status: 400 })
  }
  const valeur = Number(valeur_totale)
  if (!Number.isFinite(valeur) || valeur < 0) {
    return Response.json({ error: 'valeur_totale doit être un nombre positif ou zéro' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('inventaires')
    .upsert(
      { parametre_id, date, valeur_totale: valeur, note: note || null },
      { onConflict: 'parametre_id,date' }
    )
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'id requis' }, { status: 400 })

  const { error } = await supabase
    .from('inventaires')
    .delete()
    .eq('id', id)
    .eq('parametre_id', parametre_id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
