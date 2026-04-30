import { describe, it, expect } from 'vitest'
import {
  CATEGORIES_CHARGES_FIXES,
  filtrer30j,
  calculerSeuil,
  calculerProjection,
  computeStatutSeuil,
  decomposerChargesFixes30j,
  calculerCouverture6Mois
} from './seuil-rentabilite'

describe('CATEGORIES_CHARGES_FIXES', () => {
  it('inclut le personnel (correction du bug commit 1)', () => {
    expect(CATEGORIES_CHARGES_FIXES).toContain('frais_personnel')
    expect(CATEGORIES_CHARGES_FIXES).toContain('autres_charges_personnel')
    expect(CATEGORIES_CHARGES_FIXES).toContain('frais_deplacement')
  })

  it('exclut consommations (coûts variables)', () => {
    expect(CATEGORIES_CHARGES_FIXES).not.toContain('consommations')
  })
})

describe('filtrer30j', () => {
  it('garde les transactions dans la fenêtre 30j (today inclus, today-30j inclus)', () => {
    const ref = new Date('2026-04-30')
    const tx = [
      { date: '2026-04-30', montant_ht: 100 }, // today inclus
      { date: '2026-04-15', montant_ht: 200 }, // 15 jours avant
      { date: '2026-04-01', montant_ht: 50 },  // 29 jours avant
      { date: '2026-03-31', montant_ht: 80 },  // 30 jours avant — borne inclusive
      { date: '2026-03-30', montant_ht: 999 }  // 31 jours avant — hors fenêtre
    ]
    const r = filtrer30j(tx, ref)
    expect(r).toHaveLength(4)
    expect(r.map(t => t.montant_ht)).toEqual([100, 200, 50, 80])
  })

  it('null/undefined → []', () => {
    expect(filtrer30j(null, new Date())).toEqual([])
    expect(filtrer30j(undefined, new Date())).toEqual([])
  })
})

describe('calculerSeuil', () => {
  const periode30j = { filtreId: 'ce-mois', nbJours: 30 }

  it('cas standard : charges 2400 + marge 60% → seuilMensuel 4000', () => {
    const r = calculerSeuil({ chargesFixes30j: 2400, conso30j: 4000, caHT30j: 10000, periode: periode30j })
    expect(r.etat).toBe('ok')
    expect(r.seuilMensuel).toBe(4000)
    expect(r.margeBrute30j).toBe(60)
  })

  it('charges = 0 → donnees-insuffisantes', () => {
    const r = calculerSeuil({ chargesFixes30j: 0, conso30j: 0, caHT30j: 10000, periode: periode30j })
    expect(r.etat).toBe('donnees-insuffisantes')
    expect(r.seuilMensuel).toBeNull()
  })

  it('marge négative (conso > caHT) → marge-negative', () => {
    const r = calculerSeuil({ chargesFixes30j: 2400, conso30j: 12000, caHT30j: 10000, periode: periode30j })
    expect(r.etat).toBe('marge-negative')
    expect(r.seuilMensuel).toBeNull()
  })

  it('caHT 30j = 0 → marge-negative', () => {
    const r = calculerSeuil({ chargesFixes30j: 2400, conso30j: 0, caHT30j: 0, periode: periode30j })
    expect(r.etat).toBe('marge-negative')
  })

  it('prorata jour (nbJours=1) → seuilMensuel/30', () => {
    const r = calculerSeuil({
      chargesFixes30j: 2400, conso30j: 4000, caHT30j: 10000,
      periode: { filtreId: 'hier', nbJours: 1 }
    })
    expect(r.seuilPeriode).toBe(4000 / 30)
  })

  it('prorata semaine (nbJours=7)', () => {
    const r = calculerSeuil({
      chargesFixes30j: 2400, conso30j: 4000, caHT30j: 10000,
      periode: { filtreId: 'cette-semaine', nbJours: 7 }
    })
    expect(r.seuilPeriode).toBeCloseTo(4000 * 7 / 30, 5)
  })
})

describe('calculerProjection', () => {
  it('ce-mois jour 5 : caEffectif 1000 → projection extrapolée', () => {
    const ref = new Date('2026-04-05') // avril = 30 jours
    const r = calculerProjection({
      caEffectif: 1000,
      periode: { filtreId: 'ce-mois', nbJours: 5 },
      refDate: ref
    })
    expect(r).toBe(6000) // 1000/5 × 30
  })

  it('autres filtres → null', () => {
    expect(calculerProjection({
      caEffectif: 5000,
      periode: { filtreId: 'hier', nbJours: 1 },
      refDate: new Date('2026-04-30')
    })).toBeNull()

    expect(calculerProjection({
      caEffectif: 5000,
      periode: { filtreId: 'cette-annee', nbJours: 120 },
      refDate: new Date('2026-04-30')
    })).toBeNull()
  })

  it('caEffectif = 0 → null', () => {
    expect(calculerProjection({
      caEffectif: 0,
      periode: { filtreId: 'ce-mois', nbJours: 10 },
      refDate: new Date('2026-04-30')
    })).toBeNull()
  })

  it('jour 30/30 fin de mois → projection ≈ caEffectif', () => {
    const r = calculerProjection({
      caEffectif: 5000,
      periode: { filtreId: 'ce-mois', nbJours: 30 },
      refDate: new Date('2026-04-30')
    })
    expect(r).toBe(5000)
  })
})

describe('computeStatutSeuil', () => {
  it('vert (atteint sur la période)', () => {
    expect(computeStatutSeuil({
      filtreId: 'ce-mois',
      caEffectif: 5000, seuilPeriode: 3000,
      projectionFinMois: 7000, seuilMensuel: 4000,
      etat: 'ok'
    })).toBe('vert')
  })

  it('jaune (ce-mois : projection ≥ mensuel mais caEffectif < prorata)', () => {
    expect(computeStatutSeuil({
      filtreId: 'ce-mois',
      caEffectif: 1500, seuilPeriode: 2500,
      projectionFinMois: 4500, seuilMensuel: 4000,
      etat: 'ok'
    })).toBe('jaune')
  })

  it('rouge (ce-mois : projection < mensuel)', () => {
    expect(computeStatutSeuil({
      filtreId: 'ce-mois',
      caEffectif: 1000, seuilPeriode: 2500,
      projectionFinMois: 3000, seuilMensuel: 4000,
      etat: 'ok'
    })).toBe('rouge')
  })

  it('autres filtres : 2 états (vert/rouge), pas de jaune', () => {
    // Filtre = hier : pas de projection
    expect(computeStatutSeuil({
      filtreId: 'hier',
      caEffectif: 200, seuilPeriode: 130,
      projectionFinMois: null, seuilMensuel: 4000,
      etat: 'ok'
    })).toBe('vert')

    expect(computeStatutSeuil({
      filtreId: 'cette-semaine',
      caEffectif: 500, seuilPeriode: 900,
      projectionFinMois: null, seuilMensuel: 4000,
      etat: 'ok'
    })).toBe('rouge')
  })

  it('etat insuffisant remonté tel quel', () => {
    expect(computeStatutSeuil({ filtreId: 'ce-mois', etat: 'donnees-insuffisantes' })).toBe('donnees-insuffisantes')
    expect(computeStatutSeuil({ filtreId: 'ce-mois', etat: 'marge-negative' })).toBe('marge-negative')
  })
})

describe('decomposerChargesFixes30j', () => {
  it('Personnel regroupe 3 catégories DB', () => {
    const tx = [
      { categorie_pl: 'frais_personnel', montant_ht: 1000 },
      { categorie_pl: 'autres_charges_personnel', montant_ht: 200 },
      { categorie_pl: 'frais_deplacement', montant_ht: 100 },
      { categorie_pl: 'loyers_charges', montant_ht: 600 }
    ]
    const r = decomposerChargesFixes30j(tx)
    expect(r).toHaveLength(2)
    expect(r[0].macroLabel).toBe('Personnel')
    expect(r[0].total).toBe(1300)
    expect(r[0].count).toBe(3)
    expect(r[1].macroLabel).toBe('Loyer')
    expect(r[1].total).toBe(600)
  })

  it('exclut consommations (sécurité défensive)', () => {
    const tx = [
      { categorie_pl: 'consommations', montant_ht: 500 },
      { categorie_pl: 'energie', montant_ht: 100 }
    ]
    const r = decomposerChargesFixes30j(tx)
    expect(r).toHaveLength(1)
    expect(r[0].macroLabel).toBe('Énergie')
  })

  it('tri par total décroissant', () => {
    const tx = [
      { categorie_pl: 'energie', montant_ht: 100 },
      { categorie_pl: 'loyers_charges', montant_ht: 800 },
      { categorie_pl: 'honoraires', montant_ht: 300 }
    ]
    const r = decomposerChargesFixes30j(tx)
    expect(r.map(d => d.macroLabel)).toEqual(['Loyer', 'Honoraires', 'Énergie'])
  })

  it('pct calculés', () => {
    const tx = [
      { categorie_pl: 'loyers_charges', montant_ht: 800 },
      { categorie_pl: 'energie', montant_ht: 200 }
    ]
    const r = decomposerChargesFixes30j(tx)
    expect(r[0].pct).toBe(80)
    expect(r[1].pct).toBe(20)
  })

  it('vide → []', () => {
    expect(decomposerChargesFixes30j([])).toEqual([])
    expect(decomposerChargesFixes30j(null)).toEqual([])
  })
})

describe('calculerCouverture6Mois', () => {
  it('calcule la couverture mensuelle sur 6 mois', () => {
    const refDate = new Date('2026-04-30')
    const r = calculerCouverture6Mois({
      transactionsChargesFixes6Mois: [
        { date: '2026-04-15', montant_ht: 2000 },
        { date: '2026-03-15', montant_ht: 2500 }
      ],
      transactionsConso6Mois: [
        { date: '2026-04-15', montant_ht: 4000 },
        { date: '2026-03-15', montant_ht: 4500 }
      ],
      histCa6Mois: [
        { date: '2026-04-15', ca_ht: 10000 },
        { date: '2026-03-15', ca_ht: 12000 }
      ],
      refDate
    })
    expect(r).toHaveLength(6)
    const avril = r.find(m => m.mois === '2026-04')
    expect(avril.caHT).toBe(10000)
    expect(avril.conso).toBe(4000)
    expect(avril.charges).toBe(2000)
    // marge = (10000 - 4000) / 10000 = 60%
    // seuilMensuel = 2000 / 0.6 = 3333.33
    // couverture = 10000 / 3333.33 = 300%
    expect(avril.couverture).toBeCloseTo(300, 0)
  })

  it('mois sans données → couverture 0', () => {
    const r = calculerCouverture6Mois({
      transactionsChargesFixes6Mois: [],
      transactionsConso6Mois: [],
      histCa6Mois: [],
      refDate: new Date('2026-04-30')
    })
    expect(r).toHaveLength(6)
    expect(r.every(m => m.couverture === 0)).toBe(true)
  })
})
