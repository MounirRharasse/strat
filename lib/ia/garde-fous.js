// Sprint IA Phase 1 commit 1 — Garde-fous IA.
//
// 4 fonctions exposées :
//   - validerSeuilsMinDonnees : refuse génération si historique insuffisant
//   - detectChiffresHallucines : compare chiffres réponse vs inputs structurés
//   - rateLimit : limite quotidienne par feature et tenant
//   - filtrerDomainesExclus : refuse réponses sur domaines hors scope
//
// Cf. STRAT_IA.md §6 (Règles non-négociables).

import { supabase } from '@/lib/supabase'
import { getCouverture } from '@/lib/data/ventes'

// ─────────────────────────────────────────────────────────────────────
// Liste noire des domaines exclus (cf. STRAT_IA.md §6 Règle 4).
// L'IA ne donne jamais d'avis sur ces sujets.
// ─────────────────────────────────────────────────────────────────────
const DOMAINES_EXCLUS = [
  /licenci[ée]?(?:e|er|ement|s)?/i,         // licenciement, licencier
  /droit du travail/i,
  /bail commercial/i,
  /convention collective/i,
  /publicit[eé]/i,                          // publicité, pub
  /\bseo\b/i,
  /marketing digital/i,
  /campagne(?:s)? google ads/i,
  /campagne(?:s)? facebook/i
]

// ─────────────────────────────────────────────────────────────────────
// Limites quotidiennes par feature (par tenant).
// Cf. STRAT_IA.md §7 Pilotage des coûts.
// ─────────────────────────────────────────────────────────────────────
const RATE_LIMITS = {
  brief: 10,       // 1×/lundi normalement, marge pour regen manuelles
  anomalie: 50,    // sur 10 anomalies/mois × 5 clics max
  insight: 5,      // 1×/jour normalement
  chat: 30,        // commit 9+
  test: 1000       // tests d'intégration, large
}

// ─────────────────────────────────────────────────────────────────────
// 1. Validation des seuils minimaux de données par feature.
// ─────────────────────────────────────────────────────────────────────

const MIN_HISTORIQUE_BRIEF_JOURS = 28        // ~4 semaines
const MIN_TRANSACTIONS_ANOMALIE_FOURNISSEUR = 6

/**
 * Vérifie que l'historique est suffisant pour la feature demandée.
 *
 * @param {Object} params
 * @param {'brief'|'anomalie'|'insight'|'chat'} params.feature
 * @param {string} params.parametre_id
 * @param {string} [params.fournisseur_nom] - Pour 'anomalie'
 * @returns {Promise<{ ok: boolean, raison?: string }>}
 */
export async function validerSeuilsMinDonnees({ feature, parametre_id, fournisseur_nom }) {
  if (feature === 'brief') {
    const seuil = new Date()
    seuil.setDate(seuil.getDate() - MIN_HISTORIQUE_BRIEF_JOURS)
    const seuilISO = seuil.toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    try {
      const cov = await getCouverture(parametre_id, seuilISO, today)
      if (cov.nb_jours_couverts < 14) {
        return { ok: false, raison: 'historique_insuffisant_brief' }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, raison: 'erreur_lecture_historique' }
    }
  }

  if (feature === 'anomalie') {
    if (!fournisseur_nom) return { ok: true } // permissif si pas précisé
    const { count, error } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('parametre_id', parametre_id)
      .eq('fournisseur_nom', fournisseur_nom)
    if (error) return { ok: false, raison: 'erreur_lecture_transactions' }
    if ((count || 0) < MIN_TRANSACTIONS_ANOMALIE_FOURNISSEUR) {
      return { ok: false, raison: 'historique_fournisseur_insuffisant' }
    }
    return { ok: true }
  }

  if (feature === 'insight') {
    // Seuils détaillés gérés par lib/ia-insight.js (commit 5+).
    return { ok: true }
  }

  if (feature === 'chat') {
    // Pas de seuil V1 (le chat peut répondre "Je n'ai pas encore assez de données").
    return { ok: true }
  }

  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────
// 2. Détection des chiffres hallucinés.
// Tout chiffre suivi de € dans la réponse doit exister (à 5% près) dans
// les inputs structurés passés au prompt.
// ─────────────────────────────────────────────────────────────────────

function collectAllNumbers(input) {
  const result = []
  function walk(v) {
    if (v == null) return
    if (typeof v === 'number' && Number.isFinite(v)) {
      result.push(v)
    } else if (typeof v === 'string') {
      // Récupère aussi les nombres dans les strings (ex : "1 200 €" en input)
      const matches = v.matchAll(/-?\d[\d\s]*(?:[.,]\d+)?/g)
      for (const m of matches) {
        const n = parseFloat(m[0].replace(/\s/g, '').replace(',', '.'))
        if (Number.isFinite(n)) result.push(n)
      }
    } else if (Array.isArray(v)) {
      for (const item of v) walk(item)
    } else if (typeof v === 'object') {
      for (const k of Object.keys(v)) walk(v[k])
    }
  }
  walk(input)
  return result
}

/**
 * Détecte les chiffres suivis de € dans la réponse qui ne correspondent
 * à aucune valeur des inputs structurés (tolérance 5% pour arrondis).
 *
 * @param {string} reponse - Texte généré par l'IA
 * @param {*} inputsAttendus - Objet/array contenant les chiffres autorisés
 * @returns {number[]} Array des chiffres hallucinés (vide si OK)
 */
export function detectChiffresHallucines(reponse, inputsAttendus) {
  if (typeof reponse !== 'string') return []
  // Capture "1234 €", "1 234 €", "1234,5 €", "12.50 €"
  const matches = [...reponse.matchAll(/(-?\d[\d\s]*(?:[.,]\d+)?)\s*€/g)]
  const chiffres = matches
    .map(m => parseFloat(m[1].replace(/\s/g, '').replace(',', '.')))
    .filter(n => Number.isFinite(n))

  const valeurs = collectAllNumbers(inputsAttendus)

  const hallucines = chiffres.filter(c => {
    return !valeurs.some(v => {
      const ref = Math.max(Math.abs(c), 1)
      return Math.abs(v - c) / ref < 0.05
    })
  })

  return hallucines
}

// ─────────────────────────────────────────────────────────────────────
// 3. Rate limiting par feature et tenant.
// Compte les ia_usage des dernières 24h.
// ─────────────────────────────────────────────────────────────────────

/**
 * Vérifie si le tenant est sous la limite quotidienne pour la feature.
 *
 * @param {Object} params
 * @param {string} params.parametre_id
 * @param {'brief'|'anomalie'|'insight'|'chat'|'test'} params.feature
 * @returns {Promise<{ ok: boolean, count: number, limite: number }>}
 */
export async function rateLimit({ parametre_id, feature }) {
  const limite = RATE_LIMITS[feature]
  if (limite == null) return { ok: false, count: 0, limite: 0 }

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count, error } = await supabase
    .from('ia_usage')
    .select('*', { count: 'exact', head: true })
    .eq('parametre_id', parametre_id)
    .eq('feature', feature)
    .gte('created_at', since)

  if (error) {
    // Sécurité : en cas d'erreur Supabase, refuser pour ne pas exploser le coût.
    return { ok: false, count: 0, limite }
  }

  const c = count || 0
  return { ok: c < limite, count: c, limite }
}

// ─────────────────────────────────────────────────────────────────────
// 4. Filtre des domaines exclus dans la réponse IA.
// ─────────────────────────────────────────────────────────────────────

/**
 * Vérifie si la réponse mentionne un domaine exclu (juridique, RH sensible,
 * marketing avancé). Si oui, l'utilisateur doit voir un message générique
 * de redirection vers un expert humain.
 *
 * @param {string} reponse
 * @returns {{ exclu: boolean, pattern?: string }}
 */
export function filtrerDomainesExclus(reponse) {
  if (typeof reponse !== 'string') return { exclu: false }
  for (const re of DOMAINES_EXCLUS) {
    if (re.test(reponse)) {
      return { exclu: true, pattern: re.toString() }
    }
  }
  return { exclu: false }
}

// Export pour tests
export const _internal = { RATE_LIMITS, DOMAINES_EXCLUS, collectAllNumbers }
