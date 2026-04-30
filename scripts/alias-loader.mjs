// Node loader : résout l'alias '@/' → racine du projet.
// Utilisé par les scripts ad-hoc (test-brief.mjs) qui importent du code
// applicatif utilisant la convention Next.js des alias.

import { fileURLToPath } from 'node:url'
import { dirname, resolve as pathResolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = pathResolve(__dirname, '..')

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const filepath = projectRoot + '/' + specifier.slice(2)
    const url = filepath.endsWith('.js')
      ? 'file://' + filepath
      : 'file://' + filepath + '.js'
    return nextResolve(url, context)
  }
  return nextResolve(specifier, context)
}

// Force ESM pour les fichiers .js du projet (pas de "type:module" dans
// package.json — Next.js gère via webpack, Node natif les voit en CJS).
export async function load(url, context, nextLoad) {
  if (
    url.startsWith('file://' + projectRoot) &&
    !url.includes('/node_modules/') &&
    url.endsWith('.js')
  ) {
    return nextLoad(url, { ...context, format: 'module' })
  }
  return nextLoad(url, context)
}
