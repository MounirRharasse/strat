import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'

export async function GET() {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('parametres')
    .select('*')
    .eq('id', parametre_id)
    .single()

  if (error || !data) {
    return Response.json({
      nom_restaurant: 'Mon restaurant',
      type_restaurant: 'franchise',
      objectif_ca: 45000,
      objectif_food_cost: 30,
      objectif_staff_cost: 32,
      objectif_marge: 20,
      alerte_food_cost_max: 32,
      alerte_ticket_min: 14.5,
      frequence_inventaire: 'mensuel'
    })
  }

  return Response.json(data)
}

export async function POST(request) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const body = await request.json()

  const { data: existing } = await supabase
    .from('parametres')
    .select('id')
    .eq('id', parametre_id)
    .single()

  if (existing) {
    const { data, error } = await supabase
      .from('parametres')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json(data)
  } else {
    const { data, error } = await supabase
      .from('parametres')
      .insert(body)
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json(data)
  }
}