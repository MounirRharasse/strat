// REST endpoints PATCH/DELETE single charge_recurrente — Lot 3.
// DELETE = soft-delete (UPDATE actif=false), pas de hard delete pour
// préserver l'historique des suggestions liées (ON DELETE CASCADE
// supprimerait toutes les charges_suggestions liées).

import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'

// Liste blanche des champs éditables via PATCH (anti pollution).
const CHAMPS_PATCHABLES = [
  'libelle_personnalise',
  'sous_categorie',
  'fournisseur_nom_attendu',
  'jour_du_mois',
  'montant_attendu',
  'formule_calcul',
  'taux_tva_defaut',
  'actif',
  'pause_jusqu_au',
]

export async function PATCH(request, { params }) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const body = await request.json()
  const updates = {}
  for (const champ of CHAMPS_PATCHABLES) {
    if (champ in body) updates[champ] = body[champ]
  }
  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'Aucun champ patchable fourni' }, { status: 400 })
  }
  if ('jour_du_mois' in updates) {
    const j = updates.jour_du_mois
    if (j < 1 || j > 28) return Response.json({ error: 'jour_du_mois doit être entre 1 et 28' }, { status: 400 })
  }
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('charges_recurrentes')
    .update(updates)
    .eq('id', params.id)
    .eq('parametre_id', parametre_id)
    .select()
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Charge introuvable ou hors tenant' }, { status: 404 })
  return Response.json(data)
}

// Soft-delete via actif=false. Le cron mensuel (Lot 8) skip WHERE actif=true.
// Suggestions futures déjà créées en 'pending' restent accessibles validate/ignore.
export async function DELETE(request, { params }) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('charges_recurrentes')
    .update({ actif: false, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('parametre_id', parametre_id)
    .select()
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Charge introuvable ou hors tenant' }, { status: 404 })
  return Response.json(data)
}
