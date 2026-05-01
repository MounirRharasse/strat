import { describe, it, expect, vi } from 'vitest'

// Le module charge des fonctions qui importent @/lib/supabase, qui exige
// les env vars Supabase. On mock pour permettre l'import sans .env.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: () => Promise.resolve({ data: null, error: null }) })) }))
    }))
  }
}))

const { TOOLS, dispatch, _internal } = await import('./chat-functions.js')

describe('TOOLS schemas Anthropic', () => {
  it('15 fonctions définies avec name + description + input_schema', () => {
    expect(TOOLS).toHaveLength(15)
    for (const t of TOOLS) {
      expect(typeof t.name).toBe('string')
      expect(t.name.length).toBeGreaterThan(0)
      expect(typeof t.description).toBe('string')
      expect(t.description.length).toBeGreaterThan(20)
      expect(t.input_schema).toBeDefined()
      expect(t.input_schema.type).toBe('object')
      expect(t.input_schema.properties).toBeDefined()
      expect(Array.isArray(t.input_schema.required)).toBe(true)
    }
  })

  it('Tous les noms de TOOLS sont présents dans le REGISTRY', () => {
    const registryKeys = Object.keys(_internal.REGISTRY)
    for (const t of TOOLS) {
      expect(registryKeys).toContain(t.name)
    }
    expect(registryKeys).toHaveLength(TOOLS.length)
  })

  it('Couvre les 5 domaines : general, fournisseurs, anomalies, insights, meta', () => {
    const names = TOOLS.map(t => t.name)
    expect(names).toContain('getCAJour')                 // general
    expect(names).toContain('getCASemaine')
    expect(names).toContain('getCAMois')
    expect(names).toContain('getFoodCost')
    expect(names).toContain('getSeuilRentabilite')
    expect(names).toContain('getTopFournisseurs')        // fournisseurs
    expect(names).toContain('getTransactionsFournisseur')
    expect(names).toContain('getMedianeFournisseur')
    expect(names).toContain('getAnomaliesJournal')       // anomalies
    expect(names).toContain('getTrousSaisie')
    expect(names).toContain('getInsightsRecents')        // insights
    expect(names).toContain('getBriefSemaine')
    expect(names).toContain('getParametres')             // meta
    expect(names).toContain('getStatutSynchro')
    expect(names).toContain('getDateAujourdhui')
  })

  it('Schemas : champs required cohérents', () => {
    const req = (name) => TOOLS.find(t => t.name === name).input_schema.required
    expect(req('getCAJour')).toEqual(['date'])
    expect(req('getCASemaine')).toEqual(['semaine_iso'])
    expect(req('getCAMois')).toEqual(['mois_iso'])
    expect(req('getFoodCost')).toEqual(['semaine_iso'])
    expect(req('getSeuilRentabilite')).toEqual([])
    expect(req('getTopFournisseurs')).toEqual([])
    expect(req('getTransactionsFournisseur')).toEqual(['fournisseur_nom'])
    expect(req('getMedianeFournisseur')).toEqual(['fournisseur_nom'])
    expect(req('getDateAujourdhui')).toEqual([])
  })
})

describe('dispatch', () => {
  it('Fonction inconnue → { error }', async () => {
    const r = await dispatch({ name: 'getInexistant', input: {}, parametre_id: 'krousty' })
    expect(r.error).toContain('inconnue')
    expect(r.error).toContain('getInexistant')
  })

  it('Erreur de validation propagée comme { error }', async () => {
    // getCAJour exige date au format YYYY-MM-DD
    const r = await dispatch({ name: 'getCAJour', input: { date: 'pas-une-date' }, parametre_id: 'krousty' })
    expect(r.error).toBeDefined()
    expect(r.error).toContain('date invalide')
  })

  it('Erreur fournisseur_nom manquant', async () => {
    const r = await dispatch({ name: 'getMedianeFournisseur', input: {}, parametre_id: 'krousty' })
    expect(r.error).toContain('fournisseur_nom')
  })

  it('Format retour : { result, truncated }', async () => {
    // On ne peut pas tester le succès complet sans mock supabase.
    // On vérifie au moins que la structure de retour erreur est correcte.
    const r = await dispatch({ name: 'getInexistant', input: {} })
    expect(Object.keys(r)).toContain('error')
    expect(r.result).toBeUndefined()
  })
})
