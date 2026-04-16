import { supabase } from '@/lib/supabase'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  const type = searchParams.get('type')
  const { data } = await supabase.from('import_mappings')
    .select('mapping').eq('client_id', clientId).eq('type', type).single()
  return Response.json(data || {})
}

export async function POST(request) {
  const { clientId, type, source, mapping } = await request.json()
  const { error } = await supabase.from('import_mappings')
    .upsert({ client_id: clientId, type, source, mapping, updated_at: new Date().toISOString() },
      { onConflict: 'client_id,type,source' })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}