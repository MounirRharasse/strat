import { supabase } from '@/lib/supabase'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const parametre_id = searchParams.get('parametre_id')
  const type = searchParams.get('type')
  const { data } = await supabase.from('import_mappings')
    .select('mapping').eq('parametre_id', parametre_id).eq('type', type).single()
  return Response.json(data || {})
}

export async function POST(request) {
  const { parametre_id, type, source, mapping } = await request.json()

  if (!parametre_id || !type || !source) {
    return Response.json({ error: 'parametre_id, type et source requis' }, { status: 400 })
  }

  const { error } = await supabase.from('import_mappings')
    .upsert({ parametre_id, type, source, mapping, updated_at: new Date().toISOString() },
      { onConflict: 'parametre_id,type,source' })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}