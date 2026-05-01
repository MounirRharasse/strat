import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  upsertSpy: vi.fn(() => Promise.resolve({ data: null, error: null })),
  cacheRow: null,
  callClaudeSpy: vi.fn(),
  buildAnomalieInputsSpy: vi.fn(),
  detectChiffresHallucinesSpy: vi.fn(),
  filtrerDomainesExclusSpy: vi.fn(),
  warnSpy: null
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => {
      const builder = {}
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn(() => builder)
      builder.maybeSingle = vi.fn(() => Promise.resolve({ data: mocks.cacheRow, error: null }))
      builder.upsert = mocks.upsertSpy
      return builder
    })
  }
}))

vi.mock('@/lib/ai', () => ({ callClaude: mocks.callClaudeSpy }))
vi.mock('@/lib/ia/garde-fous', () => ({
  detectChiffresHallucines: mocks.detectChiffresHallucinesSpy,
  filtrerDomainesExclus: mocks.filtrerDomainesExclusSpy
}))
vi.mock('@/lib/ia/anomalie-inputs', () => ({
  buildAnomalieInputs: mocks.buildAnomalieInputsSpy
}))

const { genererExplicationAnomalie, getExplicationCachee } = await import('./ia-anomalies.js')

const KROUSTY_ID = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'
const TX_ID = '11111111-2222-3333-4444-555555555555'

function makeInputs() {
  return {
    transaction: {
      date: '2026-04-21',
      fournisseur: 'Metro',
      categorie: 'consommations',
      montant_ttc: 1500.00,
      montant_ht: 1250.00
    },
    historique_fournisseur: {
      nb_achats: 6,
      mediane_ttc: 400,
      min_ttc: 350,
      max_ttc: 500,
      derniers_montants: [{ date: '2026-04-14', montant_ttc: 400 }]
    },
    ecart: { en_euros: 1100, en_pct: 275, direction: 'hausse' },
    contexte_categorie: { conso_hebdo_moyenne_4sem: 1800 }
  }
}

function setupSuccessPath() {
  mocks.buildAnomalieInputsSpy.mockResolvedValueOnce(makeInputs())
  mocks.callClaudeSpy.mockResolvedValueOnce({
    content: 'Le montant Metro de 1500 € est nettement au-dessus de la médiane (400 €).\n\nCela peut être un achat de stock anticipé.\n\nTu peux vérifier la facture.',
    tokens_input: 600,
    tokens_output: 200,
    cout_eur: 0.0015,
    model: 'claude-haiku-4-5-20251001',
    raw: {}
  })
  mocks.detectChiffresHallucinesSpy.mockReturnValueOnce([])
  mocks.filtrerDomainesExclusSpy.mockReturnValueOnce({ exclu: false })
}

beforeEach(() => {
  mocks.upsertSpy.mockClear()
  mocks.callClaudeSpy.mockReset()
  mocks.buildAnomalieInputsSpy.mockReset()
  mocks.detectChiffresHallucinesSpy.mockReset()
  mocks.filtrerDomainesExclusSpy.mockReset()
  mocks.cacheRow = null
  mocks.warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('genererExplicationAnomalie', () => {
  it('1. cache hit → contenu retourné depuis_cache=true, pas d\'appel Claude', async () => {
    mocks.cacheRow = {
      contenu: 'Explication cachée',
      created_at: '2026-04-30T10:00:00Z',
      expires_at: '2099-01-01T00:00:00Z'
    }
    const r = await genererExplicationAnomalie({ parametre_id: KROUSTY_ID, transaction_id: TX_ID })
    expect(r.contenu).toBe('Explication cachée')
    expect(r.depuis_cache).toBe(true)
    expect(mocks.callClaudeSpy).not.toHaveBeenCalled()
    expect(mocks.upsertSpy).not.toHaveBeenCalled()
  })

  it('2. cache miss → appel + UPSERT', async () => {
    mocks.cacheRow = null
    setupSuccessPath()
    const r = await genererExplicationAnomalie({ parametre_id: KROUSTY_ID, transaction_id: TX_ID })
    expect(r.depuis_cache).toBe(false)
    expect(r.contenu).toContain('Metro')
    expect(r.cout_eur).toBe(0.0015)
    expect(mocks.upsertSpy).toHaveBeenCalledTimes(1)
  })

  it('3. callClaude error → propage, pas d\'UPSERT', async () => {
    mocks.buildAnomalieInputsSpy.mockResolvedValueOnce(makeInputs())
    mocks.callClaudeSpy.mockResolvedValueOnce({ error: 'Anthropic 500', fallback_used: true })
    const r = await genererExplicationAnomalie({ parametre_id: KROUSTY_ID, transaction_id: TX_ID })
    expect(r.error).toContain('Anthropic 500')
    expect(r.fallback_used).toBe(true)
    expect(mocks.upsertSpy).not.toHaveBeenCalled()
  })

  it('4. hallucination détectée → erreur, pas d\'UPSERT, console.warn appelé', async () => {
    setupSuccessPath()
    mocks.detectChiffresHallucinesSpy.mockReset()
    mocks.detectChiffresHallucinesSpy.mockReturnValueOnce([9999])
    const r = await genererExplicationAnomalie({ parametre_id: KROUSTY_ID, transaction_id: TX_ID })
    expect(r.error).toBe('hallucination_detectee')
    expect(r.chiffres).toEqual([9999])
    expect(mocks.upsertSpy).not.toHaveBeenCalled()
    expect(mocks.warnSpy).toHaveBeenCalled()
  })

  it('5. domaine exclu → erreur, pas d\'UPSERT', async () => {
    setupSuccessPath()
    mocks.filtrerDomainesExclusSpy.mockReset()
    mocks.filtrerDomainesExclusSpy.mockReturnValueOnce({ exclu: true, pattern: '/licenci/' })
    const r = await genererExplicationAnomalie({ parametre_id: KROUSTY_ID, transaction_id: TX_ID })
    expect(r.error).toBe('domaine_exclu')
    expect(mocks.upsertSpy).not.toHaveBeenCalled()
  })

  it('6. historique insuffisant → erreur', async () => {
    mocks.buildAnomalieInputsSpy.mockRejectedValueOnce(new Error('historique_insuffisant'))
    const r = await genererExplicationAnomalie({ parametre_id: KROUSTY_ID, transaction_id: TX_ID })
    expect(r.error).toBe('historique_insuffisant')
    expect(mocks.callClaudeSpy).not.toHaveBeenCalled()
  })

  it('7. transaction introuvable → erreur', async () => {
    mocks.buildAnomalieInputsSpy.mockRejectedValueOnce(new Error('transaction_introuvable'))
    const r = await genererExplicationAnomalie({ parametre_id: KROUSTY_ID, transaction_id: TX_ID })
    expect(r.error).toBe('transaction_introuvable')
    expect(mocks.callClaudeSpy).not.toHaveBeenCalled()
  })

  it('8. UPSERT shape : indicateur, cle=transaction_id, modele, expires_at +30j, metadata', async () => {
    setupSuccessPath()
    await genererExplicationAnomalie({ parametre_id: KROUSTY_ID, transaction_id: TX_ID })
    const [row, opts] = mocks.upsertSpy.mock.calls[0]
    expect(row.parametre_id).toBe(KROUSTY_ID)
    expect(row.indicateur).toBe('anomalie_montant')
    expect(row.cle).toBe(TX_ID)
    expect(row.modele).toBe('claude-haiku-4-5-20251001')
    expect(row.tokens_input).toBe(600)
    expect(row.tokens_output).toBe(200)
    expect(row.cout_estime_eur).toBe(0.0015)
    expect(row.metadata.fournisseur).toBe('Metro')
    expect(row.metadata.montant_ttc).toBe(1500)
    expect(row.metadata.ecart_pct).toBe(275)
    const expires = new Date(row.expires_at).getTime()
    const created = new Date(row.created_at).getTime()
    const delta = expires - created
    expect(delta).toBeGreaterThan(29.9 * 86400_000)
    expect(delta).toBeLessThan(30.1 * 86400_000)
    expect(opts.onConflict).toBe('parametre_id,indicateur,cle')
  })
})

describe('getExplicationCachee', () => {
  it('9. cache expiré → null', async () => {
    mocks.cacheRow = {
      contenu: 'Vieille explication',
      created_at: '2025-01-01T00:00:00Z',
      expires_at: '2025-02-01T00:00:00Z'
    }
    const r = await getExplicationCachee({ parametre_id: KROUSTY_ID, transaction_id: TX_ID })
    expect(r).toBeNull()
  })
})
