// POST accepter un candidat IA → INSERT charges_recurrentes + UPDATE candidate.
// Lot 3 Charges Récurrentes V1.1.
//
// Le client peut éditer les valeurs proposées par l'IA via le body
// (override : libelle_personnalise, montant_attendu, jour_du_mois, etc.).
// Si non fournis, on prend les valeurs déduites du candidat (montant_median,
// hints_llm.libelle_propose, ...).

import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'

const PROFILS_VALIDES = ['fixe', 'variable_recurrente', 'one_shot']
const FREQUENCES_VALIDES = ['mensuel', 'trimestriel', 'semestriel', 'annuel']

export async function POST(request, { params }) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))

  // 1. Fetch candidate
  const { data: candidate, error: cErr } = await supabase
    .from('recurrence_candidates')
    .select('*')
    .eq('id', params.id)
    .eq('parametre_id', parametre_id)
    .maybeSingle()
  if (cErr) return Response.json({ error: cErr.message }, { status: 500 })
  if (!candidate) return Response.json({ error: 'Candidate introuvable ou hors tenant' }, { status: 404 })
  if (candidate.statut !== 'pending' && candidate.statut !== 'proposed') {
    return Response.json({ error: `Candidate en statut ${candidate.statut}, acceptation impossible` }, { status: 409 })
  }

  // 2. Construire payload INSERT charges_recurrentes
  const hints = candidate.hints_llm || {}
  const libelle_personnalise = body.libelle_personnalise || hints.libelle_propose || candidate.fournisseur_nom_brut
  const profil = body.profil || hints.profil || 'fixe'
  const frequence = body.frequence || hints.frequence || 'mensuel'
  const jour_du_mois = body.jour_du_mois ?? null
  const montant_attendu = body.montant_attendu ?? candidate.montant_median
  const charge_type_id = body.charge_type_id || hints.charge_type_id || null

  if (!PROFILS_VALIDES.includes(profil)) {
    return Response.json({ error: `profil invalide (attendu ${PROFILS_VALIDES.join('|')})` }, { status: 400 })
  }
  if (!FREQUENCES_VALIDES.includes(frequence)) {
    return Response.json({ error: `frequence invalide (attendu ${FREQUENCES_VALIDES.join('|')})` }, { status: 400 })
  }
  if (jour_du_mois == null || jour_du_mois < 1 || jour_du_mois > 28) {
    return Response.json({ error: 'jour_du_mois requis, entre 1 et 28' }, { status: 400 })
  }

  // 3. INSERT charges_recurrentes
  const { data: nouvelleCharge, error: iErr } = await supabase
    .from('charges_recurrentes')
    .insert({
      parametre_id,
      charge_type_id,
      libelle_personnalise,
      categorie_pl: candidate.categorie_pl,
      sous_categorie: body.sous_categorie || null,
      fournisseur_nom_attendu: candidate.fournisseur_nom_brut,
      profil,
      frequence,
      jour_du_mois,
      montant_attendu,
      formule_calcul: body.formule_calcul || null,
      taux_tva_defaut: body.taux_tva_defaut ?? 20.0,
      source_creation: 'detection_ia',
    })
    .select()
    .single()
  if (iErr) return Response.json({ error: iErr.message }, { status: 500 })

  // 4. UPDATE candidate → accepted, lié à la charge
  const { error: uErr } = await supabase
    .from('recurrence_candidates')
    .update({
      statut: 'accepted',
      charge_recurrente_id: nouvelleCharge.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidate.id)
    .eq('parametre_id', parametre_id)
  if (uErr) {
    return Response.json(
      { charge_recurrente_id: nouvelleCharge.id, candidate_id: candidate.id, warning: `UPDATE candidate: ${uErr.message}` },
      { status: 201 }
    )
  }

  return Response.json(
    { charge_recurrente_id: nouvelleCharge.id, candidate_id: candidate.id, charge: nouvelleCharge },
    { status: 201 }
  )
}
