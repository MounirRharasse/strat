import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  upsertSpy: vi.fn(() => Promise.resolve({ data: null, error: null })),
  cacheRow: null,                  // null = miss, sinon { contenu, created_at, expires_at }
  callClaudeSpy: vi.fn(),
  validerSeuilsMinDonneesSpy: vi.fn(),
  detectChiffresHallucinesSpy: vi.fn(),
  filtrerDomainesExclusSpy: vi.fn(),
  buildBriefInputsSpy: vi.fn(),
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
  validerSeuilsMinDonnees: mocks.validerSeuilsMinDonneesSpy,
  detectChiffresHallucines: mocks.detectChiffresHallucinesSpy,
  filtrerDomainesExclus: mocks.filtrerDomainesExclusSpy
}))
vi.mock('@/lib/ia/brief-inputs', () => ({
  buildBriefInputs: mocks.buildBriefInputsSpy,
  getSemaineCourante: vi.fn(() => '2026-W18'),
  getSemainePrecedente: vi.fn(() => '2026-W17')
}))

const KROUSTY_ID = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'
const SEMAINE_ISO = '2026-W17'

const { genererBriefSemaine, getBriefSemaine } = await import('./ia-brief.js')

// ─────────────────────────────────────────────────────────────────────
// Helpers de mock par défaut (succès)
// ─────────────────────────────────────────────────────────────────────

function makeInputs(overrides = {}) {
  return {
    inputs: {
      semaine: { iso: SEMAINE_ISO, date_debut: '2026-04-20', date_fin: '2026-04-26', label_humain: 'du 20 au 26 avril 2026' },
      ca_semaine: { brut: 12345.67, ht: 11223.34 },
      ...overrides
    },
    periode: { since: '2026-04-20', until: '2026-04-26', label_humain: 'du 20 au 26 avril 2026' }
  }
}

function setupSuccessPath() {
  mocks.validerSeuilsMinDonneesSpy.mockResolvedValueOnce({ ok: true })
  mocks.buildBriefInputsSpy.mockResolvedValueOnce(makeInputs())
  mocks.callClaudeSpy.mockResolvedValueOnce({
    content: '## Résumé\nBrief généré.\n## 3 points forts\n- 12345.67€\n',
    tokens_input: 800,
    tokens_output: 400,
    cout_eur: 0.0042,
    model: 'claude-sonnet-4-6',
    raw: {}
  })
  mocks.detectChiffresHallucinesSpy.mockReturnValueOnce([])
  mocks.filtrerDomainesExclusSpy.mockReturnValueOnce({ exclu: false })
}

beforeEach(() => {
  mocks.upsertSpy.mockClear()
  mocks.callClaudeSpy.mockReset()
  mocks.validerSeuilsMinDonneesSpy.mockReset()
  mocks.detectChiffresHallucinesSpy.mockReset()
  mocks.filtrerDomainesExclusSpy.mockReset()
  mocks.buildBriefInputsSpy.mockReset()
  mocks.cacheRow = null
  mocks.warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

// ─────────────────────────────────────────────────────────────────────
// genererBriefSemaine
// ─────────────────────────────────────────────────────────────────────

describe('genererBriefSemaine', () => {
  it('1. succès : retourne contenu/tokens/cout, UPSERT appelé', async () => {
    setupSuccessPath()
    const r = await genererBriefSemaine({ parametre_id: KROUSTY_ID, semaine_iso: SEMAINE_ISO })
    expect(r.error).toBeUndefined()
    expect(r.contenu).toContain('Brief généré')
    expect(r.tokens_input).toBe(800)
    expect(r.tokens_output).toBe(400)
    expect(r.cout_eur).toBe(0.0042)
    expect(r.semaine_iso).toBe(SEMAINE_ISO)
    expect(mocks.upsertSpy).toHaveBeenCalledTimes(1)
  })

  it('2. seuils insuffisants → erreur, pas d\'appel Claude', async () => {
    mocks.validerSeuilsMinDonneesSpy.mockResolvedValueOnce({ ok: false, raison: 'historique_insuffisant_brief' })
    const r = await genererBriefSemaine({ parametre_id: KROUSTY_ID, semaine_iso: SEMAINE_ISO })
    expect(r.error).toBe('historique_insuffisant_brief')
    expect(mocks.callClaudeSpy).not.toHaveBeenCalled()
    expect(mocks.upsertSpy).not.toHaveBeenCalled()
  })

  it('3. buildBriefInputs throw → { error: erreur_build_inputs, detail }', async () => {
    mocks.validerSeuilsMinDonneesSpy.mockResolvedValueOnce({ ok: true })
    mocks.buildBriefInputsSpy.mockRejectedValueOnce(new Error('table inexistante'))
    const r = await genererBriefSemaine({ parametre_id: KROUSTY_ID, semaine_iso: SEMAINE_ISO })
    expect(r.error).toBe('erreur_build_inputs')
    expect(r.detail).toContain('table inexistante')
    expect(mocks.callClaudeSpy).not.toHaveBeenCalled()
  })

  it('4. callClaude error → propage avec fallback_used, pas d\'UPSERT', async () => {
    mocks.validerSeuilsMinDonneesSpy.mockResolvedValueOnce({ ok: true })
    mocks.buildBriefInputsSpy.mockResolvedValueOnce(makeInputs())
    mocks.callClaudeSpy.mockResolvedValueOnce({ error: 'Anthropic 500', fallback_used: true })
    const r = await genererBriefSemaine({ parametre_id: KROUSTY_ID, semaine_iso: SEMAINE_ISO })
    expect(r.error).toContain('Anthropic 500')
    expect(r.fallback_used).toBe(true)
    expect(mocks.upsertSpy).not.toHaveBeenCalled()
  })

  it('5. hallucination détectée → erreur, pas d\'UPSERT, console.warn appelé', async () => {
    setupSuccessPath()
    mocks.detectChiffresHallucinesSpy.mockReset()
    mocks.detectChiffresHallucinesSpy.mockReturnValueOnce([9999])
    mocks.filtrerDomainesExclusSpy.mockReset()
    const r = await genererBriefSemaine({ parametre_id: KROUSTY_ID, semaine_iso: SEMAINE_ISO })
    expect(r.error).toBe('hallucination_detectee')
    expect(r.chiffres).toEqual([9999])
    expect(mocks.upsertSpy).not.toHaveBeenCalled()
    expect(mocks.warnSpy).toHaveBeenCalled()
  })

  it('6. domaine exclu détecté → erreur, pas d\'UPSERT', async () => {
    setupSuccessPath()
    mocks.filtrerDomainesExclusSpy.mockReset()
    mocks.filtrerDomainesExclusSpy.mockReturnValueOnce({ exclu: true, pattern: '/licenci/' })
    const r = await genererBriefSemaine({ parametre_id: KROUSTY_ID, semaine_iso: SEMAINE_ISO })
    expect(r.error).toBe('domaine_exclu')
    expect(mocks.upsertSpy).not.toHaveBeenCalled()
  })

  it('7. shape de la ligne UPSERT : champs et metadata corrects', async () => {
    setupSuccessPath()
    await genererBriefSemaine({ parametre_id: KROUSTY_ID, semaine_iso: SEMAINE_ISO })
    const [row, opts] = mocks.upsertSpy.mock.calls[0]
    expect(row.parametre_id).toBe(KROUSTY_ID)
    expect(row.indicateur).toBe('brief_semaine')
    expect(row.cle).toBe(SEMAINE_ISO)
    expect(row.modele).toBe('claude-sonnet-4-6')
    expect(row.tokens_input).toBe(800)
    expect(row.tokens_output).toBe(400)
    expect(row.cout_estime_eur).toBe(0.0042)
    expect(row.metadata.ca_brut).toBe(12345.67)
    expect(row.metadata.periode_since).toBe('2026-04-20')
    expect(row.metadata.periode_until).toBe('2026-04-26')
    // expires_at à +7 jours environ
    const expires = new Date(row.expires_at).getTime()
    const created = new Date(row.created_at).getTime()
    expect(expires - created).toBeGreaterThan(6.9 * 86400_000)
    expect(expires - created).toBeLessThan(7.1 * 86400_000)
    expect(opts.onConflict).toBe('parametre_id,indicateur,cle')
  })

  it('11. contexte_hash : string SHA256 tronquée à 16 chars', async () => {
    setupSuccessPath()
    await genererBriefSemaine({ parametre_id: KROUSTY_ID, semaine_iso: SEMAINE_ISO })
    const [row] = mocks.upsertSpy.mock.calls[0]
    expect(typeof row.contexte_hash).toBe('string')
    expect(row.contexte_hash).toMatch(/^[a-f0-9]{16}$/)
  })
})

// ─────────────────────────────────────────────────────────────────────
// getBriefSemaine
// ─────────────────────────────────────────────────────────────────────

describe('getBriefSemaine', () => {
  it('8. cache hit → retourne { contenu, semaine_iso, generee_le }', async () => {
    mocks.cacheRow = {
      contenu: 'Brief en cache',
      created_at: '2026-04-28T10:00:00Z',
      expires_at: '2099-01-01T00:00:00Z'
    }
    const r = await getBriefSemaine({ parametre_id: KROUSTY_ID, semaine_iso: SEMAINE_ISO })
    expect(r).not.toBeNull()
    expect(r.contenu).toBe('Brief en cache')
    expect(r.semaine_iso).toBe(SEMAINE_ISO)
    expect(r.generee_le).toBe('2026-04-28T10:00:00Z')
  })

  it('9. cache miss (data null) → null', async () => {
    mocks.cacheRow = null
    const r = await getBriefSemaine({ parametre_id: KROUSTY_ID, semaine_iso: SEMAINE_ISO })
    expect(r).toBeNull()
  })

  it('10. cache expiré (expires_at < now) → null', async () => {
    mocks.cacheRow = {
      contenu: 'Vieux brief',
      created_at: '2025-01-01T00:00:00Z',
      expires_at: '2025-01-08T00:00:00Z'
    }
    const r = await getBriefSemaine({ parametre_id: KROUSTY_ID, semaine_iso: SEMAINE_ISO })
    expect(r).toBeNull()
  })
})
