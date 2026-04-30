import { describe, it, expect } from 'vitest'
import { getLabelVariation } from './dashboard-comparaison'

describe('getLabelVariation', () => {
  it('hier → "vs même jour S-1"', () => {
    expect(getLabelVariation({ filtreId: 'hier' })).toBe('vs même jour S-1')
  })

  it('aujourdhui → "vs même jour S-1"', () => {
    expect(getLabelVariation({ filtreId: 'aujourdhui' })).toBe('vs même jour S-1')
  })

  it('cette-semaine → "vs sem-1"', () => {
    expect(getLabelVariation({ filtreId: 'cette-semaine' })).toBe('vs sem-1')
  })

  it('semaine-derniere → "vs S-2"', () => {
    expect(getLabelVariation({ filtreId: 'semaine-derniere' })).toBe('vs S-2')
  })

  it('ce-mois avec nbJours → "vs mois dernier (à JX)"', () => {
    expect(getLabelVariation({ filtreId: 'ce-mois', nbJours: 29 })).toBe('vs mois dernier (à J29)')
  })

  it('ce-mois sans nbJours → fallback "?"', () => {
    expect(getLabelVariation({ filtreId: 'ce-mois' })).toBe('vs mois dernier (à J?)')
  })

  it('mois-dernier → "vs M-2"', () => {
    expect(getLabelVariation({ filtreId: 'mois-dernier' })).toBe('vs M-2')
  })

  it('derniers-30-jours → "vs 30 jours d\'avant"', () => {
    expect(getLabelVariation({ filtreId: 'derniers-30-jours' })).toBe("vs 30 jours d'avant")
  })

  it('cette-annee → "vs <annee-1> à date"', () => {
    expect(getLabelVariation({ filtreId: 'cette-annee', since: '2026-01-01' })).toBe('vs 2025 à date')
  })

  it('cette-annee sans since valide → "vs année précédente"', () => {
    expect(getLabelVariation({ filtreId: 'cette-annee', since: 'invalid' })).toBe('vs année précédente')
  })

  it('null → "vs période précédente"', () => {
    expect(getLabelVariation(null)).toBe('vs période précédente')
  })

  it('filtreId inconnu → "vs période précédente"', () => {
    expect(getLabelVariation({ filtreId: 'wat' })).toBe('vs période précédente')
  })
})
