// Lot 9 Charges Récurrentes V1.1 — chat-functions domaine charges récurrentes.
// Cf. STRAT_CADRAGE.md §6.5, cadrage Lot 9 du 5/05/2026.
//
// 10 fonctions exposées au chat conversationnel (Sonnet 4.6 + tool_use) :
//   Lecture (sans confirmation utilisateur requise) :
//     - listChargesActivesChat
//     - rechercherCharge
//     - getChargeByIdChat
//     - listSuggestionsPendingChat
//     - listCandidatesChat
//   Écriture (system prompt impose pattern "brouillon → confirmation") :
//     - creerChargeRecurrente
//     - editerChargeRecurrente
//     - validerSuggestion
//     - accepterCandidat
//   Action :
//     - lancerScanDetection
//
// Garde-fous (cf. STRAT_IA.md §4) :
// - Aucun chiffre inventé : toutes les valeurs viennent du body utilisateur ou
//   de la BDD (ex. médiane candidate). Jamais déduit par le LLM.
// - Pré-check rechercherCharge avant creer (anti-doublon) imposé par system prompt.
// - Validation déterministe stricte des inputs (énums, ranges).

import { supabase } from '@/lib/supabase'
import {
  listChargesActives as helperListChargesActives,
  getChargeById as helperGetChargeById,
  listSuggestionsPending as helperListSuggestionsPending,
  listCandidatesPending as helperListCandidatesPending,
} from '@/lib/data/charges-recurrentes'
import { scannerEtUpserter } from '@/lib/ia/recurrence-detection'
import { enrichirEtUpserter } from '@/lib/ia/recurrence-enrichment'

const PROFILS_VALIDES = ['fixe', 'variable_recurrente', 'one_shot']
const FREQUENCES_VALIDES = ['mensuel', 'trimestriel', 'semestriel', 'annuel']
const TAUX_TVA_VALIDES = [0, 5.5, 10, 20]

function arrondi2(n) {
  if (n == null) return null
  return Math.round(Number(n) * 100) / 100
}

// ─── 1. listChargesActivesChat ────────────────────────────────────────
export async function listChargesActivesChat({ parametre_id }) {
  const charges = await helperListChargesActives(parametre_id)
  return {
    nb: charges.length,
    charges: charges.map(c => ({
      id: c.id,
      libelle: c.libelle_personnalise,
      categorie_pl: c.categorie_pl,
      profil: c.profil,
      frequence: c.frequence,
      jour_du_mois: c.jour_du_mois,
      montant_attendu_ttc: arrondi2(c.montant_attendu),
      taux_tva: c.taux_tva_defaut,
      formule_calcul: c.formule_calcul,
      fournisseur_nom_attendu: c.fournisseur_nom_attendu,
    })),
  }
}

// ─── 2. rechercherCharge ──────────────────────────────────────────────
export async function rechercherCharge({ parametre_id, query }) {
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return { error: 'query doit faire au moins 2 caractères' }
  }
  const q = `%${query.trim()}%`
  const { data, error } = await supabase
    .from('charges_recurrentes')
    .select('id, libelle_personnalise, categorie_pl, profil, frequence, jour_du_mois, montant_attendu, taux_tva_defaut, fournisseur_nom_attendu, actif')
    .eq('parametre_id', parametre_id)
    .or(`libelle_personnalise.ilike.${q},fournisseur_nom_attendu.ilike.${q}`)
    .limit(5)
  if (error) return { error: error.message }
  return {
    query: query.trim(),
    nb: (data || []).length,
    charges: (data || []).map(c => ({
      id: c.id,
      libelle: c.libelle_personnalise,
      categorie_pl: c.categorie_pl,
      profil: c.profil,
      frequence: c.frequence,
      jour_du_mois: c.jour_du_mois,
      montant_attendu_ttc: arrondi2(c.montant_attendu),
      taux_tva: c.taux_tva_defaut,
      fournisseur_nom_attendu: c.fournisseur_nom_attendu,
      actif: c.actif,
    })),
  }
}

// ─── 3. getChargeByIdChat ─────────────────────────────────────────────
export async function getChargeByIdChat({ parametre_id, id }) {
  const c = await helperGetChargeById(parametre_id, id)
  if (!c) return { found: false }
  return {
    found: true,
    id: c.id,
    libelle: c.libelle_personnalise,
    categorie_pl: c.categorie_pl,
    sous_categorie: c.sous_categorie,
    profil: c.profil,
    frequence: c.frequence,
    jour_du_mois: c.jour_du_mois,
    montant_attendu_ttc: arrondi2(c.montant_attendu),
    formule_calcul: c.formule_calcul,
    taux_tva: c.taux_tva_defaut,
    fournisseur_nom_attendu: c.fournisseur_nom_attendu,
    actif: c.actif,
    pause_jusqu_au: c.pause_jusqu_au,
  }
}

// ─── 4. listSuggestionsPendingChat ────────────────────────────────────
export async function listSuggestionsPendingChat({ parametre_id, mois }) {
  const sugs = await helperListSuggestionsPending(parametre_id, mois)
  // Récupère les libellés des charges liées
  const chargeIds = [...new Set(sugs.map(s => s.charge_recurrente_id))]
  const { data: charges } = chargeIds.length === 0 ? { data: [] } : await supabase
    .from('charges_recurrentes')
    .select('id, libelle_personnalise')
    .in('id', chargeIds)
    .eq('parametre_id', parametre_id)
  const chargeMap = Object.fromEntries((charges || []).map(c => [c.id, c.libelle_personnalise]))
  return {
    nb: sugs.length,
    mois_filtre: mois || null,
    suggestions: sugs.map(s => ({
      id: s.id,
      charge_recurrente_id: s.charge_recurrente_id,
      charge_libelle: chargeMap[s.charge_recurrente_id] || '?',
      mois: s.mois,
      date_attendue: s.date_attendue,
      montant_suggere_ttc: arrondi2(s.montant_suggere),
      fournisseur_suggere: s.fournisseur_suggere,
    })),
  }
}

// ─── 5. listCandidatesChat ────────────────────────────────────────────
export async function listCandidatesChat({ parametre_id }) {
  const cands = await helperListCandidatesPending(parametre_id)
  return {
    nb: cands.length,
    candidates: cands.map(c => ({
      id: c.id,
      fournisseur_nom: c.fournisseur_nom_brut,
      libelle_propose: c.hints_llm?.libelle_propose || null,
      categorie_pl: c.categorie_pl,
      montant_median_ttc: arrondi2(c.montant_median),
      nb_observations: c.nb_observations,
      derniere_date: c.derniere_date,
      confiance_pct: c.confiance_pct,
      charge_type_code: c.hints_llm?.charge_type_code || null,
    })),
  }
}

// ─── 6. creerChargeRecurrente ─────────────────────────────────────────
// ÉCRITURE — system prompt impose confirmation explicite avant appel.
export async function creerChargeRecurrente({
  parametre_id,
  libelle, categorie_pl, profil = 'fixe', frequence = 'mensuel',
  jour_du_mois, montant_attendu_ttc = null, formule_calcul = null,
  taux_tva = 20, fournisseur_nom_attendu = null, sous_categorie = null,
  charge_type_code = null,
}) {
  // Validation déterministe stricte
  if (!libelle || typeof libelle !== 'string' || libelle.trim().length < 2) {
    return { error: 'libelle requis (min 2 caractères)' }
  }
  if (!categorie_pl) return { error: 'categorie_pl requise' }
  if (!PROFILS_VALIDES.includes(profil)) {
    return { error: `profil invalide (attendu ${PROFILS_VALIDES.join('|')})` }
  }
  if (!FREQUENCES_VALIDES.includes(frequence)) {
    return { error: `frequence invalide (attendu ${FREQUENCES_VALIDES.join('|')})` }
  }
  if (!jour_du_mois || jour_du_mois < 1 || jour_du_mois > 28) {
    return { error: 'jour_du_mois requis entre 1 et 28' }
  }
  if (taux_tva != null && !TAUX_TVA_VALIDES.includes(Number(taux_tva))) {
    return { error: `taux_tva invalide (attendu ${TAUX_TVA_VALIDES.join('|')})` }
  }
  if (profil === 'fixe' && (montant_attendu_ttc == null || montant_attendu_ttc <= 0)) {
    return { error: 'profil=fixe requiert montant_attendu_ttc > 0' }
  }
  if (profil === 'variable_recurrente' && montant_attendu_ttc == null && !formule_calcul) {
    return { error: 'profil=variable_recurrente requiert montant_attendu_ttc OU formule_calcul' }
  }

  // Lookup charge_type_id si charge_type_code fourni
  let charge_type_id = null
  if (charge_type_code) {
    const { data: ct } = await supabase
      .from('charges_types')
      .select('id')
      .eq('code', charge_type_code)
      .maybeSingle()
    charge_type_id = ct?.id || null
  }

  const { data, error } = await supabase
    .from('charges_recurrentes')
    .insert({
      parametre_id,
      charge_type_id,
      libelle_personnalise: libelle.trim(),
      categorie_pl,
      sous_categorie,
      fournisseur_nom_attendu,
      profil,
      frequence,
      jour_du_mois,
      montant_attendu: montant_attendu_ttc,
      formule_calcul,
      taux_tva_defaut: taux_tva,
      source_creation: 'chat_ia',
    })
    .select()
    .single()
  if (error) return { error: error.message }
  return {
    success: true,
    id: data.id,
    libelle: data.libelle_personnalise,
    montant_attendu_ttc: arrondi2(data.montant_attendu),
    jour_du_mois: data.jour_du_mois,
    frequence: data.frequence,
  }
}

// ─── 7. editerChargeRecurrente ────────────────────────────────────────
const CHAMPS_PATCHABLES_CHAT = [
  'libelle', 'sous_categorie', 'fournisseur_nom_attendu',
  'jour_du_mois', 'montant_attendu_ttc', 'formule_calcul',
  'taux_tva', 'actif', 'pause_jusqu_au',
]

export async function editerChargeRecurrente({ parametre_id, id, ...updates }) {
  if (!id) return { error: 'id requis' }
  // Vérifier que la charge appartient au tenant
  const existing = await helperGetChargeById(parametre_id, id)
  if (!existing) return { error: 'Charge introuvable ou hors tenant' }

  const dbUpdates = {}
  if ('libelle' in updates) dbUpdates.libelle_personnalise = String(updates.libelle).trim()
  if ('sous_categorie' in updates) dbUpdates.sous_categorie = updates.sous_categorie || null
  if ('fournisseur_nom_attendu' in updates) dbUpdates.fournisseur_nom_attendu = updates.fournisseur_nom_attendu || null
  if ('jour_du_mois' in updates) {
    const j = parseInt(updates.jour_du_mois, 10)
    if (!j || j < 1 || j > 28) return { error: 'jour_du_mois invalide (1-28)' }
    dbUpdates.jour_du_mois = j
  }
  if ('montant_attendu_ttc' in updates) dbUpdates.montant_attendu = updates.montant_attendu_ttc
  if ('formule_calcul' in updates) dbUpdates.formule_calcul = updates.formule_calcul || null
  if ('taux_tva' in updates) {
    if (!TAUX_TVA_VALIDES.includes(Number(updates.taux_tva))) return { error: `taux_tva invalide (attendu ${TAUX_TVA_VALIDES.join('|')})` }
    dbUpdates.taux_tva_defaut = updates.taux_tva
  }
  if ('actif' in updates) dbUpdates.actif = !!updates.actif
  if ('pause_jusqu_au' in updates) dbUpdates.pause_jusqu_au = updates.pause_jusqu_au || null

  if (Object.keys(dbUpdates).length === 0) return { error: 'Aucun champ patchable fourni' }
  dbUpdates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('charges_recurrentes')
    .update(dbUpdates)
    .eq('id', id)
    .eq('parametre_id', parametre_id)
    .select()
    .single()
  if (error) return { error: error.message }
  return {
    success: true,
    id: data.id,
    libelle: data.libelle_personnalise,
    champs_modifies: Object.keys(dbUpdates).filter(k => k !== 'updated_at'),
    montant_attendu_ttc: arrondi2(data.montant_attendu),
    jour_du_mois: data.jour_du_mois,
    actif: data.actif,
  }
}

// ─── 8. validerSuggestion ─────────────────────────────────────────────
// Délègue à la route /api/charges-suggestions/:id/validate côté API.
// On reproduit la logique anti-doublon ici car appel direct DB (pas HTTP).
export async function validerSuggestion({ parametre_id, suggestion_id, montant_modifie_ttc = null }) {
  if (!suggestion_id) return { error: 'suggestion_id requis' }

  const { data: suggestion } = await supabase
    .from('charges_suggestions')
    .select('*')
    .eq('id', suggestion_id)
    .eq('parametre_id', parametre_id)
    .maybeSingle()
  if (!suggestion) return { error: 'Suggestion introuvable ou hors tenant' }

  if (suggestion.statut === 'validated') {
    return { error: 'Suggestion déjà validée', transaction_id: suggestion.transaction_id }
  }
  if (suggestion.statut !== 'pending' && suggestion.statut !== 'modified') {
    return { error: `Suggestion en statut ${suggestion.statut}` }
  }

  const { data: charge } = await supabase
    .from('charges_recurrentes')
    .select('*')
    .eq('id', suggestion.charge_recurrente_id)
    .eq('parametre_id', parametre_id)
    .maybeSingle()
  if (!charge) return { error: 'Charge récurrente liée introuvable' }

  // Anti-doublon : même mois + même catégorie + fournisseur similaire
  const moisStart = suggestion.mois + '-01'
  const [y, m] = suggestion.mois.split('-').map(Number)
  const moisEndDate = new Date(Date.UTC(y, m, 0))
  const moisEnd = moisEndDate.toISOString().slice(0, 10)

  let doublonQuery = supabase
    .from('transactions')
    .select('id, date, fournisseur_nom, montant_ttc')
    .eq('parametre_id', parametre_id)
    .eq('categorie_pl', charge.categorie_pl)
    .gte('date', moisStart).lte('date', moisEnd)
  if (suggestion.fournisseur_suggere) {
    doublonQuery = doublonQuery.ilike('fournisseur_nom', `%${suggestion.fournisseur_suggere}%`)
  }
  const { data: doublons } = await doublonQuery
  if (doublons && doublons.length > 0) {
    return {
      error: 'Une transaction similaire existe déjà ce mois-ci',
      existing_transaction_id: doublons[0].id,
      existing_transaction: doublons[0],
    }
  }

  // INSERT transaction
  const montantTtc = montant_modifie_ttc != null ? Number(montant_modifie_ttc) : Number(suggestion.montant_suggere)
  const tauxTva = Number(charge.taux_tva_defaut || 20)
  const montantHt = Math.round((montantTtc / (1 + tauxTva / 100)) * 100) / 100
  const montantTva = Math.round((montantTtc - montantHt) * 100) / 100
  const fournisseurNom = suggestion.fournisseur_suggere || charge.fournisseur_nom_attendu || charge.libelle_personnalise

  // sous_categorie NOT NULL en BDD → fallback sur le libellé de la charge si non défini
  const sousCategorie = charge.sous_categorie || charge.libelle_personnalise || 'autres'

  const { data: transaction, error: tErr } = await supabase
    .from('transactions')
    .insert({
      parametre_id,
      date: suggestion.date_attendue,
      montant_ttc: montantTtc,
      taux_tva: tauxTva,
      montant_ht: montantHt,
      montant_tva: montantTva,
      fournisseur_nom: fournisseurNom,
      sous_categorie: sousCategorie,
      categorie_pl: charge.categorie_pl,
      note: `Validé via chat IA depuis suggestion #${suggestion.id}`,
    })
    .select()
    .single()
  if (tErr) return { error: tErr.message }

  await supabase
    .from('charges_suggestions')
    .update({
      statut: 'validated',
      transaction_id: transaction.id,
      validated_at: new Date().toISOString(),
      montant_modifie: montant_modifie_ttc != null ? Number(montant_modifie_ttc) : null,
    })
    .eq('id', suggestion.id).eq('parametre_id', parametre_id)

  return {
    success: true,
    transaction_id: transaction.id,
    suggestion_id: suggestion.id,
    montant_ttc: arrondi2(montantTtc),
    montant_ht: arrondi2(montantHt),
    montant_tva: arrondi2(montantTva),
    fournisseur_nom: fournisseurNom,
  }
}

// ─── 9. accepterCandidat ──────────────────────────────────────────────
export async function accepterCandidat({
  parametre_id, candidate_id,
  libelle = null, profil = null, frequence = null, jour_du_mois = null,
  montant_attendu_ttc = null, taux_tva = null, charge_type_code = null,
}) {
  if (!candidate_id) return { error: 'candidate_id requis' }
  if (!jour_du_mois || jour_du_mois < 1 || jour_du_mois > 28) {
    return { error: 'jour_du_mois requis entre 1 et 28' }
  }

  const { data: candidate } = await supabase
    .from('recurrence_candidates')
    .select('*')
    .eq('id', candidate_id)
    .eq('parametre_id', parametre_id)
    .maybeSingle()
  if (!candidate) return { error: 'Candidate introuvable ou hors tenant' }
  if (candidate.statut !== 'pending' && candidate.statut !== 'proposed') {
    return { error: `Candidate en statut ${candidate.statut}` }
  }

  const hints = candidate.hints_llm || {}
  const finalLibelle = libelle || hints.libelle_propose || candidate.fournisseur_nom_brut
  const finalProfil = profil || hints.profil || 'fixe'
  const finalFrequence = frequence || hints.frequence || 'mensuel'
  const finalMontant = montant_attendu_ttc != null ? Number(montant_attendu_ttc) : Number(candidate.montant_median)
  const finalTaux = taux_tva != null ? Number(taux_tva) : 20
  const finalChargeTypeCode = charge_type_code || hints.charge_type_code

  if (!PROFILS_VALIDES.includes(finalProfil)) return { error: 'profil invalide' }
  if (!FREQUENCES_VALIDES.includes(finalFrequence)) return { error: 'frequence invalide' }

  let charge_type_id = null
  if (finalChargeTypeCode && finalChargeTypeCode !== 'aucun') {
    const { data: ct } = await supabase
      .from('charges_types')
      .select('id')
      .eq('code', finalChargeTypeCode)
      .maybeSingle()
    charge_type_id = ct?.id || null
  }

  const { data: nouvelleCharge, error: iErr } = await supabase
    .from('charges_recurrentes')
    .insert({
      parametre_id,
      charge_type_id,
      libelle_personnalise: finalLibelle,
      categorie_pl: candidate.categorie_pl,
      fournisseur_nom_attendu: candidate.fournisseur_nom_brut,
      profil: finalProfil,
      frequence: finalFrequence,
      jour_du_mois,
      montant_attendu: finalMontant,
      taux_tva_defaut: finalTaux,
      source_creation: 'chat_ia',
    })
    .select()
    .single()
  if (iErr) return { error: iErr.message }

  await supabase
    .from('recurrence_candidates')
    .update({ statut: 'accepted', charge_recurrente_id: nouvelleCharge.id, updated_at: new Date().toISOString() })
    .eq('id', candidate_id).eq('parametre_id', parametre_id)

  return {
    success: true,
    charge_recurrente_id: nouvelleCharge.id,
    candidate_id,
    libelle: finalLibelle,
    montant_attendu_ttc: arrondi2(finalMontant),
    jour_du_mois,
    frequence: finalFrequence,
  }
}

// ─── 10. lancerScanDetection ──────────────────────────────────────────
export async function lancerScanDetection({ parametre_id, enrich = false }) {
  // Note : pas de force_enrich ici — si l'utilisateur veut re-LLM sur tous,
  // qu'il passe par l'UI (bouton ✨ sur /previsions). Garde-fou coût.
  try {
    const layer1 = await scannerEtUpserter(parametre_id)
    if (enrich === true) {
      const layer2 = await enrichirEtUpserter(parametre_id)
      return {
        success: true,
        nb_candidats: layer1.nb_candidats,
        nb_inserts: layer1.nb_inserts,
        nb_updates: layer1.nb_updates,
        enrichment: {
          nb_enriched: layer2.nb_enriched,
          nb_failed: layer2.nb_failed,
          cout_eur_centimes: arrondi2((layer2.cout_eur || 0) * 100),
        },
      }
    }
    return {
      success: true,
      nb_candidats: layer1.nb_candidats,
      nb_inserts: layer1.nb_inserts,
      nb_updates: layer1.nb_updates,
    }
  } catch (e) {
    return { error: e.message }
  }
}
