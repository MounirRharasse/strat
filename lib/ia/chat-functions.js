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
import * as chargesRec from './chat-functions/charges-recurrentes.js'

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
  getDateAujourdhui: meta.getDateAujourdhui,
  // charges récurrentes (Lot 9 — lecture + écriture avec confirmation)
  listChargesActivesChat: chargesRec.listChargesActivesChat,
  rechercherCharge: chargesRec.rechercherCharge,
  getChargeByIdChat: chargesRec.getChargeByIdChat,
  listSuggestionsPendingChat: chargesRec.listSuggestionsPendingChat,
  listCandidatesChat: chargesRec.listCandidatesChat,
  creerChargeRecurrente: chargesRec.creerChargeRecurrente,
  editerChargeRecurrente: chargesRec.editerChargeRecurrente,
  validerSuggestion: chargesRec.validerSuggestion,
  accepterCandidat: chargesRec.accepterCandidat,
  lancerScanDetection: chargesRec.lancerScanDetection,
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
  },

  // ── CHARGES RÉCURRENTES — LECTURE (Lot 9) ────────────────────────────
  {
    name: 'listChargesActivesChat',
    description: "Liste les charges récurrentes ACTIVES du restaurant (loyer, abonnements, URSSAF, expert-comptable, etc.). Tri par jour du mois croissant. Utiliser pour répondre à 'mes charges récurrentes', 'combien d'abonnements', etc.",
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'rechercherCharge',
    description: "OBLIGATOIRE avant tout appel à creerChargeRecurrente : recherche fuzzy ILIKE par libellé OU nom de fournisseur. Limit 5. Permet de détecter si une charge similaire existe déjà (anti-doublon).",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Terme à rechercher (min 2 caractères, ex: "loyer", "spotify", "free")' }
      },
      required: ['query']
    }
  },
  {
    name: 'getChargeByIdChat',
    description: "Récupère une charge récurrente par son uuid. Utiliser pour pré-remplir un éditer ou afficher détails complets.",
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'UUID de la charge' } },
      required: ['id']
    }
  },
  {
    name: 'listSuggestionsPendingChat',
    description: "Liste les suggestions de transactions en attente de validation pour le mois courant ou un mois précis. Générées par le cron mensuel le 1er. Utiliser pour répondre à 'qu'est-ce que je dois saisir ce mois ?'.",
    input_schema: {
      type: 'object',
      properties: {
        mois: { type: 'string', description: "YYYY-MM (ex: '2026-05'). Optionnel — si omis retourne toutes les suggestions pending toutes périodes." }
      },
      required: []
    }
  },
  {
    name: 'listCandidatesChat',
    description: "Liste les candidats récurrence détectés par l'IA (Layer 1+2) en attente d'acceptation. Tri par confiance décroissante. Utiliser pour 'mes charges détectées par l'IA' ou 'qu'est-ce que tu m'as proposé ?'.",
    input_schema: { type: 'object', properties: {}, required: [] }
  },

  // ── CHARGES RÉCURRENTES — ÉCRITURE (Lot 9) ───────────────────────────
  // Toutes ces fonctions modifient la BDD. Le system prompt impose le pattern
  // "brouillon → confirmation explicite utilisateur" avant tout appel.
  {
    name: 'creerChargeRecurrente',
    description: "ÉCRITURE BDD. Crée une nouvelle charge récurrente. AVANT d'appeler cette fonction, tu DOIS : 1) appeler rechercherCharge pour vérifier qu'elle n'existe pas déjà ; 2) présenter à l'utilisateur en français ce que tu vas faire ('Je propose : [résumé] — Confirme ?') et attendre son OK explicite. Source automatiquement = 'chat_ia'.",
    input_schema: {
      type: 'object',
      properties: {
        libelle: { type: 'string', description: 'Libellé humain (ex: "Pennylane logiciel paie")' },
        categorie_pl: { type: 'string', description: "Catégorie P&L (ex: 'loyers_charges', 'honoraires', 'energie', 'autres_frais_influencables', 'autres_charges_personnel'...)" },
        profil: { type: 'string', enum: ['fixe', 'variable_recurrente', 'one_shot'], description: "Default 'fixe'" },
        frequence: { type: 'string', enum: ['mensuel', 'trimestriel', 'semestriel', 'annuel'], description: "Default 'mensuel'" },
        jour_du_mois: { type: 'integer', description: 'Jour 1-28 (REQUIS)' },
        montant_attendu_ttc: { type: 'number', description: 'Montant TTC en euros (requis si profil=fixe)' },
        formule_calcul: { type: 'string', description: 'Optionnel — DSL formule pour profil=variable_recurrente (V1.2 non évalué)' },
        taux_tva: { type: 'number', enum: [0, 5.5, 10, 20], description: 'Default 20. Mettre 0 pour URSSAF/TVA/IS/mutuelle/assurance/frais bancaires.' },
        fournisseur_nom_attendu: { type: 'string', description: "Optionnel — nom du fournisseur attendu (ex: 'SCI Castelnau')" },
        sous_categorie: { type: 'string', description: 'Optionnel' },
        charge_type_code: { type: 'string', description: "Optionnel — code du catalogue partagé (ex: 'loyer_commercial', 'expert_comptable', 'urssaf'). Permet de mapper sur le catalogue." }
      },
      required: ['libelle', 'categorie_pl', 'jour_du_mois']
    }
  },
  {
    name: 'editerChargeRecurrente',
    description: "ÉCRITURE BDD. Édite une charge récurrente existante. Présenter le brouillon avant + confirmation explicite. Pour désactiver une charge : actif=false.",
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'UUID de la charge à éditer' },
        libelle: { type: 'string' },
        sous_categorie: { type: 'string' },
        fournisseur_nom_attendu: { type: 'string' },
        jour_du_mois: { type: 'integer' },
        montant_attendu_ttc: { type: 'number' },
        formule_calcul: { type: 'string' },
        taux_tva: { type: 'number', enum: [0, 5.5, 10, 20] },
        actif: { type: 'boolean' },
        pause_jusqu_au: { type: 'string', description: "YYYY-MM-DD ou null pour lever la pause" }
      },
      required: ['id']
    }
  },
  {
    name: 'validerSuggestion',
    description: "ÉCRITURE BDD. Valide une suggestion → INSERT transaction réelle. Anti-doublon : si transaction similaire existe déjà ce mois, retourne erreur avec existing_transaction_id. Présenter brouillon + confirmation avant.",
    input_schema: {
      type: 'object',
      properties: {
        suggestion_id: { type: 'string', description: 'UUID de la suggestion' },
        montant_modifie_ttc: { type: 'number', description: "Optionnel — override le montant_suggere si l'utilisateur précise un autre montant" }
      },
      required: ['suggestion_id']
    }
  },
  {
    name: 'accepterCandidat',
    description: "ÉCRITURE BDD. Accepte un candidat IA → crée une charges_recurrente. Présenter brouillon + confirmation avant. Le LLM peut override les valeurs proposées par hints_llm.",
    input_schema: {
      type: 'object',
      properties: {
        candidate_id: { type: 'string' },
        libelle: { type: 'string', description: 'Optionnel — défaut hints_llm.libelle_propose ou fournisseur_nom_brut' },
        profil: { type: 'string', enum: ['fixe', 'variable_recurrente', 'one_shot'] },
        frequence: { type: 'string', enum: ['mensuel', 'trimestriel', 'semestriel', 'annuel'] },
        jour_du_mois: { type: 'integer', description: 'REQUIS (le LLM doit demander à l\'utilisateur)' },
        montant_attendu_ttc: { type: 'number', description: 'Optionnel — défaut candidate.montant_median' },
        taux_tva: { type: 'number', enum: [0, 5.5, 10, 20] },
        charge_type_code: { type: 'string' }
      },
      required: ['candidate_id', 'jour_du_mois']
    }
  },

  // ── CHARGES RÉCURRENTES — ACTION (Lot 9) ─────────────────────────────
  {
    name: 'lancerScanDetection',
    description: "ACTION. Déclenche le scan IA Layer 1 (déterministe, gratuit) pour détecter les fournisseurs récurrents dans les 6 derniers mois de transactions. Si enrich=true, ajoute Layer 2 LLM Haiku qui propose des libellés humains (~1 centime). Présenter coût + confirmation avant si enrich=true.",
    input_schema: {
      type: 'object',
      properties: {
        enrich: { type: 'boolean', description: "Si true, ajoute Layer 2 LLM (~1 centime). Default false." }
      },
      required: []
    }
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
