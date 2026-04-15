import { supabase } from '@/lib/supabase'

function normalise(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''

  if (q.length < 2) return Response.json([])

  const { data, error } = await supabase
    .from('fournisseurs')
    .select('*')
    .ilike('nom', `%${q}%`)
    .order('nb_transactions', { ascending: false })
    .limit(5)

  if (error) return Response.json([])
  return Response.json(data || [])
}

export async function POST(request) {
  const body = await request.json()
  const {
    date,
    montant_ttc,
    taux_tva,
    fournisseur_nom,
    sous_categorie,
    categorie_pl,
    note
  } = body

  const montant_ht = Math.round((montant_ttc / (1 + taux_tva / 100)) * 100) / 100
  const montant_tva = Math.round((montant_ttc - montant_ht) * 100) / 100
  const nom_normalise = normalise(fournisseur_nom)

  const { data: existing } = await supabase
    .from('fournisseurs')
    .select('*')
    .ilike('nom', `%${fournisseur_nom}%`)
    .single()

  let fournisseur_id

  if (existing) {
    await supabase
      .from('fournisseurs')
      .update({
        total_depense: existing.total_depense + montant_ttc,
        nb_transactions: existing.nb_transactions + 1,
        taux_tva_defaut: taux_tva,
        sous_categorie,
        categorie_pl
      })
      .eq('id', existing.id)
    fournisseur_id = existing.id
  } else {
    const { data: nouveau } = await supabase
      .from('fournisseurs')
      .insert({
        nom: fournisseur_nom,
        nom_normalise,
        taux_tva_defaut: taux_tva,
        sous_categorie,
        categorie_pl,
        total_depense: montant_ttc,
        nb_transactions: 1
      })
      .select()
      .single()
    fournisseur_id = nouveau?.id
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      date: date || new Date().toISOString().split('T')[0],
      montant_ttc,
      taux_tva,
      montant_ht,
      montant_tva,
      fournisseur_id,
      fournisseur_nom,
      sous_categorie,
      categorie_pl,
      note
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}