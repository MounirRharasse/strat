import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  parametres: {
    id: 'krousty',
    jours_fermes_semaine: [],
    seuil_insight_spike_ca_pct: 25,
    seuil_insight_drop_ca_pct: 25,
    seuil_insight_fournisseur_hausse_pct: 30,
    alerte_food_cost_max: 32,
    insight_cooldown_jours: 2
  },
  caJourMap: {},          // dateISO → CA total (hist + entrees uber)
  transactionsData: [],   // pour fournisseur_hausse + transition seuil
  histMoisData: [],       // pour transition seuil (ca_brut par date)
  hist30jData: [],        // pour transition seuil (ca_ht par date)
  signauxData: [],        // pour cooldown (ia_signaux)
  getAnalysesKPIsSpy: vi.fn(),
  calculerSeuilSpy: vi.fn(),
  filtrer30jSpy: vi.fn((trans) => trans),
  decomposerChargesFixes30jSpy: vi.fn(() => ({ total: 5000 }))
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table) => {
      const builder = { _filters: { table, eq: {}, gte: null, lte: null } }
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn((col, val) => { builder._filters.eq[col] = val; return builder })
      builder.gte = vi.fn((col, val) => { builder._filters.gte = { col, val }; return builder })
      builder.lte = vi.fn((col, val) => { builder._filters.lte = { col, val }; return builder })
      builder.order = vi.fn(() => builder)
      builder.single = vi.fn(() => {
        if (table === 'parametres') return Promise.resolve({ data: mocks.parametres, error: null })
        return Promise.resolve({ data: null, error: null })
      })
      builder.limit = vi.fn(() => builder)
      builder.maybeSingle = vi.fn(() => {
        if (table === 'ia_signaux') {
          const eq = builder._filters.eq
          const since = builder._filters.gte?.val
          const until = builder._filters.lte?.val
          const matching = (mocks.signauxData || []).find(s =>
            (!eq.parametre_id || s.parametre_id === eq.parametre_id) &&
            (!eq.type_trigger || s.type_trigger === eq.type_trigger) &&
            (!since || s.date_detection >= since) &&
            (!until || s.date_detection <= until)
          )
          return Promise.resolve({ data: matching || null, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      })
      builder.then = (onF, onR) => {
        let data = []
        if (table === 'historique_ca') {
          // Distinguer les 2 modes : eq('date') pour getCAJour, vs gte/lte pour transitions
          if (builder._filters.eq.date) {
            const v = mocks.caJourMap[builder._filters.eq.date]
            if (v != null) data = [{ ca_brut: v.ca_brut || v, uber: v.uber || 0, ca_ht: v.ca_ht || 0 }]
          } else if (builder._filters.gte) {
            // Soit hist30jData (ca_ht), soit histMoisData (ca_brut)
            // On distingue via la présence de ca_brut vs ca_ht dans le select.
            // Simplification : on retourne tout, le code filtrera.
            const since = builder._filters.gte.val
            const until = builder._filters.lte?.val
            const all = [...mocks.hist30jData, ...mocks.histMoisData]
            data = all.filter(r => r.date >= since && (until == null || r.date <= until))
          }
        } else if (table === 'entrees') {
          const date = builder._filters.eq.date
          if (date) {
            const v = mocks.caJourMap[date]
            if (v?.entree_uber) data = [{ montant_ttc: v.entree_uber }]
          }
        } else if (table === 'transactions') {
          const since = builder._filters.gte?.val
          const until = builder._filters.lte?.val
          data = mocks.transactionsData.filter(t =>
            (!since || t.date >= since) && (!until || t.date <= until)
          )
        }
        return Promise.resolve({ data, error: null }).then(onF, onR)
      }
      return builder
    })
  }
}))

vi.mock('@/lib/data/analyses-kpis', () => ({
  getAnalysesKPIs: mocks.getAnalysesKPIsSpy
}))

vi.mock('@/lib/seuil-rentabilite', () => ({
  calculerSeuil: mocks.calculerSeuilSpy,
  filtrer30j: mocks.filtrer30jSpy,
  decomposerChargesFixes30j: mocks.decomposerChargesFixes30jSpy
}))

const {
  detecterInsightDuJour,
  evaluerDropOuSpikeCA,
  evaluerFoodCostSpike,
  evaluerFournisseurHausse,
  evaluerTransitionSeuil
} = await import('./insight-detection.js')

const KROUSTY = 'krousty'

beforeEach(() => {
  mocks.parametres = {
    id: 'krousty',
    jours_fermes_semaine: [],
    seuil_insight_spike_ca_pct: 25,
    seuil_insight_drop_ca_pct: 25,
    seuil_insight_fournisseur_hausse_pct: 30,
    alerte_food_cost_max: 32,
    insight_cooldown_jours: 2
  }
  mocks.caJourMap = {}
  mocks.transactionsData = []
  mocks.histMoisData = []
  mocks.hist30jData = []
  mocks.signauxData = []
  mocks.getAnalysesKPIsSpy.mockReset()
  mocks.calculerSeuilSpy.mockReset()
  mocks.calculerSeuilSpy.mockReturnValue({
    etat: 'ok', seuilMensuel: 24000, seuilPeriode: 24000, margeBrute30j: 65, chargesFixes30j: 15600
  })
})

const P = mocks.parametres

// ─────────────────────────────────────────────────────────────────────
// evaluerDropOuSpikeCA
// ─────────────────────────────────────────────────────────────────────

describe('evaluerDropOuSpikeCA', () => {
  it('1. drop -30% → drop_ca, T1', async () => {
    // dateEval = 2026-04-30 (jeudi)
    mocks.caJourMap['2026-04-30'] = { ca_brut: 700 }
    mocks.caJourMap['2026-04-23'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-16'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-09'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-02'] = { ca_brut: 1000 }
    const r = await evaluerDropOuSpikeCA({ parametre_id: KROUSTY, date_ref: '2026-05-01', parametres: mocks.parametres })
    expect(r).not.toBeNull()
    expect(r.type_trigger).toBe('drop_ca')
    expect(r.tier).toBe('T1')
    expect(r.magnitude).toBe(30)
    expect(r.contexte.unite).toBe('pct')
    expect(r.contexte.jour_semaine).toBe('jeudi')
  })

  it('2. spike +35% → spike_ca, T4', async () => {
    mocks.caJourMap['2026-04-30'] = { ca_brut: 1350 }
    mocks.caJourMap['2026-04-23'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-16'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-09'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-02'] = { ca_brut: 1000 }
    const r = await evaluerDropOuSpikeCA({ parametre_id: KROUSTY, date_ref: '2026-05-01', parametres: mocks.parametres })
    expect(r.type_trigger).toBe('spike_ca')
    expect(r.tier).toBe('T4')
    expect(r.magnitude).toBe(35)
  })

  it('3. variation -10% < seuil 25 → null', async () => {
    mocks.caJourMap['2026-04-30'] = { ca_brut: 900 }
    mocks.caJourMap['2026-04-23'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-16'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-09'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-02'] = { ca_brut: 1000 }
    const r = await evaluerDropOuSpikeCA({ parametre_id: KROUSTY, date_ref: '2026-05-01', parametres: mocks.parametres })
    expect(r).toBeNull()
  })

  it('4. jour fermé hier → null (pas d\'anomalie)', async () => {
    const params = { ...mocks.parametres, jours_fermes_semaine: ['jeudi'] }
    mocks.caJourMap['2026-04-30'] = { ca_brut: 0 }
    const r = await evaluerDropOuSpikeCA({ parametre_id: KROUSTY, date_ref: '2026-05-01', parametres: params })
    expect(r).toBeNull()
  })

  it('5. hier absent dans historique_ca → null', async () => {
    // caJourMap vide → CA d'hier = null
    mocks.caJourMap['2026-04-23'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-16'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-09'] = { ca_brut: 1000 }
    const r = await evaluerDropOuSpikeCA({ parametre_id: KROUSTY, date_ref: '2026-05-01', parametres: mocks.parametres })
    expect(r).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────
// evaluerFoodCostSpike
// ─────────────────────────────────────────────────────────────────────

describe('evaluerFoodCostSpike', () => {
  it('6. food cost 35% > 32% seuil → food_cost_spike, T1', async () => {
    mocks.getAnalysesKPIsSpy.mockResolvedValueOnce({ foodCostP: 35, foodCostMode: 'estime' })
    const r = await evaluerFoodCostSpike({ parametre_id: KROUSTY, date_ref: '2026-05-04', parametres: mocks.parametres })
    expect(r.type_trigger).toBe('food_cost_spike')
    expect(r.tier).toBe('T1')
    expect(r.magnitude).toBe(3)
    expect(r.contexte.unite).toBe('pts')
    expect(r.contexte.delta_vs_seuil_pts).toBe(3)
  })

  it('7. food cost 30% < 32% → null', async () => {
    mocks.getAnalysesKPIsSpy.mockResolvedValueOnce({ foodCostP: 30, foodCostMode: 'estime' })
    const r = await evaluerFoodCostSpike({ parametre_id: KROUSTY, date_ref: '2026-05-04', parametres: mocks.parametres })
    expect(r).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────
// evaluerFournisseurHausse
// ─────────────────────────────────────────────────────────────────────

describe('evaluerFournisseurHausse', () => {
  it('8. Boucherie +60% (3+ achats baseline) → fournisseur_hausse, T3', async () => {
    // 7j window = [2026-04-24, 2026-04-30], baseline = [2026-03-27, 2026-04-23]
    mocks.transactionsData = [
      // Sem actuelle (2 achats, total 800)
      { date: '2026-04-25', fournisseur_nom: 'Boucherie', montant_ttc: 400 },
      { date: '2026-04-28', fournisseur_nom: 'Boucherie', montant_ttc: 400 },
      // Baseline 4 sem prec (4 achats dans [2026-03-27, 2026-04-23], total 2000 → moy hebdo 500)
      { date: '2026-04-22', fournisseur_nom: 'Boucherie', montant_ttc: 500 },
      { date: '2026-04-15', fournisseur_nom: 'Boucherie', montant_ttc: 500 },
      { date: '2026-04-08', fournisseur_nom: 'Boucherie', montant_ttc: 500 },
      { date: '2026-04-01', fournisseur_nom: 'Boucherie', montant_ttc: 500 }
    ]
    const r = await evaluerFournisseurHausse({ parametre_id: KROUSTY, date_ref: '2026-05-01', parametres: mocks.parametres })
    expect(r).not.toBeNull()
    expect(r.type_trigger).toBe('fournisseur_hausse')
    expect(r.tier).toBe('T3')
    expect(r.contexte.fournisseur_nom).toBe('Boucherie')
    expect(r.contexte.cumul_7j).toBe(800)
    expect(r.contexte.moyenne_hebdo_4w_prec).toBe(500)
    expect(r.magnitude).toBe(60)
  })

  it('9. aucun fournisseur > 30% → null', async () => {
    // sem 500 vs moy hebdo baseline 500 → variation 0%
    mocks.transactionsData = [
      { date: '2026-04-25', fournisseur_nom: 'Metro', montant_ttc: 500 },  // sem
      { date: '2026-04-22', fournisseur_nom: 'Metro', montant_ttc: 500 },  // baseline
      { date: '2026-04-15', fournisseur_nom: 'Metro', montant_ttc: 500 },  // baseline
      { date: '2026-04-08', fournisseur_nom: 'Metro', montant_ttc: 500 },  // baseline
      { date: '2026-04-01', fournisseur_nom: 'Metro', montant_ttc: 500 }   // baseline
    ]
    const r = await evaluerFournisseurHausse({ parametre_id: KROUSTY, date_ref: '2026-05-01', parametres: mocks.parametres })
    expect(r).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────
// evaluerTransitionSeuil
// ─────────────────────────────────────────────────────────────────────

describe('evaluerTransitionSeuil', () => {
  it('10. bascule positive (J-1 < seuil, J ≥ seuil) → seuil_atteint, T4', async () => {
    // dateEval = 2026-04-29 (mardi 29 avril, jour 29 du mois)
    // jours total avril = 30, joursEcoules J = 29, J-1 = 28
    // seuil mensuel = 24000
    // Pour bascule + : projection J ≥ 24000, projection J-1 < 24000
    // CA cumul J = 24000 → projection = 24000 / 29 * 30 = 24827 ≥ 24000 ✓
    // CA cumul J-1 = 22500 → projection = 22500 / 28 * 30 = 24107 ≥ 24000 ❌
    // Ajuste : CA cumul J-1 = 22000 → projection = 22000/28*30 = 23571 < 24000 ✓
    mocks.histMoisData = [
      { date: '2026-04-01', ca_brut: 0 }, // padding
      // simule CA cumulé
      ...Array.from({ length: 28 }, (_, i) => ({
        date: `2026-04-${String(i + 1).padStart(2, '0')}`,
        ca_brut: 22000 / 28
      })),
      { date: '2026-04-29', ca_brut: 2000 } // CA du J = 2000 → cumul J = 22000 + 2000 = 24000
    ]
    mocks.hist30jData = []
    mocks.transactionsData = []
    const r = await evaluerTransitionSeuil({ parametre_id: KROUSTY, date_ref: '2026-04-30', parametres: mocks.parametres })
    expect(r).not.toBeNull()
    expect(r.type_trigger).toBe('seuil_atteint')
    expect(r.tier).toBe('T4')
    expect(r.contexte.unite).toBe('eur')
  })

  it('11. bascule négative (J-1 ≥ seuil, J < seuil) → seuil_decroche, T2', async () => {
    // J cumul plus bas → projection passe sous seuil
    mocks.histMoisData = [
      ...Array.from({ length: 28 }, (_, i) => ({
        date: `2026-04-${String(i + 1).padStart(2, '0')}`,
        ca_brut: 24000 / 28 // cumul J-1 = 24000 → projection = 24000/28*30 = 25714 ≥ 24000
      })),
      { date: '2026-04-29', ca_brut: 0 } // pas de CA aujourd'hui
      // cumul J = 24000 → projection = 24000/29*30 = 24827, encore ≥
    ]
    // Pour vraiment décrocher, il faut J-1 ≥ seuil ET J < seuil.
    // Augmentons le déficit : cumul J-1 = 23500 → 23500/28*30 = 25178 ≥ 24000
    // Pour J : on veut projection < 24000 → cumul J / 29 * 30 < 24000 → cumul J < 23200
    // Si cumul J-1 = 23500 et CA jour J = -500 (impossible) → on ne peut pas décrocher en 1 jour avec ce setup.
    //
    // Ajustement : on simule mauvaise journée + correction antérieure.
    // J-1 cumul = 24500 → projection = 24500/28*30 = 26250 ≥
    // J cumul = 23000 (correction = -1500) → projection = 23000/29*30 = 23793 < 24000 ✓
    mocks.histMoisData = [
      ...Array.from({ length: 28 }, (_, i) => ({
        date: `2026-04-${String(i + 1).padStart(2, '0')}`,
        ca_brut: 24500 / 28
      })),
      { date: '2026-04-29', ca_brut: -1500 }
    ]
    const r = await evaluerTransitionSeuil({ parametre_id: KROUSTY, date_ref: '2026-04-30', parametres: mocks.parametres })
    expect(r).not.toBeNull()
    expect(r.type_trigger).toBe('seuil_decroche')
    expect(r.tier).toBe('T2')
  })

  it('12. pas de bascule → null', async () => {
    mocks.histMoisData = [
      ...Array.from({ length: 28 }, (_, i) => ({
        date: `2026-04-${String(i + 1).padStart(2, '0')}`,
        ca_brut: 30000 / 28 // bien au-dessus du seuil
      })),
      { date: '2026-04-29', ca_brut: 30000 / 28 }
    ]
    const r = await evaluerTransitionSeuil({ parametre_id: KROUSTY, date_ref: '2026-04-30', parametres: mocks.parametres })
    expect(r).toBeNull()
  })

  it('13. premier jour du mois (dateEval = 2 mai) → null (skip)', async () => {
    // dateEval = date_ref - 1 = 2026-05-02. 2 du mois → skip
    const r = await evaluerTransitionSeuil({ parametre_id: KROUSTY, date_ref: '2026-05-03', parametres: mocks.parametres })
    expect(r).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────
// detecterInsightDuJour : tie-break + cas null
// ─────────────────────────────────────────────────────────────────────

describe('detecterInsightDuJour', () => {
  it('14. aucun trigger actif → null', async () => {
    // Données neutres : pas de drop, pas de food cost spike, pas de fournisseur, pas de transition
    mocks.caJourMap['2026-04-30'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-23'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-16'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-09'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-02'] = { ca_brut: 1000 }
    mocks.getAnalysesKPIsSpy.mockResolvedValue({ foodCostP: 30, foodCostMode: 'estime' })
    const r = await detecterInsightDuJour({ parametre_id: KROUSTY, date_ref: '2026-05-01' })
    expect(r).toBeNull()
  })

  it('15. tie-break T1 limite : drop -25.1% vs food cost +3pts → drop gagne (intra-tier #2 > #3)', async () => {
    // Drop CA -25.1% (juste au-dessus du seuil 25)
    mocks.caJourMap['2026-04-30'] = { ca_brut: 749 }   // -25.1% vs 1000
    mocks.caJourMap['2026-04-23'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-16'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-09'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-02'] = { ca_brut: 1000 }
    // Food cost spike +3pts (35% > 32% seuil)
    mocks.getAnalysesKPIsSpy.mockResolvedValue({ foodCostP: 35, foodCostMode: 'estime' })
    const r = await detecterInsightDuJour({ parametre_id: KROUSTY, date_ref: '2026-05-01' })
    expect(r).not.toBeNull()
    // Intra-tier T1 : drop_ca passe avant food_cost_spike
    expect(r.type_trigger).toBe('drop_ca')
    expect(r.tier).toBe('T1')
  })

  it('16. cooldown global : signal QUELCONQUE à J-1 → null (cross-type)', async () => {
    // Setup : drop_ca ET food_cost_spike actifs aujourd'hui
    mocks.caJourMap['2026-04-30'] = { ca_brut: 700 }
    mocks.caJourMap['2026-04-23'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-16'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-09'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-02'] = { ca_brut: 1000 }
    mocks.getAnalysesKPIsSpy.mockResolvedValue({ foodCostP: 35, foodCostMode: 'estime' })
    // food_cost_spike retenu hier → cooldown global → drop_ca aussi bloqué
    mocks.signauxData = [
      { parametre_id: KROUSTY, type_trigger: 'food_cost_spike', date_detection: '2026-04-30' }
    ]
    const r = await detecterInsightDuJour({ parametre_id: KROUSTY, date_ref: '2026-05-01' })
    expect(r).toBeNull()
  })

  it('17. cooldown expiré : signal à J-3 (N=2) → trigger autorisé', async () => {
    mocks.caJourMap['2026-04-30'] = { ca_brut: 700 }
    mocks.caJourMap['2026-04-23'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-16'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-09'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-02'] = { ca_brut: 1000 }
    // signal retenu il y a 3 jours → hors cooldown (N=2)
    mocks.signauxData = [
      { parametre_id: KROUSTY, type_trigger: 'drop_ca', date_detection: '2026-04-28' }
    ]
    const r = await detecterInsightDuJour({ parametre_id: KROUSTY, date_ref: '2026-05-01' })
    expect(r).not.toBeNull()
    expect(r.type_trigger).toBe('drop_ca')
  })

  it('18. cooldown_jours custom (5) lu depuis parametres → signal à J-4 toujours en cooldown', async () => {
    mocks.parametres.insight_cooldown_jours = 5
    mocks.caJourMap['2026-04-30'] = { ca_brut: 700 }
    mocks.caJourMap['2026-04-23'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-16'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-09'] = { ca_brut: 1000 }
    mocks.caJourMap['2026-04-02'] = { ca_brut: 1000 }
    // Signal à J-4 : avec cooldown=5, [J-5, J-1] inclut J-4 → cooldown actif
    mocks.signauxData = [
      { parametre_id: KROUSTY, type_trigger: 'drop_ca', date_detection: '2026-04-27' }
    ]
    const r = await detecterInsightDuJour({ parametre_id: KROUSTY, date_ref: '2026-05-01' })
    expect(r).toBeNull()
  })
})
