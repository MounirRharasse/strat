import { supabase } from '@/lib/supabase'

export async function PATCH(request) {
  const { table, id, data } = await request.json()
  const { error } = await supabase.from(table).update(data).eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function DELETE(request) {
  const { table, id } = await request.json()
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}