import { supabase } from '@/lib/supabase'

// TODO V1+ : déduire parametre_id depuis la session auth au lieu de hardcoder Krousty
const PARAMETRE_ID_KROUSTY = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const since = searchParams.get('since')
  const until = searchParams.get('until')

  let query = supabase.from('entrees').select('*').order('date', { ascending: false })
  if (since) query = query.gte('date', since)
  if (until) query = query.lte('date', until)

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data || [])
}

export async function POST(request) {
  const body = await request.json()
  const { data, error } = await supabase
    .from('entrees')
    .insert({ ...body, parametre_id: PARAMETRE_ID_KROUSTY })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return Response.json({ error: 'id requis' }, { status: 400 })

  const { error } = await supabase
    .from('entrees')
    .delete()
    .eq('id', id)
    .eq('parametre_id', PARAMETRE_ID_KROUSTY)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}

export async function PATCH(request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const body = await request.json()

  if (!id) return Response.json({ error: 'id requis' }, { status: 400 })

  const montant_ttc = parseFloat(body.montant_ttc)
  const taux_tva = parseFloat(body.taux_tva) || 10
  const montant_ht = Math.round((montant_ttc / (1 + taux_tva / 100)) * 100) / 100
  const montant_tva = Math.round((montant_ttc - montant_ht) * 100) / 100

  const { data, error } = await supabase
    .from('entrees')
    .update({
      montant_ttc,
      montant_ht,
      montant_tva,
      taux_tva,
      note: body.note,
      nb_commandes: parseInt(body.nb_commandes) || 0
    })
    .eq('id', id)
    .eq('parametre_id', PARAMETRE_ID_KROUSTY)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}