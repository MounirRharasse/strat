import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  insertSpy: vi.fn(),
  updateSpy: vi.fn(),
  selectSpy: vi.fn(),
  callClaudeSpy: vi.fn(),
  detecterSpy: vi.fn(),
  detectChiffresHallucinesSpy: vi.fn(),
  filtrerDomainesExclusSpy: vi.fn(),
  // état du store ia_signaux pour gérer INSERT idempotent + maybeSingle
  signauxRow: null,        // null = INSERT réussit. Sinon = row existante
  warnSpy: null
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => {
      const builder = {}
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn(() => builder)
      builder.update = vi.fn((row) => {
        mocks.updateSpy(row)
        builder._afterUpdate = true
        return builder
      })
      builder.insert = vi.fn((row) => {
        mocks.insertSpy(row)
        builder._afterInsert = true
        return builder
      })
      builder.single = vi.fn(() => {
        if (builder._afterInsert) {
          if (mocks.signauxRow) {
            return Promise.resolve({
              data: null,
              error: { message: 'duplicate key value violates unique constraint' }
            })
          }
          return Promise.resolve({
            data: { id: 'new-row-id', ia_contenu: null, traite_par_ia: false },
            error: null
          })
        }
        return Promise.resolve({ data: null, error: null })
      })
      builder.maybeSingle = vi.fn(() => {
        return Promise.resolve({ data: mocks.signauxRow, error: null })
      })
      return builder
    })
  }
}))

vi.mock('@/lib/ai', () => ({ callClaude: mocks.callClaudeSpy }))
vi.mock('@/lib/ia/garde-fous', () => ({
  detectChiffresHallucines: mocks.detectChiffresHallucinesSpy,
  filtrerDomainesExclus: mocks.filtrerDomainesExclusSpy
}))
vi.mock('@/lib/ia/insight-detection', () => ({
  detecterInsightDuJour: mocks.detecterSpy
}))

const { genererInsightDuJour, getInsightDuJour } = await import('./ia-insight.js')

const KROUSTY = 'krousty-uuid'
const DATE_REF = '2026-04-18'

function makeSignal() {
  return {
    type_trigger: 'drop_ca',
    tier: 'T1',
    magnitude: 47.04,
    contexte: {
      date_jour: '2026-04-17',
      jour_semaine: 'vendredi',
      ca_jour: 5539.59,
      moyenne_meme_dow_4w: 9396,
      variation_pct: -41.04,
      unite: 'pct'
    }
  }
}

function setupSuccessPath() {
  mocks.detecterSpy.mockResolvedValueOnce(makeSignal())
  mocks.callClaudeSpy.mockResolvedValueOnce({
    content: 'Ton CA vendredi a baissé de 41% vs 4 derniers vendredis.',
    tokens_input: 250,
    tokens_output: 80,
    cout_eur: 0.0006,
    model: 'claude-haiku-4-5-20251001'
  })
  mocks.detectChiffresHallucinesSpy.mockReturnValueOnce([])
  mocks.filtrerDomainesExclusSpy.mockReturnValueOnce({ exclu: false })
}

beforeEach(() => {
  mocks.insertSpy.mockClear()
  mocks.updateSpy.mockClear()
  mocks.callClaudeSpy.mockReset()
  mocks.detecterSpy.mockReset()
  mocks.detectChiffresHallucinesSpy.mockReset()
  mocks.filtrerDomainesExclusSpy.mockReset()
  mocks.signauxRow = null
  mocks.warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('genererInsightDuJour', () => {
  it('1. succès complet : INSERT + callClaude + UPDATE + return contenu', async () => {
    setupSuccessPath()
    const r = await genererInsightDuJour({ parametre_id: KROUSTY, date_ref: DATE_REF })
    expect(r.error).toBeUndefined()
    expect(r.contenu).toContain('vendredi')
    expect(r.cout_eur).toBe(0.0006)
    expect(mocks.insertSpy).toHaveBeenCalledTimes(1)
    expect(mocks.updateSpy).toHaveBeenCalledTimes(1)
    expect(mocks.callClaudeSpy).toHaveBeenCalledTimes(1)
  })

  it('2. detecter retourne null → skipped, pas d\'INSERT', async () => {
    mocks.detecterSpy.mockResolvedValueOnce(null)
    const r = await genererInsightDuJour({ parametre_id: KROUSTY, date_ref: DATE_REF })
    expect(r.skipped).toBe(true)
    expect(r.raison).toBe('aucun_trigger')
    expect(mocks.insertSpy).not.toHaveBeenCalled()
    expect(mocks.callClaudeSpy).not.toHaveBeenCalled()
  })

  it('3. existing row traite_par_ia=true → return depuis_cache, pas de callClaude', async () => {
    mocks.detecterSpy.mockResolvedValueOnce(makeSignal())
    mocks.signauxRow = {
      id: 'existing-id',
      ia_contenu: 'Insight déjà généré hier',
      traite_par_ia: true,
      type_trigger: 'drop_ca',
      magnitude: 47,
      ia_genere_le: '2026-04-18T06:01:00Z'
    }
    const r = await genererInsightDuJour({ parametre_id: KROUSTY, date_ref: DATE_REF })
    expect(r.depuis_cache).toBe(true)
    expect(r.contenu).toBe('Insight déjà généré hier')
    expect(mocks.callClaudeSpy).not.toHaveBeenCalled()
    expect(mocks.updateSpy).not.toHaveBeenCalled()
  })

  it('4. existing row traite_par_ia=false → continue, callClaude appelé, UPDATE', async () => {
    mocks.detecterSpy.mockResolvedValueOnce(makeSignal())
    mocks.signauxRow = {
      id: 'existing-id',
      ia_contenu: null,
      traite_par_ia: false,
      type_trigger: 'drop_ca'
    }
    mocks.callClaudeSpy.mockResolvedValueOnce({
      content: 'Réessai après échec hier',
      tokens_input: 200, tokens_output: 60, cout_eur: 0.0005,
      model: 'claude-haiku-4-5-20251001'
    })
    mocks.detectChiffresHallucinesSpy.mockReturnValueOnce([])
    mocks.filtrerDomainesExclusSpy.mockReturnValueOnce({ exclu: false })
    const r = await genererInsightDuJour({ parametre_id: KROUSTY, date_ref: DATE_REF })
    expect(r.contenu).toBe('Réessai après échec hier')
    expect(mocks.callClaudeSpy).toHaveBeenCalledTimes(1)
    expect(mocks.updateSpy).toHaveBeenCalledTimes(1)
  })

  it('5. callClaude error → propage, ia_contenu reste null, traite_par_ia=false', async () => {
    mocks.detecterSpy.mockResolvedValueOnce(makeSignal())
    mocks.callClaudeSpy.mockResolvedValueOnce({ error: 'Anthropic 500', fallback_used: true })
    const r = await genererInsightDuJour({ parametre_id: KROUSTY, date_ref: DATE_REF })
    expect(r.error).toContain('Anthropic 500')
    expect(r.signal_inserted).toBe(true)
    expect(mocks.insertSpy).toHaveBeenCalledTimes(1)
    expect(mocks.updateSpy).not.toHaveBeenCalled()
  })

  it('6. hallucination détectée → log warn, pas d\'UPDATE', async () => {
    setupSuccessPath()
    mocks.detectChiffresHallucinesSpy.mockReset()
    mocks.detectChiffresHallucinesSpy.mockReturnValueOnce([9999])
    const r = await genererInsightDuJour({ parametre_id: KROUSTY, date_ref: DATE_REF })
    expect(r.error).toBe('hallucination_detectee')
    expect(r.chiffres).toEqual([9999])
    expect(mocks.updateSpy).not.toHaveBeenCalled()
    expect(mocks.warnSpy).toHaveBeenCalled()
  })

  it('7. domaine exclu → log warn, pas d\'UPDATE', async () => {
    setupSuccessPath()
    mocks.filtrerDomainesExclusSpy.mockReset()
    mocks.filtrerDomainesExclusSpy.mockReturnValueOnce({ exclu: true, pattern: '/licenci/' })
    const r = await genererInsightDuJour({ parametre_id: KROUSTY, date_ref: DATE_REF })
    expect(r.error).toBe('domaine_exclu')
    expect(mocks.updateSpy).not.toHaveBeenCalled()
  })

  it('10. shape de l\'UPDATE : ia_modele, ia_cout_eur, traite_par_ia=true', async () => {
    setupSuccessPath()
    await genererInsightDuJour({ parametre_id: KROUSTY, date_ref: DATE_REF })
    const updatedRow = mocks.updateSpy.mock.calls[0][0]
    expect(updatedRow.ia_modele).toBe('claude-haiku-4-5-20251001')
    expect(updatedRow.ia_cout_eur).toBe(0.0006)
    expect(updatedRow.traite_par_ia).toBe(true)
    expect(updatedRow.ia_genere_le).toBeDefined()
    expect(typeof updatedRow.ia_contenu).toBe('string')
  })
})

describe('getInsightDuJour', () => {
  it('8. cache hit (traite_par_ia=true) → return contenu', async () => {
    mocks.signauxRow = {
      ia_contenu: 'Contenu en cache',
      type_trigger: 'drop_ca',
      magnitude: 47,
      ia_genere_le: '2026-04-18T06:00:00Z'
    }
    const r = await getInsightDuJour({ parametre_id: KROUSTY, date_ref: DATE_REF })
    expect(r).not.toBeNull()
    expect(r.contenu).toBe('Contenu en cache')
    expect(r.signal_type).toBe('drop_ca')
  })

  it('9. cache miss (pas de row) → null', async () => {
    mocks.signauxRow = null
    const r = await getInsightDuJour({ parametre_id: KROUSTY, date_ref: DATE_REF })
    expect(r).toBeNull()
  })

  it('9b. row sans ia_contenu (signal détecté mais Haiku échoué) → null', async () => {
    mocks.signauxRow = {
      ia_contenu: null,
      type_trigger: 'drop_ca'
    }
    const r = await getInsightDuJour({ parametre_id: KROUSTY, date_ref: DATE_REF })
    expect(r).toBeNull()
  })
})
