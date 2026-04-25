import { supabase } from '@/lib/supabase'

// Allow-list — toute autre table refusée. parametres et admins exclues volontairement
// (passer par /api/admin/clients/* pour parametres, admins hors scope V1).
const TABLES_AUTORISEES = new Set([
  'transactions', 'historique_ca', 'uber_orders',
  'fournisseurs', 'entrees', 'amplitude_horaire',
  'import_mappings'
])

export async function PATCH(request) {
  const { table, id, data, parametre_id } = await request.json()

  if (!table || !id || !parametre_id) {
    return Response.json({ error: 'table, id et parametre_id requis' }, { status: 400 })
  }
  if (!TABLES_AUTORISEES.has(table)) {
    return Response.json({ error: `table non autorisée: ${table}` }, { status: 400 })
  }

  const { parametre_id: _ignore, ...safeData } = data ?? {}

  const { error } = await supabase
    .from(table)
    .update(safeData)
    .eq('id', id)
    .eq('parametre_id', parametre_id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function DELETE(request) {
  const { table, id, parametre_id } = await request.json()

  if (!table || !id || !parametre_id) {
    return Response.json({ error: 'table, id et parametre_id requis' }, { status: 400 })
  }
  if (!TABLES_AUTORISEES.has(table)) {
    return Response.json({ error: `table non autorisée: ${table}` }, { status: 400 })
  }

  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id)
    .eq('parametre_id', parametre_id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}