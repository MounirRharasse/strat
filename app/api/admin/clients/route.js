import { supabase } from '@/lib/supabase'

export async function POST(request) {
  const body = await request.json()
  const { data, error } = await supabase.from('parametres').insert([body]).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function GET() {
  const { data, error } = await supabase.from('parametres').select('*')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}