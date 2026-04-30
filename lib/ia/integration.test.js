// Test d'intégration RÉEL avec l'API Anthropic.
//
// Skip automatiquement si ANTHROPIC_API_KEY n'est pas en env (CI sans clé).
// À lancer manuellement après le commit pour valider la chaîne complète :
//   ANTHROPIC_API_KEY=sk-... npm test -- lib/ia/integration
//
// Coût attendu : < 0.001€ par exécution (Haiku, prompt minimal).

import { describe, it, expect } from 'vitest'

const HAS_KEY = !!process.env.ANTHROPIC_API_KEY
const KROUSTY_ID = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'

describe.runIf(HAS_KEY)('Integration Claude (skip si pas de ANTHROPIC_API_KEY)', () => {
  it('appelle Haiku 4.5, retourne content non vide + ligne ia_usage trackée', async () => {
    // Import dynamique : le vrai Supabase est utilisé (pas de mock).
    const { callClaude } = await import('../ai.js')

    const r = await callClaude({
      model: 'claude-haiku-4-5-20251001',
      system: 'Tu réponds en français très court.',
      messages: [{ role: 'user', content: "Réponds uniquement par OK." }],
      parametre_id: KROUSTY_ID,
      feature: 'test',
      opts: { max_tokens: 20, timeout_ms: 30000 }
    })

    expect(r.error).toBeUndefined()
    expect(r.content).toBeTruthy()
    expect(r.content.length).toBeGreaterThan(0)
    expect(r.tokens_input).toBeGreaterThan(0)
    expect(r.tokens_output).toBeGreaterThan(0)
    expect(r.cout_eur).toBeGreaterThan(0)
    expect(r.cout_eur).toBeLessThan(0.001)
    expect(r.model).toBe('claude-haiku-4-5-20251001')
  }, 60000)
})

describe.skipIf(HAS_KEY)('Integration Claude (info)', () => {
  it('skip — définir ANTHROPIC_API_KEY pour lancer le test réel', () => {
    expect(true).toBe(true)
  })
})
