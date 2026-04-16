import { supabase } from '@/lib/supabase'

export async function PATCH(request, { params }) {
  const body = await request.json()
  const { data, error } = await supabase.from('parametres').update(body).eq('id', params.id).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}