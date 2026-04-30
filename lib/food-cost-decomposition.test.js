import { describe, it, expect } from 'vitest'
import { decomposerParSousCategorie, topFournisseursConsommations } from './food-cost-decomposition'

describe('decomposerParSousCategorie', () => {
  it('aucune transaction → []', () => {
    expect(decomposerParSousCategorie([])).toEqual([])
    expect(decomposerParSousCategorie(null)).toEqual([])
  })

  it('exclut les transactions non-consommations', () => {
    const tx = [
      { categorie_pl: 'frais_personnel', sous_categorie: 'salaires', montant_ht: 1000 },
      { categorie_pl: 'consommations', sous_categorie: 'viande', montant_ht: 500 }
    ]
    const r = decomposerParSousCategorie(tx)
    expect(r).toHaveLength(1)
    expect(r[0].sousCategorie).toBe('viande')
  })

  it('agrège plusieurs transactions par sous-cat', () => {
    const tx = [
      { categorie_pl: 'consommations', sous_categorie: 'viande', montant_ht: 300 },
      { categorie_pl: 'consommations', sous_categorie: 'viande', montant_ht: 200 },
      { categorie_pl: 'consommations', sous_categorie: 'epicerie', montant_ht: 100 }
    ]
    const r = decomposerParSousCategorie(tx)
    expect(r).toHaveLength(2)
    expect(r[0].sousCategorie).toBe('viande')
    expect(r[0].total).toBe(500)
    expect(r[0].count).toBe(2)
    expect(r[0].pct).toBe(83) // 500/600 = 83.33%
    expect(r[1].sousCategorie).toBe('epicerie')
    expect(r[1].pct).toBe(17)
  })

  it('tri par total décroissant', () => {
    const tx = [
      { categorie_pl: 'consommations', sous_categorie: 'epicerie', montant_ht: 100 },
      { categorie_pl: 'consommations', sous_categorie: 'viande', montant_ht: 500 },
      { categorie_pl: 'consommations', sous_categorie: 'boissons', montant_ht: 200 }
    ]
    const r = decomposerParSousCategorie(tx)
    expect(r.map(d => d.sousCategorie)).toEqual(['viande', 'boissons', 'epicerie'])
  })

  it('mappe les labels standards', () => {
    const tx = [
      { categorie_pl: 'consommations', sous_categorie: 'viande', montant_ht: 100 },
      { categorie_pl: 'consommations', sous_categorie: 'epicerie', montant_ht: 50 },
      { categorie_pl: 'consommations', sous_categorie: 'autres_consommations', montant_ht: 25 }
    ]
    const r = decomposerParSousCategorie(tx)
    expect(r.find(d => d.sousCategorie === 'viande').label).toBe('Viande / poisson')
    expect(r.find(d => d.sousCategorie === 'epicerie').label).toBe('Épicerie')
    expect(r.find(d => d.sousCategorie === 'autres_consommations').label).toBe('Autres')
  })

  it('sous-cat vide → label "(Sans sous-categorie)"', () => {
    const tx = [
      { categorie_pl: 'consommations', sous_categorie: '', montant_ht: 100 },
      { categorie_pl: 'consommations', sous_categorie: null, montant_ht: 50 }
    ]
    const r = decomposerParSousCategorie(tx)
    expect(r).toHaveLength(1)
    expect(r[0].label).toBe('(Sans sous-categorie)')
    expect(r[0].total).toBe(150)
  })
})

describe('topFournisseursConsommations', () => {
  it('aucune transaction → []', () => {
    expect(topFournisseursConsommations([], [])).toEqual([])
  })

  it('agrège par fournisseur, exclut non-consommations', () => {
    const actuel = [
      { categorie_pl: 'consommations', fournisseur_nom: 'Boucherie', montant_ht: 500 },
      { categorie_pl: 'consommations', fournisseur_nom: 'Boucherie', montant_ht: 200 },
      { categorie_pl: 'consommations', fournisseur_nom: 'Sysco', montant_ht: 100 },
      { categorie_pl: 'frais_personnel', fournisseur_nom: 'URSSAF', montant_ht: 1000 }
    ]
    const r = topFournisseursConsommations(actuel, [])
    expect(r).toHaveLength(2)
    expect(r[0].fournisseur).toBe('Boucherie')
    expect(r[0].total).toBe(700)
    expect(r[1].fournisseur).toBe('Sysco')
  })

  it('calcule variations vs période précédente', () => {
    const actuel = [
      { categorie_pl: 'consommations', fournisseur_nom: 'Boucherie', montant_ht: 600 }
    ]
    const prec = [
      { categorie_pl: 'consommations', fournisseur_nom: 'Boucherie', montant_ht: 500 }
    ]
    const r = topFournisseursConsommations(actuel, prec)
    expect(r[0].variationPct).toBeCloseTo(20, 1)
    expect(r[0].totalPrec).toBe(500)
  })

  it('fournisseur uniquement actuel → label "Nouveau"', () => {
    const actuel = [
      { categorie_pl: 'consommations', fournisseur_nom: 'NouveauFour', montant_ht: 300 }
    ]
    const r = topFournisseursConsommations(actuel, [])
    expect(r[0].variationPct).toBeNull()
    expect(r[0].variationLabel).toBe('Nouveau')
  })

  it('respecte limit', () => {
    const actuel = Array.from({ length: 10 }, (_, i) => ({
      categorie_pl: 'consommations',
      fournisseur_nom: 'F' + i,
      montant_ht: 1000 - i * 10
    }))
    expect(topFournisseursConsommations(actuel, [], 5)).toHaveLength(5)
    expect(topFournisseursConsommations(actuel, [], 3)).toHaveLength(3)
  })

  it('tri par total décroissant', () => {
    const actuel = [
      { categorie_pl: 'consommations', fournisseur_nom: 'B', montant_ht: 100 },
      { categorie_pl: 'consommations', fournisseur_nom: 'A', montant_ht: 500 },
      { categorie_pl: 'consommations', fournisseur_nom: 'C', montant_ht: 300 }
    ]
    const r = topFournisseursConsommations(actuel, [])
    expect(r.map(f => f.fournisseur)).toEqual(['A', 'C', 'B'])
  })
})
