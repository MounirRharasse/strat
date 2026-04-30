import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase configurable par test (count + error).
const mocks = vi.hoisted(() => ({
  selectResult: { count: 0, data: [], error: null }
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => {
      // Builder chainable + thenable (comme le PostgrestBuilder réel).
      // Toutes les méthodes filtres retournent le builder.
      // Le `await` final consume `.then` qui résout `mocks.selectResult`.
      const builder = {}
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn(() => builder)
      builder.gte = vi.fn(() => builder)
      builder.lte = vi.fn(() => builder)
      builder.then = (onFulfilled, onRejected) =>
        Promise.resolve(mocks.selectResult).then(onFulfilled, onRejected)
      return builder
    })
  }
}))

const {
  validerSeuilsMinDonnees,
  detectChiffresHallucines,
  rateLimit,
  filtrerDomainesExclus,
  _internal
} = await import('./garde-fous.js')

const KROUSTY_ID = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'

beforeEach(() => {
  mocks.selectResult.count = 0
  mocks.selectResult.error = null
})

// ─────────────────────────────────────────────────────────────────────
// detectChiffresHallucines
// ─────────────────────────────────────────────────────────────────────

describe('detectChiffresHallucines', () => {
  it('aucun chiffre dans la réponse → []', () => {
    const r = detectChiffresHallucines('Tout va bien.', { ca: 1500 })
    expect(r).toEqual([])
  })

  it('tous chiffres viennent des inputs → []', () => {
    const r = detectChiffresHallucines(
      'Ton CA est 1500 €, le mois dernier 1200 €.',
      { ca: 1500, ca_prec: 1200 }
    )
    expect(r).toEqual([])
  })

  it('chiffre inventé (9999 absent des inputs) → détecté', () => {
    const r = detectChiffresHallucines(
      'Ton CA secret vaut 9999 €.',
      { ca: 1500 }
    )
    expect(r).toEqual([9999])
  })

  it('tolérance 5% sur arrondis (1199 vs input 1200) → []', () => {
    const r = detectChiffresHallucines(
      'Ton seuil mensuel est de 1199 €.',
      { seuil: 1200 }
    )
    expect(r).toEqual([])
  })

  it('au-delà 5% (1100 vs input 1200) → détecté', () => {
    const r = detectChiffresHallucines(
      'Ton seuil mensuel est de 1100 €.',
      { seuil: 1200 }
    )
    expect(r).toEqual([1100])
  })

  it('chiffre avec espaces "1 234 €" supporté', () => {
    const r = detectChiffresHallucines(
      'Ton CA est 1 234 €.',
      { ca: 1234 }
    )
    expect(r).toEqual([])
  })

  it('chiffre avec virgule "12,50 €" supporté', () => {
    const r = detectChiffresHallucines(
      'Ton ticket moyen est 12,50 €.',
      { ticket: 12.5 }
    )
    expect(r).toEqual([])
  })

  it('inputs imbriqués (objet + array) explorés récursivement', () => {
    const r = detectChiffresHallucines(
      'CA 1500 €, food cost 30 €.',
      { kpis: { ca: 1500 }, fournisseurs: [{ montant: 30 }] }
    )
    expect(r).toEqual([])
  })

  it('inputs avec strings contenant nombres (ex: "1 200 €") parsés', () => {
    const r = detectChiffresHallucines(
      'CA 1200 €.',
      { ca_str: '1 200 €' }
    )
    expect(r).toEqual([])
  })

  it('réponse non-string → []', () => {
    expect(detectChiffresHallucines(null, {})).toEqual([])
    expect(detectChiffresHallucines(42, {})).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────
// rateLimit
// ─────────────────────────────────────────────────────────────────────

describe('rateLimit', () => {
  it('en dessous de la limite → ok=true', async () => {
    mocks.selectResult.count = 5
    const r = await rateLimit({ parametre_id: KROUSTY_ID, feature: 'brief' })
    expect(r.ok).toBe(true)
    expect(r.count).toBe(5)
    expect(r.limite).toBe(10)
  })

  it('au niveau de la limite → ok=false (≥ refusé)', async () => {
    mocks.selectResult.count = 10
    const r = await rateLimit({ parametre_id: KROUSTY_ID, feature: 'brief' })
    expect(r.ok).toBe(false)
    expect(r.count).toBe(10)
  })

  it('au-dessus de la limite → ok=false', async () => {
    mocks.selectResult.count = 50
    const r = await rateLimit({ parametre_id: KROUSTY_ID, feature: 'anomalie' })
    expect(r.ok).toBe(false)
  })

  it('feature inconnue → ok=false', async () => {
    const r = await rateLimit({ parametre_id: KROUSTY_ID, feature: 'inconnu' })
    expect(r.ok).toBe(false)
    expect(r.limite).toBe(0)
  })

  it('erreur Supabase → ok=false (refus par sécurité)', async () => {
    mocks.selectResult.error = new Error('db down')
    const r = await rateLimit({ parametre_id: KROUSTY_ID, feature: 'chat' })
    expect(r.ok).toBe(false)
  })

  it('limites par feature : brief=10, anomalie=50, insight=5, chat=30', () => {
    expect(_internal.RATE_LIMITS.brief).toBe(10)
    expect(_internal.RATE_LIMITS.anomalie).toBe(50)
    expect(_internal.RATE_LIMITS.insight).toBe(5)
    expect(_internal.RATE_LIMITS.chat).toBe(30)
  })
})

// ─────────────────────────────────────────────────────────────────────
// filtrerDomainesExclus
// ─────────────────────────────────────────────────────────────────────

describe('filtrerDomainesExclus', () => {
  it('réponse normale → exclu=false', () => {
    const r = filtrerDomainesExclus('Ton CA est en hausse cette semaine.')
    expect(r.exclu).toBe(false)
  })

  it('"licenciement" → exclu', () => {
    const r = filtrerDomainesExclus('Tu pourrais envisager un licenciement.')
    expect(r.exclu).toBe(true)
  })

  it('"licencier" → exclu', () => {
    const r = filtrerDomainesExclus('Pense à licencier ton équipier.')
    expect(r.exclu).toBe(true)
  })

  it('"droit du travail" → exclu', () => {
    const r = filtrerDomainesExclus('Vérifie le droit du travail avant.')
    expect(r.exclu).toBe(true)
  })

  it('"bail commercial" → exclu', () => {
    const r = filtrerDomainesExclus('Renégocie ton bail commercial.')
    expect(r.exclu).toBe(true)
  })

  it('"marketing digital" → exclu', () => {
    const r = filtrerDomainesExclus('Lance une stratégie de marketing digital.')
    expect(r.exclu).toBe(true)
  })

  it('"SEO" → exclu', () => {
    const r = filtrerDomainesExclus('Optimise ton SEO local.')
    expect(r.exclu).toBe(true)
  })

  it('"publicité" → exclu', () => {
    const r = filtrerDomainesExclus('Investis dans de la publicité.')
    expect(r.exclu).toBe(true)
  })

  it('réponse non-string → exclu=false', () => {
    expect(filtrerDomainesExclus(null).exclu).toBe(false)
    expect(filtrerDomainesExclus(undefined).exclu).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────
// validerSeuilsMinDonnees
// ─────────────────────────────────────────────────────────────────────

describe('validerSeuilsMinDonnees', () => {
  it('brief avec historique < 14 jours → ok=false', async () => {
    mocks.selectResult.count = 5
    const r = await validerSeuilsMinDonnees({ feature: 'brief', parametre_id: KROUSTY_ID })
    expect(r.ok).toBe(false)
    expect(r.raison).toBe('historique_insuffisant_brief')
  })

  it('brief avec historique ≥ 14 jours → ok=true', async () => {
    mocks.selectResult.count = 30
    const r = await validerSeuilsMinDonnees({ feature: 'brief', parametre_id: KROUSTY_ID })
    expect(r.ok).toBe(true)
  })

  it('anomalie sans fournisseur_nom → permissif (ok=true)', async () => {
    const r = await validerSeuilsMinDonnees({ feature: 'anomalie', parametre_id: KROUSTY_ID })
    expect(r.ok).toBe(true)
  })

  it('anomalie avec fournisseur < 6 transactions → ok=false', async () => {
    mocks.selectResult.count = 3
    const r = await validerSeuilsMinDonnees({
      feature: 'anomalie',
      parametre_id: KROUSTY_ID,
      fournisseur_nom: 'Boucherie'
    })
    expect(r.ok).toBe(false)
    expect(r.raison).toBe('historique_fournisseur_insuffisant')
  })

  it('anomalie avec fournisseur ≥ 6 transactions → ok=true', async () => {
    mocks.selectResult.count = 10
    const r = await validerSeuilsMinDonnees({
      feature: 'anomalie',
      parametre_id: KROUSTY_ID,
      fournisseur_nom: 'Boucherie'
    })
    expect(r.ok).toBe(true)
  })

  it('insight → ok=true (seuils gérés ailleurs)', async () => {
    const r = await validerSeuilsMinDonnees({ feature: 'insight', parametre_id: KROUSTY_ID })
    expect(r.ok).toBe(true)
  })

  it('chat → ok=true (pas de seuil V1)', async () => {
    const r = await validerSeuilsMinDonnees({ feature: 'chat', parametre_id: KROUSTY_ID })
    expect(r.ok).toBe(true)
  })
})
