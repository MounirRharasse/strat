import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  parametresData: { id: 'krousty', jours_fermes_semaine: [] },
  historiqueCaData: [],
  transactionsData: [],
  entreesData: [],
  audits_ignoresData: [],
  getAnalysesKPIsSpy: vi.fn(),
  auditerJournalSpy: vi.fn(() => ({ alertes: [] })),
  topFournisseursSpy: vi.fn(() => []),
  filtrer30jSpy: vi.fn((trans) => trans),
  decomposerChargesFixes30jSpy: vi.fn(() => ({ total: 5000 })),
  calculerSeuilSpy: vi.fn(() => ({
    etat: 'ok', seuilMensuel: 24000, seuilPeriode: 5600, margeBrute30j: 65
  }))
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table) => {
      const builder = {}
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn(() => builder)
      builder.gte = vi.fn(() => builder)
      builder.lte = vi.fn(() => builder)
      builder.lt = vi.fn(() => builder)
      builder.order = vi.fn(() => builder)
      builder.single = vi.fn(() => {
        if (table === 'parametres') return Promise.resolve({ data: mocks.parametresData, error: null })
        return Promise.resolve({ data: null, error: null })
      })
      const dataMap = {
        parametres: mocks.parametresData,
        historique_ca: mocks.historiqueCaData,
        transactions: mocks.transactionsData,
        entrees: mocks.entreesData,
        audits_ignores: mocks.audits_ignoresData
      }
      builder.then = (onF, onR) =>
        Promise.resolve({ data: dataMap[table] || [], error: null }).then(onF, onR)
      return builder
    })
  }
}))

vi.mock('@/lib/data/analyses-kpis', () => ({
  getAnalysesKPIs: mocks.getAnalysesKPIsSpy
}))
vi.mock('@/lib/audit-saisies', () => ({
  auditerJournal: mocks.auditerJournalSpy
}))
vi.mock('@/lib/seuil-rentabilite', () => ({
  filtrer30j: mocks.filtrer30jSpy,
  decomposerChargesFixes30j: mocks.decomposerChargesFixes30jSpy,
  calculerSeuil: mocks.calculerSeuilSpy
}))
vi.mock('@/lib/food-cost-decomposition', () => ({
  topFournisseursConsommations: mocks.topFournisseursSpy
}))

const {
  parseSemaineISO,
  getSemaineCourante,
  getSemainePrecedente,
  buildBriefInputs
} = await import('./brief-inputs.js')

const KROUSTY_ID = 'krousty'

function defaultKPIs(overrides = {}) {
  return {
    ca: { brut: 10000, ht: 9090, caisse: 7000, foxorder: 500, uber: 2500 },
    frequentation: { nbCommandes: 500 },
    panierMoyen: 20,
    foodCostP: 30,
    foodCostMode: 'estime',
    ...overrides
  }
}

beforeEach(() => {
  mocks.parametresData = { id: 'krousty', jours_fermes_semaine: [] }
  mocks.historiqueCaData = []
  mocks.transactionsData = []
  mocks.entreesData = []
  mocks.audits_ignoresData = []
  mocks.getAnalysesKPIsSpy.mockReset()
  mocks.getAnalysesKPIsSpy.mockResolvedValue(defaultKPIs())
  mocks.auditerJournalSpy.mockReset()
  mocks.auditerJournalSpy.mockReturnValue({ alertes: [] })
  mocks.topFournisseursSpy.mockReset()
  mocks.topFournisseursSpy.mockReturnValue([])
  mocks.calculerSeuilSpy.mockReset()
  mocks.calculerSeuilSpy.mockReturnValue({
    etat: 'ok', seuilMensuel: 24000, seuilPeriode: 5600, margeBrute30j: 65
  })
})

// ─────────────────────────────────────────────────────────────────────
// parseSemaineISO + helpers
// ─────────────────────────────────────────────────────────────────────

describe('parseSemaineISO', () => {
  it('1. "2026-W18" → since=2026-04-27 (lundi), until=2026-05-03 (dimanche)', () => {
    const r = parseSemaineISO('2026-W18')
    expect(r.since).toBe('2026-04-27')
    expect(r.until).toBe('2026-05-03')
    expect(r.annee).toBe(2026)
    expect(r.semaine).toBe(18)
    expect(r.label_humain).toContain('27 avril')
    expect(r.label_humain).toContain('3 mai')
  })

  it('2. format invalide → throw', () => {
    expect(() => parseSemaineISO('invalide')).toThrow()
    expect(() => parseSemaineISO('2026-18')).toThrow()
    expect(() => parseSemaineISO('')).toThrow()
  })
})

describe('getSemaineCourante / getSemainePrecedente', () => {
  it('3. getSemaineCourante(2026-04-28 mardi) → "2026-W18"', () => {
    const r = getSemaineCourante(new Date('2026-04-28T12:00:00'))
    expect(r).toBe('2026-W18')
  })

  it('4. getSemainePrecedente(2026-04-28 mardi) → "2026-W17"', () => {
    const r = getSemainePrecedente(new Date('2026-04-28T12:00:00'))
    expect(r).toBe('2026-W17')
  })
})

// ─────────────────────────────────────────────────────────────────────
// buildBriefInputs
// ─────────────────────────────────────────────────────────────────────

describe('buildBriefInputs — structure', () => {
  it('5. retourne les 10 sections attendues avec les bons types', async () => {
    const { inputs, periode } = await buildBriefInputs({
      parametre_id: KROUSTY_ID,
      semaine_iso: '2026-W18'
    })
    expect(inputs).toHaveProperty('semaine')
    expect(inputs).toHaveProperty('ca_semaine')
    expect(inputs).toHaveProperty('ca_par_canal')
    expect(inputs).toHaveProperty('ca_par_jour')
    expect(inputs).toHaveProperty('food_cost_semaine')
    expect(inputs).toHaveProperty('seuil_rentabilite')
    expect(inputs).toHaveProperty('top_fournisseurs')
    expect(inputs).toHaveProperty('anomalies_journal')
    expect(inputs).toHaveProperty('panier_moyen')
    expect(inputs).toHaveProperty('frequentation')
    expect(Array.isArray(inputs.ca_par_jour)).toBe(true)
    expect(inputs.ca_par_jour).toHaveLength(7)
    expect(periode.since).toBe('2026-04-27')
    expect(periode.until).toBe('2026-05-03')
  })

  it('6. ca_par_jour vs_meme_dow_4w : variation calculée vs moyenne 4 sem précédentes', async () => {
    // Lundi 27 avril 2026 = ca 1000. Lundis précédents (20, 13, 6 avril, 30 mars) = 900 chacun.
    // Moyenne 4w = 900. Variation = (1000-900)/900 = +11.1%
    mocks.historiqueCaData = [
      { date: '2026-04-27', ca_brut: 1000, uber: 0 }, // Lundi sem-0
      { date: '2026-04-20', ca_brut: 900, uber: 0 },  // Lundi sem-1
      { date: '2026-04-13', ca_brut: 900, uber: 0 },  // Lundi sem-2
      { date: '2026-04-06', ca_brut: 900, uber: 0 },  // Lundi sem-3
      { date: '2026-03-30', ca_brut: 900, uber: 0 }   // Lundi sem-4
    ]
    const { inputs } = await buildBriefInputs({
      parametre_id: KROUSTY_ID,
      semaine_iso: '2026-W18'
    })
    const lundi = inputs.ca_par_jour[0]
    expect(lundi.jour).toContain('lundi 27 avril')
    expect(lundi.ca).toBe(1000)
    expect(lundi.vs_meme_dow_4w).toBe('+11.1%')
  })

  it('7. top_fournisseurs : appelle topFournisseursConsommations(transSem, transPrec4w, 5)', async () => {
    mocks.transactionsData = [
      { date: '2026-04-27', fournisseur_nom: 'A', montant_ttc: 100, categorie_pl: 'consommations' },
      { date: '2026-04-20', fournisseur_nom: 'A', montant_ttc: 80, categorie_pl: 'consommations' },
      { date: '2026-04-26', fournisseur_nom: 'B', montant_ttc: 50, categorie_pl: 'consommations' }
    ]
    mocks.topFournisseursSpy.mockReturnValueOnce([
      { nom: 'A', actuel: 100, precedent: 320 },
      { nom: 'B', actuel: 50, precedent: 0 }
    ])
    const { inputs } = await buildBriefInputs({
      parametre_id: KROUSTY_ID,
      semaine_iso: '2026-W18'
    })
    expect(mocks.topFournisseursSpy).toHaveBeenCalled()
    const [transSem, transPrec, limit] = mocks.topFournisseursSpy.mock.calls[0]
    expect(limit).toBe(5)
    // transSem doit contenir uniquement les dates dans la semaine 27 avril → 3 mai
    expect(transSem.every(t => t.date >= '2026-04-27' && t.date <= '2026-05-03')).toBe(true)
    // transPrec : avant le 27 avril, jusqu'à 28 jours avant
    expect(transPrec.every(t => t.date < '2026-04-27')).toBe(true)
    expect(inputs.top_fournisseurs[0].nom).toBe('A')
    expect(inputs.top_fournisseurs[0].cumul_semaine).toBe(100)
  })

  it('8. anomalies_journal : limité à 5, joursFermesSemaine propagé depuis parametres', async () => {
    mocks.parametresData = { id: 'krousty', jours_fermes_semaine: ['dimanche', 'lundi'] }
    mocks.auditerJournalSpy.mockReturnValueOnce({
      alertes: Array.from({ length: 8 }, (_, i) => ({
        type: 'trou_canal', date: `2026-04-${27 + (i % 7)}`, criticite: 'orange', message: `alerte ${i}`
      }))
    })
    const { inputs } = await buildBriefInputs({
      parametre_id: KROUSTY_ID,
      semaine_iso: '2026-W18'
    })
    expect(inputs.anomalies_journal).toHaveLength(5)
    expect(mocks.auditerJournalSpy).toHaveBeenCalledOnce()
    const args = mocks.auditerJournalSpy.mock.calls[0][0]
    expect(args.joursFermesSemaine).toEqual(['dimanche', 'lundi'])
  })

  it('9. seuil_rentabilite : appelle getAnalysesKPIs sur [J-29, J] pour CA HT 30j réel', async () => {
    await buildBriefInputs({
      parametre_id: KROUSTY_ID,
      semaine_iso: '2026-W18'
    })
    // Au moins un appel doit avoir since = 2026-05-03 - 29j = 2026-04-04 et until = 2026-05-03
    const calls30j = mocks.getAnalysesKPIsSpy.mock.calls.filter(
      c => c[0].since === '2026-04-04' && c[0].until === '2026-05-03'
    )
    expect(calls30j.length).toBeGreaterThanOrEqual(1)
  })

  it('10. ca_par_canal : restaurant = caisse + foxorder, plateformes = uber', async () => {
    mocks.getAnalysesKPIsSpy.mockReset()
    mocks.getAnalysesKPIsSpy.mockResolvedValue(defaultKPIs({
      ca: { brut: 10000, ht: 9090, caisse: 7000, foxorder: 500, uber: 2500 }
    }))
    const { inputs } = await buildBriefInputs({
      parametre_id: KROUSTY_ID,
      semaine_iso: '2026-W18'
    })
    expect(inputs.ca_par_canal.restaurant).toBe(7500) // 7000 + 500
    expect(inputs.ca_par_canal.plateformes).toBe(2500)
  })

  it('11. food_cost_semaine.vs_sem_precedente_pts : delta absolu en points (pct sem-0 - pct sem-1)', async () => {
    // Sem-0 = 32%, sem-1 = 30% → delta = +2 points (pas une variation %)
    mocks.getAnalysesKPIsSpy.mockReset()
    mocks.getAnalysesKPIsSpy
      .mockResolvedValueOnce(defaultKPIs({ foodCostP: 32 })) // sem-0
      .mockResolvedValueOnce(defaultKPIs({ foodCostP: 30 })) // sem-1
      .mockResolvedValueOnce(defaultKPIs({ foodCostP: 30 })) // sem-2
      .mockResolvedValueOnce(defaultKPIs({ foodCostP: 30 })) // sem-3
      .mockResolvedValue(defaultKPIs())                       // 30j (seuil)
    const { inputs } = await buildBriefInputs({
      parametre_id: KROUSTY_ID,
      semaine_iso: '2026-W18'
    })
    expect(inputs.food_cost_semaine.pct).toBe(32)
    expect(inputs.food_cost_semaine.vs_sem_precedente_pts).toBe(2)
  })
})
