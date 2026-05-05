// POST validation suggestion → INSERT transaction + UPDATE suggestion.
// Lot 3 Charges Récurrentes V1.1.
//
// Flow :
//   1. Récupère suggestion + charge_recurrente liée (scope tenant)
//   2. Si suggestion déjà 'validated' → 409 + transaction_id existant (idempotence)
//   3. Anti-doublon : check transaction matchant date.YYYY-MM = suggestion.mois
//      AND categorie_pl = charge.categorie_pl
//      AND fournisseur_nom ILIKE %fournisseur_suggere% (si défini)
//      Si match → 409 + existing_transaction_id (l'utilisateur valide quand même via
//      query ?force=true pour bypasser, à implémenter si demandé).
//   4. INSERT transaction avec montant = body.montant_modifie || suggestion.montant_suggere
//   5. UPDATE suggestion : statut='validated', transaction_id, validated_at, montant_modifie

import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'

export async function POST(request, { params }) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { montant_modifie, date_modifiee, note } = body

  // 1. Fetch suggestion + charge liée
  const { data: suggestion, error: sErr } = await supabase
    .from('charges_suggestions')
    .select('*')
    .eq('id', params.id)
    .eq('parametre_id', parametre_id)
    .maybeSingle()
  if (sErr) return Response.json({ error: sErr.message }, { status: 500 })
  if (!suggestion) return Response.json({ error: 'Suggestion introuvable ou hors tenant' }, { status: 404 })

  // 2. Idempotence : déjà validée
  if (suggestion.statut === 'validated') {
    return Response.json(
      { error: 'Suggestion déjà validée', transaction_id: suggestion.transaction_id },
      { status: 409 }
    )
  }
  if (suggestion.statut !== 'pending' && suggestion.statut !== 'modified') {
    return Response.json({ error: `Suggestion en statut ${suggestion.statut}, validation impossible` }, { status: 409 })
  }

  const { data: charge, error: cErr } = await supabase
    .from('charges_recurrentes')
    .select('*')
    .eq('id', suggestion.charge_recurrente_id)
    .eq('parametre_id', parametre_id)
    .maybeSingle()
  if (cErr) return Response.json({ error: cErr.message }, { status: 500 })
  if (!charge) return Response.json({ error: 'Charge récurrente liée introuvable' }, { status: 404 })

  // 3. Anti-doublon : transaction même mois + même catégorie + fournisseur similaire
  const moisStart = suggestion.mois + '-01'
  // Calcul fin de mois (28 max → safe pour février)
  const [y, m] = suggestion.mois.split('-').map(Number)
  const moisEndDate = new Date(Date.UTC(y, m, 0))  // dernier jour du mois
  const moisEnd = moisEndDate.toISOString().slice(0, 10)

  let doublonQuery = supabase
    .from('transactions')
    .select('id, date, fournisseur_nom, montant_ttc')
    .eq('parametre_id', parametre_id)
    .eq('categorie_pl', charge.categorie_pl)
    .gte('date', moisStart)
    .lte('date', moisEnd)
  if (suggestion.fournisseur_suggere) {
    doublonQuery = doublonQuery.ilike('fournisseur_nom', `%${suggestion.fournisseur_suggere}%`)
  }
  const { data: doublons, error: dErr } = await doublonQuery
  if (dErr) return Response.json({ error: dErr.message }, { status: 500 })
  if (doublons && doublons.length > 0) {
    return Response.json(
      {
        error: 'Une transaction similaire existe déjà ce mois-ci',
        existing_transaction_id: doublons[0].id,
        existing_transaction: doublons[0],
      },
      { status: 409 }
    )
  }

  // 4. INSERT transaction
  const montantTtc = montant_modifie ?? suggestion.montant_suggere
  const tauxTva = Number(charge.taux_tva_defaut || 20.0)
  const montantHt = Math.round((montantTtc / (1 + tauxTva / 100)) * 100) / 100
  const montantTva = Math.round((montantTtc - montantHt) * 100) / 100
  const dateTransaction = date_modifiee || suggestion.date_attendue
  const fournisseurNom = suggestion.fournisseur_suggere || charge.fournisseur_nom_attendu || charge.libelle_personnalise

  const { data: transaction, error: tErr } = await supabase
    .from('transactions')
    .insert({
      parametre_id,
      date: dateTransaction,
      montant_ttc: montantTtc,
      taux_tva: tauxTva,
      montant_ht: montantHt,
      montant_tva: montantTva,
      fournisseur_nom: fournisseurNom,
      sous_categorie: charge.sous_categorie || null,
      categorie_pl: charge.categorie_pl,
      note: note || `Validé depuis suggestion #${suggestion.id}`,
    })
    .select()
    .single()
  if (tErr) return Response.json({ error: tErr.message }, { status: 500 })

  // 5. UPDATE suggestion
  const { error: uErr } = await supabase
    .from('charges_suggestions')
    .update({
      statut: 'validated',
      transaction_id: transaction.id,
      validated_at: new Date().toISOString(),
      montant_modifie: montant_modifie ?? null,
    })
    .eq('id', suggestion.id)
    .eq('parametre_id', parametre_id)
  if (uErr) {
    // Transaction déjà créée, mais update suggestion KO. On retourne quand même 201
    // avec un warning — manuel cleanup possible si besoin.
    return Response.json(
      { transaction_id: transaction.id, suggestion_id: suggestion.id, warning: `UPDATE suggestion: ${uErr.message}` },
      { status: 201 }
    )
  }

  return Response.json(
    { transaction_id: transaction.id, suggestion_id: suggestion.id, transaction },
    { status: 201 }
  )
}
