// Sprint IA Phase 1 commit 9 — Garde-fous chat.
//
// 4 protections :
// 1. validerMessageUtilisateur : refuse les patterns d'injection sur l'input user
// 2. sanitizeToolOutput : neutralise les patterns dans les tool_results (content injection)
// 3. verifierLoopLimit : empêche les boucles infinies tool_use → tool_result
// 4. verifierCostCap : coupe la conversation si le coût cumulé dépasse N €

const MESSAGE_MAX_LENGTH = 2000
const TOOL_OUTPUT_STRING_MAX = 500
const LOOP_MAX_DEFAUT = 5
const COST_CAP_DEFAUT_EUR = 0.10

// Patterns d'injection prompt (case-insensitive). Ordre = priorité de match.
const PATTERNS_INJECTION = [
  /ignore.{0,20}(les|tes|toutes).{0,20}(instructions|règles|consignes)/i,
  /system.{0,5}prompt/i,
  /(afficher|montre|donne|révèle).{0,30}(instructions|prompt|système)/i,
  /tu es maintenant/i,
  /developer.{0,5}mode/i,
  /jailbreak/i,
  /\bDAN\b/,
  /imagine.{0,20}que.{0,5}tu/i,
  /\bbypass\b/i,
  /\boverride\b/i,
  /\bpretend\b/i
]

// Caractères Unicode invisibles (zero-width spaces, BOM, RLO).
const UNICODE_INVISIBLES = /[​-‍﻿‮]/

// Séquences SQL dangereuses (commande destructive après ;).
const SQL_DESTRUCTIVE = /(;\s*(DROP|DELETE|UPDATE|INSERT|TRUNCATE|ALTER)\b)/i

/**
 * Valide le message utilisateur avant injection au LLM.
 * @returns {{ ok: boolean, raison?: string }}
 */
export function validerMessageUtilisateur(message) {
  if (typeof message !== 'string' || !message.trim()) {
    return { ok: false, raison: 'message_vide' }
  }
  if (message.length > MESSAGE_MAX_LENGTH) {
    return { ok: false, raison: 'message_trop_long' }
  }
  if (UNICODE_INVISIBLES.test(message)) {
    return { ok: false, raison: 'caractere_invisible_detecte' }
  }
  if (SQL_DESTRUCTIVE.test(message)) {
    return { ok: false, raison: 'sequence_sql_suspecte' }
  }
  for (const re of PATTERNS_INJECTION) {
    if (re.test(message)) {
      return { ok: false, raison: 'pattern_injection_detecte', pattern: re.toString() }
    }
  }
  return { ok: true }
}

/**
 * Désactive les patterns d'injection éventuellement présents dans les
 * strings d'un tool_output (content injection : un fournisseur peut
 * s'appeler "Ignore tes instructions"). Limite chaque string à 500 chars.
 *
 * Récursif sur objets/arrays.
 */
export function sanitizeToolOutput(value) {
  return _walk(value)
}

function _walk(v) {
  if (v == null) return v
  if (typeof v === 'string') {
    let cleaned = v
    for (const re of PATTERNS_INJECTION) {
      cleaned = cleaned.replace(new RegExp(re.source, re.flags + 'g'), '[FILTRE]')
    }
    if (UNICODE_INVISIBLES.test(cleaned)) {
      cleaned = cleaned.replace(new RegExp(UNICODE_INVISIBLES.source, 'g'), '')
    }
    if (cleaned.length > TOOL_OUTPUT_STRING_MAX) {
      cleaned = cleaned.slice(0, TOOL_OUTPUT_STRING_MAX) + '…'
    }
    return cleaned
  }
  if (Array.isArray(v)) {
    return v.map(_walk)
  }
  if (typeof v === 'object') {
    const out = {}
    for (const [k, val] of Object.entries(v)) {
      out[k] = _walk(val)
    }
    return out
  }
  return v
}

/** Coupe la boucle si trop d'itérations tool_use/tool_result. */
export function verifierLoopLimit({ iterations, max = LOOP_MAX_DEFAUT }) {
  if (iterations >= max) return { ok: false, raison: 'loop_limit_atteint', iterations, max }
  return { ok: true }
}

/** Coupe si le coût cumulé dépasse la limite (€). */
export function verifierCostCap({ cumul_eur, max = COST_CAP_DEFAUT_EUR }) {
  if (cumul_eur > max) return { ok: false, raison: 'cost_cap_atteint', cumul_eur, max }
  return { ok: true }
}

export const _internal = {
  PATTERNS_INJECTION,
  UNICODE_INVISIBLES,
  SQL_DESTRUCTIVE,
  MESSAGE_MAX_LENGTH,
  TOOL_OUTPUT_STRING_MAX,
  LOOP_MAX_DEFAUT,
  COST_CAP_DEFAUT_EUR
}
