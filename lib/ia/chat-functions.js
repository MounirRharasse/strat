// Sprint IA Phase 1 commit 8 — Registry des fonctions chat.
//
// Exporte :
// - TOOLS : array de { name, description, input_schema } au format
//   Anthropic tools (à passer dans messages.create({ tools }) commit 9)
// - dispatch({ name, input, parametre_id }) : route vers l'implémentation
//   et retourne { result, error?, truncated? }

import * as general from './chat-functions/general.js'
import * as fournisseurs from './chat-functions/fournisseurs.js'
import * as anomalies from './chat-functions/anomalies.js'
import * as insights from './chat-functions/insights.js'
import * as meta from './chat-functions/meta.js'

const REGISTRY = {
  // général
  getCAJour: general.getCAJour,
  getCASemaine: general.getCASemaine,
  getCAMois: general.getCAMois,
  getFoodCost: general.getFoodCost,
  getSeuilRentabilite: general.getSeuilRentabilite,
  // fournisseurs
  getTopFournisseurs: fournisseurs.getTopFournisseurs,
  getTransactionsFournisseur: fournisseurs.getTransactionsFournisseur,
  getMedianeFournisseur: fournisseurs.getMedianeFournisseur,
  // anomalies
  getAnomaliesJournal: anomalies.getAnomaliesJournal,
  getTrousSaisie: anomalies.getTrousSaisie,
  // insights
  getInsightsRecents: insights.getInsightsRecents,
  getBriefSemaine: insights.getBriefSemaine,
  // meta
  getParametres: meta.getParametres,
  getStatutSynchro: meta.getStatutSynchro,
  getDateAujourdhui: meta.getDateAujourdhui
}

// Schémas JSON au format Anthropic tools.
export const TOOLS = [
  // ── GÉNÉRAL ──────────────────────────────────────────────────────────
  {
    name: 'getCAJour',
    description: "Renvoie le CA d'un jour donné (brut, HT, commandes, panier moyen, répartition canaux). À utiliser pour répondre à \"Combien j'ai fait le X ?\" ou \"CA d'hier\".",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date au format YYYY-MM-DD' }
      },
      required: ['date']
    }
  },
  {
    name: 'getCASemaine',
    description: "Renvoie le CA d'une semaine ISO (lundi-dimanche) avec food cost de la semaine. À utiliser pour \"CA cette semaine\", \"CA semaine 17\".",
    input_schema: {
      type: 'object',
      properties: {
        semaine_iso: { type: 'string', description: 'Semaine ISO format YYYY-Wxx (ex: 2026-W17)' }
      },
      required: ['semaine_iso']
    }
  },
  {
    name: 'getCAMois',
    description: "Renvoie le CA d'un mois calendaire (1er au dernier jour). Si mois en cours, s'arrête à aujourd'hui.",
    input_schema: {
      type: 'object',
      properties: {
        mois_iso: { type: 'string', description: 'Mois format YYYY-MM (ex: 2026-04)' }
      },
      required: ['mois_iso']
    }
  },
  {
    name: 'getFoodCost',
    description: "Renvoie le food cost d'une semaine ISO avec mode (estime/exact) et seuil d'alerte du tenant.",
    input_schema: {
      type: 'object',
      properties: {
        semaine_iso: { type: 'string', description: 'Semaine ISO format YYYY-Wxx' }
      },
      required: ['semaine_iso']
    }
  },
  {
    name: 'getSeuilRentabilite',
    description: "Renvoie l'état du seuil de rentabilité 30j roulants (seuil mensuel HT, marge brute, charges fixes).",
    input_schema: { type: 'object', properties: {}, required: [] }
  },

  // ── FOURNISSEURS ─────────────────────────────────────────────────────
  {
    name: 'getTopFournisseurs',
    description: "Top N fournisseurs par cumul HT consommations sur une période, avec variation vs période précédente de même durée. n max=10 (default 5). Si pas de période, défaut = 30 derniers jours.",
    input_schema: {
      type: 'object',
      properties: {
        periode_since: { type: 'string', description: 'YYYY-MM-DD (défaut: 30 derniers jours)' },
        periode_until: { type: 'string', description: "YYYY-MM-DD (défaut: aujourd'hui)" },
        n: { type: 'integer', description: 'Nombre de fournisseurs (max 10, default 5)' }
      },
      required: []
    }
  },
  {
    name: 'getTransactionsFournisseur',
    description: "Liste les transactions d'un fournisseur sur une période (limit 50). Si tronqué, total_count indique le vrai nombre. Recherche ILIKE (insensible casse, partielle).",
    input_schema: {
      type: 'object',
      properties: {
        fournisseur_nom: { type: 'string', description: 'Nom (recherche partielle insensible à la casse)' },
        periode_since: { type: 'string', description: 'YYYY-MM-DD (défaut: 90 derniers jours)' },
        periode_until: { type: 'string', description: "YYYY-MM-DD (défaut: aujourd'hui)" }
      },
      required: ['fournisseur_nom']
    }
  },
  {
    name: 'getMedianeFournisseur',
    description: "Médiane TTC, min, max et nb d'achats des 6 derniers mois pour un fournisseur. Utile pour évaluer si un montant est anormal.",
    input_schema: {
      type: 'object',
      properties: {
        fournisseur_nom: { type: 'string', description: 'Nom (recherche partielle)' }
      },
      required: ['fournisseur_nom']
    }
  },

  // ── ANOMALIES ────────────────────────────────────────────────────────
  {
    name: 'getAnomaliesJournal',
    description: "Liste les alertes du journal sur une période (trous saisie, anomalies montant, trous catégorie, trous canal). Max 20 alertes retournées. Défaut = 7 derniers jours.",
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'YYYY-MM-DD (défaut: 7 derniers jours)' },
        until: { type: 'string', description: "YYYY-MM-DD (défaut: aujourd'hui)" }
      },
      required: []
    }
  },
  {
    name: 'getTrousSaisie',
    description: "Sous-ensemble de getAnomaliesJournal : juste les trous (jours sans data, canal manquant, catégorie absente). Pratique pour \"qu'est-ce qui me manque dans mes saisies ?\"",
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string' },
        until: { type: 'string' }
      },
      required: []
    }
  },

  // ── INSIGHTS ─────────────────────────────────────────────────────────
  {
    name: 'getInsightsRecents',
    description: "Liste les insights IA générés par le cron quotidien sur les N derniers jours (max 14, default 7). Avec contenu narratif déjà rédigé.",
    input_schema: {
      type: 'object',
      properties: {
        n_jours: { type: 'integer', description: 'Nombre de jours à regarder (max 14, default 7)' }
      },
      required: []
    }
  },
  {
    name: 'getBriefSemaine',
    description: "Renvoie le brief lundi pour une semaine donnée (généré automatiquement par cron). Markdown avec sections Résumé / 3 forts / 3 vigilance / 3 actions.",
    input_schema: {
      type: 'object',
      properties: {
        semaine_iso: { type: 'string', description: 'Semaine ISO format YYYY-Wxx' }
      },
      required: ['semaine_iso']
    }
  },

  // ── META ─────────────────────────────────────────────────────────────
  {
    name: 'getParametres',
    description: "Renvoie les paramètres du restaurant : nom, type, plan, objectifs (CA, food cost, marge), jours fermés.",
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'getStatutSynchro',
    description: "Renvoie l'état de la dernière synchro Popina : date, age en heures, OK/KO. À appeler si l'utilisateur dit que les chiffres semblent incohérents.",
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'getDateAujourdhui',
    description: "Renvoie la date d'aujourd'hui dans la timezone du restaurant + semaine ISO + mois ISO + jour de la semaine. À appeler si tu dois calculer 'il y a X jours'.",
    input_schema: { type: 'object', properties: {}, required: [] }
  }
]

/**
 * Route un appel d'outil vers l'implémentation. Retourne un objet
 * { result } en cas de succès, { error } sinon. Si `truncated` est
 * dans le result, le rebondit au top-level pour que l'appelant le voie.
 */
export async function dispatch({ name, input, parametre_id }) {
  const fn = REGISTRY[name]
  if (!fn) return { error: `Fonction inconnue : ${name}` }
  try {
    const result = await fn({ parametre_id, ...(input || {}) })
    return {
      result,
      truncated: result?.truncated || false
    }
  } catch (e) {
    return { error: e.message }
  }
}

// Export pour tests / debug
export const _internal = { REGISTRY }
