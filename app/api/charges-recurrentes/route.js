// REST endpoints CRUD charges_recurrentes — Lot 3 Charges Récurrentes V1.1.
// Cf. STRAT_CADRAGE.md §6.5, helper lecture lib/data/charges-recurrentes.js (Lot 2).

import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'
import { listChargesActives } from '@/lib/data/charges-recurrentes'

const PROFILS_VALIDES = ['fixe', 'variable_recurrente', 'one_shot']
const FREQUENCES_VALIDES = ['mensuel', 'trimestriel', 'semestriel', 'annuel']
const SOURCES_VALIDES = ['onboarding_catalogue', 'manuel_ui', 'chat_ia', 'detection_ia']

// ─── GET — liste des charges récurrentes actives du tenant ──────────
export async function GET() {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  try {
    const charges = await listChargesActives(parametre_id)
    return Response.json(charges)
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// ─── POST — créer une charge récurrente ─────────────────────────────
// Source possible : onboarding catalogue, saisie manuelle UI, accept candidate IA, chat.
// Si ?accept_candidate_id=<uuid> est passé en query, lie la candidate
// (UPDATE statut='accepted', charge_recurrente_id) après INSERT.
export async function POST(request) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const body = await request.json()
  const {
    charge_type_id,
    libelle_personnalise,
    categorie_pl,
    sous_categorie,
    fournisseur_nom_attendu,
    profil,
    frequence,
    jour_du_mois,
    montant_attendu,
    formule_calcul,
    taux_tva_defaut,
    source_creation,
  } = body

  // Validation manuelle (pas de Zod dans le projet)
  if (!libelle_personnalise || !categorie_pl || !profil || !frequence || jour_du_mois == null || !source_creation) {
    return Response.json({ error: 'Champs requis : libelle_personnalise, categorie_pl, profil, frequence, jour_du_mois, source_creation' }, { status: 400 })
  }
  if (!PROFILS_VALIDES.includes(profil)) {
    return Response.json({ error: `profil invalide (attendu ${PROFILS_VALIDES.join('|')})` }, { status: 400 })
  }
  if (!FREQUENCES_VALIDES.includes(frequence)) {
    return Response.json({ error: `frequence invalide (attendu ${FREQUENCES_VALIDES.join('|')})` }, { status: 400 })
  }
  if (!SOURCES_VALIDES.includes(source_creation)) {
    return Response.json({ error: `source_creation invalide (attendu ${SOURCES_VALIDES.join('|')})` }, { status: 400 })
  }
  if (jour_du_mois < 1 || jour_du_mois > 28) {
    return Response.json({ error: 'jour_du_mois doit être entre 1 et 28' }, { status: 400 })
  }
  // CHECK chk_montant_ou_formule équivalent côté API (DB rattrapera sinon)
  if (profil === 'fixe' && montant_attendu == null) {
    return Response.json({ error: 'profil=fixe requiert montant_attendu' }, { status: 400 })
  }
  if (profil === 'variable_recurrente' && montant_attendu == null && !formule_calcul) {
    return Response.json({ error: 'profil=variable_recurrente requiert montant_attendu OU formule_calcul' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('charges_recurrentes')
    .insert({
      parametre_id,
      charge_type_id: charge_type_id || null,
      libelle_personnalise,
      categorie_pl,
      sous_categorie: sous_categorie || null,
      fournisseur_nom_attendu: fournisseur_nom_attendu || null,
      profil,
      frequence,
      jour_du_mois,
      montant_attendu: montant_attendu ?? null,
      formule_calcul: formule_calcul || null,
      taux_tva_defaut: taux_tva_defaut ?? 20.0,
      source_creation,
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Lier candidate si query param fourni (path "accept candidate" via POST charges-recurrentes)
  const { searchParams } = new URL(request.url)
  const acceptCandidateId = searchParams.get('accept_candidate_id')
  if (acceptCandidateId) {
    await supabase
      .from('recurrence_candidates')
      .update({ statut: 'accepted', charge_recurrente_id: data.id })
      .eq('id', acceptCandidateId)
      .eq('parametre_id', parametre_id)
  }

  return Response.json(data, { status: 201 })
}
