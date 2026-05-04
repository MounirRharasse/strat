// Garde-fou anti-contournement du helper lib/data/ventes.js (Sprint Migration étape 5).
// LECTURE PURE.
//
// Vérifie qu'aucun fichier tracked sous app/ ou lib/ ne lit directement
// historique_ca ni entrees, sauf whitelist documentée.
//
// Exit 1 si match hors whitelist, exit 0 sinon.
// À lancer en pre-commit, en CI, ou manuellement après un refacto.
//
// Usage : node scripts/check-no-direct-legacy-reads.mjs

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Patterns à détecter (lecture directe des tables legacy)
const PATTERNS = [
  /\.from\(['"]historique_ca['"]\)/,
  /\.from\(['"]entrees['"]\)/,
]

// Whitelist : fichiers où la lecture/écriture directe est légitime.
// Toute extension de cette liste doit être justifiée par un commentaire.
const WHITELIST = new Set([
  // Cron qui WRITE dans historique_ca legacy en dual-write avec ventes_par_source
  'app/api/cron/nightly/route.js',
  // Outil admin qui re-run le cron sur dates passées (backfill historique_ca)
  'app/api/admin/backfill-cron/route.js',
  // CRUD FAB pour entrees — entrees reste source de saisie jusqu'à étape 7
  // (migration FAB pour qu'il écrive directement dans ventes_par_source.uber_eats)
  'app/api/entrees/route.js',
  // REFONTE ADMIN V1+ : sortie de la migration étape 5, à reprendre
  // dans un sprint dédié. Ces fichiers continueront à lire
  // historique_ca et entrees jusqu'à la refonte. À l'étape 7 (drop
  // legacy), ces fichiers casseront → la refonte admin doit être
  // faite avant l'étape 7.
  'app/admin/page.js',
  'app/admin/donnees/page.js',
  'app/admin/monitoring/page.js',
])

// Liste des fichiers tracked sous app/ et lib/ avec extensions JS
const cmd = "git ls-files 'app/**/*.js' 'app/**/*.mjs' 'app/**/*.jsx' 'lib/**/*.js' 'lib/**/*.mjs' 'lib/**/*.jsx'"
const files = execSync(cmd, { encoding: 'utf-8' })
  .split('\n')
  .filter(Boolean)
  .filter(f => !f.endsWith('.test.js') && !f.endsWith('.test.mjs'))

const matches = []
for (const file of files) {
  if (WHITELIST.has(file)) continue
  let content
  try {
    content = readFileSync(file, 'utf-8')
  } catch {
    continue
  }
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of PATTERNS) {
      if (pattern.test(lines[i])) {
        matches.push({ file, line: i + 1, snippet: lines[i].trim() })
      }
    }
  }
}

console.log('━'.repeat(80))
console.log('  CHECK NO DIRECT LEGACY READS — Sprint Migration étape 5')
console.log('━'.repeat(80))
console.log(`  Fichiers scannés : ${files.length}`)
console.log(`  Whitelist        : ${WHITELIST.size} fichier(s)`)
console.log(`  Patterns         : ${PATTERNS.map(p => p.source).join(', ')}`)
console.log()

if (matches.length === 0) {
  console.log('  ✅ Aucune lecture directe legacy détectée hors whitelist.')
  console.log('━'.repeat(80))
  process.exit(0)
}

console.log(`  ❌ ${matches.length} lecture(s) directe(s) hors whitelist :`)
console.log()
const byFile = {}
for (const m of matches) {
  if (!byFile[m.file]) byFile[m.file] = []
  byFile[m.file].push(m)
}
for (const [file, ms] of Object.entries(byFile).sort()) {
  console.log(`  ${file} (${ms.length} match) :`)
  for (const m of ms) {
    console.log(`    L${m.line} : ${m.snippet}`)
  }
}
console.log()
console.log(`  → Migrer ces lectures vers lib/data/ventes.js (cf. PLANNING_V1.md §Sprint Migration data layer Étape 5).`)
console.log(`  → Ou ajouter à la whitelist avec justification si lecture/écriture légitime.`)
console.log('━'.repeat(80))
process.exit(1)
