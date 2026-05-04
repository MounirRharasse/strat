// Classifier paiements Popina paramétrable par tenant.
// Cf. PLANNING_V1.md §Sprint Migration data layer Étape 3-ter (v1.4),
// IRRITANTS_UX_V1.md §F10, CLAUDE.md §4 L83 (anti-hardcoding plateforme/tenant).
//
// Pattern : buildClassifier(parametreId) fait 1 fetch BDD au boot,
// renvoie un objet { classify(paymentName) } qui travaille in-memory ensuite.
//
// Format de la config (parametres.config_paiements_classifier jsonb) :
//   { version: 1, rules: [{pattern, categorie, scope}, ...] }
// Premier match wins (ordre du tableau préservé).
// Si config null/absente : fallback sur 7 règles génériques hardcodées.

const FALLBACK_RULES = [
  { pattern: 'esp',        categorie: 'especes', scope: 'generic' },
  { pattern: 'carte',      categorie: 'cb',      scope: 'generic' },
  { pattern: 'credit',     categorie: 'cb',      scope: 'generic' },
  { pattern: 'crédit',     categorie: 'cb',      scope: 'generic' },
  { pattern: 'borne',      categorie: 'tpa',     scope: 'generic' },
  { pattern: 'titre',      categorie: 'tr',      scope: 'generic' },
  { pattern: 'restaurant', categorie: 'tr',      scope: 'generic' },
]

function validateConfig(cfg) {
  if (typeof cfg !== 'object' || cfg === null) {
    throw new Error('config_paiements_classifier doit être un objet')
  }
  if (typeof cfg.version !== 'number') {
    throw new Error('config_paiements_classifier.version manquant ou non numérique')
  }
  if (!Array.isArray(cfg.rules)) {
    throw new Error('config_paiements_classifier.rules doit être un array')
  }
  for (let i = 0; i < cfg.rules.length; i++) {
    const r = cfg.rules[i]
    if (!r || typeof r.pattern !== 'string') {
      throw new Error(`config_paiements_classifier.rules[${i}].pattern doit être un string non vide`)
    }
    if (typeof r.categorie !== 'string') {
      throw new Error(`config_paiements_classifier.rules[${i}].categorie doit être un string`)
    }
  }
}

// Pure : prend une config (ou null) en argument, renvoie un classifier.
// Testable sans BDD.
export function buildClassifierFromConfig(config) {
  const sourceRules = config && config.rules ? config.rules : FALLBACK_RULES
  if (config) validateConfig(config)
  // Normalise les patterns une fois au build, pas à chaque classify().
  const rules = sourceRules.map(r => ({
    pattern: r.pattern.toLowerCase(),
    categorie: r.categorie,
  }))
  return {
    classify(paymentName) {
      if (paymentName == null) return null
      const n = String(paymentName).trim().toLowerCase()
      if (!n) return null
      for (const r of rules) {
        if (n.includes(r.pattern)) return r.categorie
      }
      return null
    },
    rules,
  }
}

// Async : fetch la config tenant en BDD puis renvoie le classifier.
// 1 round-trip DB au boot, classify() reste in-memory ensuite.
export async function buildClassifier(parametreId) {
  const { supabase } = await import('./supabase.js')
  const { data, error } = await supabase
    .from('parametres')
    .select('config_paiements_classifier')
    .eq('id', parametreId)
    .single()
  if (error) throw new Error(`buildClassifier(${parametreId}) : ${error.message}`)
  return buildClassifierFromConfig(data.config_paiements_classifier)
}

// ─── Tests inline ────────────────────────────────────────────────────
// Lancés uniquement si le fichier est exécuté directement.
// Utilise buildClassifierFromConfig avec une config en dur (= seed Krousty),
// pas de connexion BDD requise.
import { fileURLToPath } from 'node:url'
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const KROUSTY_CONFIG = {
    version: 1,
    rules: [
      { pattern: 'foxorder',   categorie: 'cb',      scope: 'tenant' },
      { pattern: 'payxpert',   categorie: 'cb',      scope: 'tenant' },
      { pattern: 'avoir',      categorie: 'ignored', scope: 'tenant' },
      { pattern: 'esp',        categorie: 'especes', scope: 'generic' },
      { pattern: 'carte',      categorie: 'cb',      scope: 'generic' },
      { pattern: 'credit',     categorie: 'cb',      scope: 'generic' },
      { pattern: 'crédit',     categorie: 'cb',      scope: 'generic' },
      { pattern: 'borne',      categorie: 'tpa',     scope: 'generic' },
      { pattern: 'titre',      categorie: 'tr',      scope: 'generic' },
      { pattern: 'restaurant', categorie: 'tr',      scope: 'generic' },
    ],
  }
  const c = buildClassifierFromConfig(KROUSTY_CONFIG)

  const cases = [
    ['Foxorder',           'cb'],
    ['Payxpert',           'cb'],
    ['Avoir',              'ignored'],
    ['Espèce',             'especes'],
    ['Carte VISA',         'cb'],
    ['Borne 1',            'tpa'],
    ['Ticket Restaurant',  'tr'],
    ['Foobar inconnu',     null],
    [null,                 null],
    ['  FOXORDER  ',       'cb'],
  ]

  let ok = 0
  for (const [input, expected] of cases) {
    const actual = c.classify(input)
    if (actual === expected) {
      ok++
      console.log(`  ✓ classify(${JSON.stringify(input)}) → ${JSON.stringify(actual)}`)
    } else {
      throw new Error(`✗ classify(${JSON.stringify(input)}) → ${JSON.stringify(actual)} (attendu ${JSON.stringify(expected)})`)
    }
  }
  console.log(`✓ ${ok}/${cases.length} tests OK`)
  process.exit(0)
}
