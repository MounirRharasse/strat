import { describe, it, expect } from 'vitest'
import {
  mediane,
  detecterTrousJours,
  detecterTrousCanal,
  detecterTrousCategories,
  detecterAnomaliesMontant,
  auditerJournal,
  compterAlertesRapide,
  calculerMediansUberParJourSemaine,
  evaluerJour
} from './audit-saisies'

describe('mediane', () => {
  it('tableau vide → null', () => {
    expect(mediane([])).toBeNull()
    expect(mediane(null)).toBeNull()
    expect(mediane(undefined)).toBeNull()
  })

  it('1 valeur → cette valeur', () => {
    expect(mediane([5])).toBe(5)
  })

  it('nombre impair → valeur du milieu', () => {
    expect(mediane([1, 2, 3])).toBe(2)
    expect(mediane([3, 1, 2])).toBe(2) // tri auto
  })

  it('nombre pair → moyenne des 2 du milieu', () => {
    expect(mediane([1, 2, 3, 4])).toBe(2.5)
  })

  it('valeurs identiques', () => {
    expect(mediane([3, 3, 3])).toBe(3)
  })

  it('filtre null/undefined/NaN', () => {
    expect(mediane([1, null, 3, undefined, NaN])).toBe(2)
  })
})

describe('detecterTrousJours', () => {
  const baseArgs = {
    since: '2026-04-25',
    today: '2026-04-30',
    historique: [],
    transactions: [],
    entrees: [],
    ignores: []
  }

  it('jours_fermes_semaine vide → désactive', () => {
    const r = detecterTrousJours({ ...baseArgs, joursFermesSemaine: [] })
    expect(r.desactive).toBe('jours_fermes_non_configures')
    expect(r.alertes).toHaveLength(0)
  })

  it('jours_fermes_semaine null → désactive', () => {
    const r = detecterTrousJours({ ...baseArgs, joursFermesSemaine: null })
    expect(r.desactive).toBe('jours_fermes_non_configures')
  })

  it('jour fermé (lundi) ignoré', () => {
    // 2026-04-27 = lundi
    const r = detecterTrousJours({
      ...baseArgs,
      since: '2026-04-27',
      today: '2026-04-27',
      joursFermesSemaine: [1] // lundi fermé
    })
    expect(r.alertes).toHaveLength(0)
  })

  it('jour avec saisie → pas d\'alerte', () => {
    const r = detecterTrousJours({
      ...baseArgs,
      since: '2026-04-30',
      today: '2026-04-30',
      historique: [{ date: '2026-04-30', ca_brut: 1500 }],
      joursFermesSemaine: [0] // dimanche fermé
    })
    expect(r.alertes).toHaveLength(0)
  })

  it('jour sans saisie → alerte rouge', () => {
    const r = detecterTrousJours({
      ...baseArgs,
      since: '2026-04-30',
      today: '2026-04-30',
      joursFermesSemaine: [0]
    })
    expect(r.alertes).toHaveLength(1)
    expect(r.alertes[0].type).toBe('trou_jour')
    expect(r.alertes[0].criticite).toBe('rouge')
    expect(r.alertes[0].cle).toBe('2026-04-30')
    expect(r.alertes[0].cta.mode).toBe('depense')
  })

  it('saisie via transactions ou entrees compte aussi', () => {
    const r = detecterTrousJours({
      ...baseArgs,
      since: '2026-04-29',
      today: '2026-04-30',
      transactions: [{ date: '2026-04-29' }],
      entrees: [{ date: '2026-04-30' }],
      joursFermesSemaine: [0]
    })
    expect(r.alertes).toHaveLength(0)
  })

  it('jour ignoré → pas d\'alerte', () => {
    const r = detecterTrousJours({
      ...baseArgs,
      since: '2026-04-30',
      today: '2026-04-30',
      joursFermesSemaine: [0],
      ignores: [{ type: 'trou_jour', cle: '2026-04-30' }]
    })
    expect(r.alertes).toHaveLength(0)
  })

  it('historique avec ca_brut=0 ne compte pas comme saisie', () => {
    const r = detecterTrousJours({
      ...baseArgs,
      since: '2026-04-30',
      today: '2026-04-30',
      historique: [{ date: '2026-04-30', ca_brut: 0 }],
      joursFermesSemaine: [0]
    })
    expect(r.alertes).toHaveLength(1)
  })
})

describe('detecterTrousCanal', () => {
  // Construit 4 mardis avec uber > 0 + 1 mardi à 0€ → doit alerter
  const mardisAvecUber = [
    { date: '2026-04-07', uber: 250 }, // mardi
    { date: '2026-04-14', uber: 220 }, // mardi
    { date: '2026-04-21', uber: 280 }, // mardi
    { date: '2026-04-28', uber: 240 }  // mardi
  ]

  it('< 4 occurrences → règle silencieusement désactivée', () => {
    const r = detecterTrousCanal({
      since: '2026-04-30',
      today: '2026-04-30',
      historique: [
        { date: '2026-04-07', uber: 250 },
        { date: '2026-04-14', uber: 220 }
      ],
      ignores: []
    })
    expect(r.alertes).toHaveLength(0)
  })

  it('médiane ≥ 50 et today=mardi avec 0€ → alerte orange', () => {
    // 2026-05-05 = mardi (5e mardi)
    const r = detecterTrousCanal({
      since: '2026-05-05',
      today: '2026-05-05',
      historique: [
        ...mardisAvecUber,
        { date: '2026-05-05', uber: 0 }
      ],
      ignores: []
    })
    expect(r.alertes).toHaveLength(1)
    expect(r.alertes[0].type).toBe('trou_canal')
    expect(r.alertes[0].criticite).toBe('orange')
    expect(r.alertes[0].canal).toBe('uber')
    expect(r.alertes[0].cle).toBe('2026-05-05+uber')
    expect(r.alertes[0].cta.mode).toBe('entree')
    expect(r.alertes[0].cta.source).toBe('uber_eats')
  })

  it('médiane < 50 → pas d\'alerte', () => {
    const r = detecterTrousCanal({
      since: '2026-05-05',
      today: '2026-05-05',
      historique: [
        { date: '2026-04-07', uber: 30 },
        { date: '2026-04-14', uber: 25 },
        { date: '2026-04-21', uber: 40 },
        { date: '2026-04-28', uber: 35 }
      ],
      ignores: []
    })
    expect(r.alertes).toHaveLength(0)
  })

  it('uber présent ce jour → pas d\'alerte', () => {
    const r = detecterTrousCanal({
      since: '2026-05-05',
      today: '2026-05-05',
      historique: [
        ...mardisAvecUber,
        { date: '2026-05-05', uber: 200 }
      ],
      ignores: []
    })
    expect(r.alertes).toHaveLength(0)
  })

  it('ignoré → pas d\'alerte', () => {
    const r = detecterTrousCanal({
      since: '2026-05-05',
      today: '2026-05-05',
      historique: [
        ...mardisAvecUber,
        { date: '2026-05-05', uber: 0 }
      ],
      ignores: [{ type: 'trou_canal', cle: '2026-05-05+uber' }]
    })
    expect(r.alertes).toHaveLength(0)
  })
})

describe('detecterTrousCategories', () => {
  it('today.day < 15 → désactive', () => {
    const r = detecterTrousCategories({
      today: '2026-04-10',
      transactionsHistorique: [],
      ignores: []
    })
    expect(r.desactive).toBe('avant_J15')
    expect(r.alertes).toHaveLength(0)
  })

  it('catégorie présente dans 4/6 mois et absente ce mois → alerte orange', () => {
    const r = detecterTrousCategories({
      today: '2026-04-30',
      transactionsHistorique: [
        { date: '2025-11-05', categorie_pl: 'energie', sous_categorie: 'electricite' },
        { date: '2025-12-05', categorie_pl: 'energie', sous_categorie: 'electricite' },
        { date: '2026-01-05', categorie_pl: 'energie', sous_categorie: 'electricite' },
        { date: '2026-02-05', categorie_pl: 'energie', sous_categorie: 'electricite' },
        { date: '2026-03-05', categorie_pl: 'energie', sous_categorie: 'gaz' }
      ],
      ignores: []
    })
    expect(r.alertes).toHaveLength(1)
    expect(r.alertes[0].type).toBe('trou_categorie')
    expect(r.alertes[0].categorie).toBe('energie')
    expect(r.alertes[0].cle).toBe('2026-04+energie')
    expect(r.alertes[0].cta.mode).toBe('depense')
    expect(r.alertes[0].cta.categorie).toBe('energie')
    expect(r.alertes[0].cta.sous_categorie).toBe('electricite') // la plus fréquente
  })

  it('catégorie présente ce mois → pas d\'alerte', () => {
    const r = detecterTrousCategories({
      today: '2026-04-30',
      transactionsHistorique: [
        { date: '2025-11-05', categorie_pl: 'energie' },
        { date: '2025-12-05', categorie_pl: 'energie' },
        { date: '2026-01-05', categorie_pl: 'energie' },
        { date: '2026-04-15', categorie_pl: 'energie' }
      ],
      ignores: []
    })
    expect(r.alertes).toHaveLength(0)
  })

  it('catégorie présente < 3 mois → pas d\'alerte', () => {
    const r = detecterTrousCategories({
      today: '2026-04-30',
      transactionsHistorique: [
        { date: '2026-01-05', categorie_pl: 'energie' },
        { date: '2026-02-05', categorie_pl: 'energie' }
      ],
      ignores: []
    })
    expect(r.alertes).toHaveLength(0)
  })

  it('ignoré → pas d\'alerte', () => {
    const r = detecterTrousCategories({
      today: '2026-04-30',
      transactionsHistorique: [
        { date: '2025-11-05', categorie_pl: 'loyers_charges' },
        { date: '2025-12-05', categorie_pl: 'loyers_charges' },
        { date: '2026-01-05', categorie_pl: 'loyers_charges' }
      ],
      ignores: [{ type: 'trou_categorie', cle: '2026-04+loyers_charges' }]
    })
    expect(r.alertes).toHaveLength(0)
  })
})

describe('detecterAnomaliesMontant', () => {
  // 6 achats Boucherie à ~800€ + 1 achat à 50€ → anomalie attendue
  const boucherie6Achats = Array.from({ length: 6 }, (_, i) => ({
    id: 'b' + i,
    date: '2026-03-' + String(i + 1).padStart(2, '0'),
    fournisseur_nom: 'Boucherie',
    montant_ttc: 800
  }))

  it('< 6 transactions historique → silencieusement désactivée', () => {
    const r = detecterAnomaliesMontant({
      since: '2026-04-01',
      until: '2026-04-30',
      transactionsHistorique: [
        { id: 'b1', date: '2026-04-01', fournisseur_nom: 'Nouveau', montant_ttc: 500 }
      ],
      ignores: []
    })
    expect(r.alertes).toHaveLength(0)
  })

  it('écart > 50% et > 100€ → alerte orange (baisse)', () => {
    const r = detecterAnomaliesMontant({
      since: '2026-04-01',
      until: '2026-04-30',
      transactionsHistorique: [
        ...boucherie6Achats,
        { id: 'b-anomalie', date: '2026-04-15', fournisseur_nom: 'Boucherie', montant_ttc: 50 }
      ],
      ignores: []
    })
    expect(r.alertes).toHaveLength(1)
    expect(r.alertes[0].type).toBe('anomalie_montant')
    expect(r.alertes[0].criticite).toBe('orange')
    expect(r.alertes[0].cle).toBe('b-anomalie')
    expect(r.alertes[0].sousTexte).toContain('baisse')
  })

  it('écart > 50% et > 100€ → alerte (hausse)', () => {
    const r = detecterAnomaliesMontant({
      since: '2026-04-01',
      until: '2026-04-30',
      transactionsHistorique: [
        ...boucherie6Achats,
        { id: 'b-hausse', date: '2026-04-20', fournisseur_nom: 'Boucherie', montant_ttc: 2500 }
      ],
      ignores: []
    })
    expect(r.alertes).toHaveLength(1)
    expect(r.alertes[0].sousTexte).toContain('hausse')
  })

  it('écart ≤ 50% → pas d\'alerte', () => {
    const r = detecterAnomaliesMontant({
      since: '2026-04-01',
      until: '2026-04-30',
      transactionsHistorique: [
        ...boucherie6Achats,
        { id: 'b-ok', date: '2026-04-15', fournisseur_nom: 'Boucherie', montant_ttc: 1000 } // 25% écart
      ],
      ignores: []
    })
    expect(r.alertes).toHaveLength(0)
  })

  it('écart > 50% mais < 100€ absolu → pas d\'alerte (seuil absolu)', () => {
    const petitsAchats = Array.from({ length: 6 }, (_, i) => ({
      id: 'p' + i,
      date: '2026-03-' + String(i + 1).padStart(2, '0'),
      fournisseur_nom: 'Snack',
      montant_ttc: 100
    }))
    const r = detecterAnomaliesMontant({
      since: '2026-04-01',
      until: '2026-04-30',
      transactionsHistorique: [
        ...petitsAchats,
        { id: 'p-petit', date: '2026-04-10', fournisseur_nom: 'Snack', montant_ttc: 30 } // 70% écart mais 70€ absolu
      ],
      ignores: []
    })
    expect(r.alertes).toHaveLength(0)
  })

  it('ignoré → pas d\'alerte', () => {
    const r = detecterAnomaliesMontant({
      since: '2026-04-01',
      until: '2026-04-30',
      transactionsHistorique: [
        ...boucherie6Achats,
        { id: 'b-ign', date: '2026-04-15', fournisseur_nom: 'Boucherie', montant_ttc: 50 }
      ],
      ignores: [{ type: 'anomalie_montant', cle: 'b-ign' }]
    })
    expect(r.alertes).toHaveLength(0)
  })
})

describe('auditerJournal (composeur)', () => {
  it('agrège les 4 règles + tri par criticité (rouge en haut)', () => {
    const r = auditerJournal({
      since: '2026-04-30',
      today: '2026-04-30',
      historique: [],
      transactions: [],
      entrees: [],
      transactionsHistorique: [
        { date: '2025-11-05', categorie_pl: 'energie' },
        { date: '2025-12-05', categorie_pl: 'energie' },
        { date: '2026-01-05', categorie_pl: 'energie' }
      ],
      joursFermesSemaine: [0],
      ignores: []
    })
    // Au moins 1 trou_jour rouge + 1 trou_categorie orange
    expect(r.nbCritiques).toBeGreaterThanOrEqual(1)
    expect(r.nbAttention).toBeGreaterThanOrEqual(1)
    expect(r.alertes[0].criticite).toBe('rouge') // tri rouge en haut
  })

  it('expose les désactivations', () => {
    const r = auditerJournal({
      since: '2026-04-30',
      today: '2026-04-30',
      historique: [],
      transactions: [],
      entrees: [],
      transactionsHistorique: [],
      joursFermesSemaine: null,
      ignores: []
    })
    expect(r.desactivations.trousJours).toBe('jours_fermes_non_configures')
  })
})

describe('compterAlertesRapide', () => {
  it('retourne juste les counts', () => {
    const r = compterAlertesRapide({
      since: '2026-04-30',
      today: '2026-04-30',
      historique: [],
      transactions: [],
      entrees: [],
      transactionsHistorique: [],
      joursFermesSemaine: [0],
      ignores: []
    })
    expect(r).toHaveProperty('nbTotal')
    expect(r).toHaveProperty('nbCritiques')
    expect(r).toHaveProperty('nbAttention')
    expect(r.nbTotal).toBe(r.nbCritiques + r.nbAttention)
  })
})

describe('calculerMediansUberParJourSemaine', () => {
  it('retourne 7 valeurs (une par dow)', () => {
    const r = calculerMediansUberParJourSemaine([])
    expect(r).toHaveLength(7)
  })

  it('< 4 occurrences pour un dow → null', () => {
    const r = calculerMediansUberParJourSemaine([
      { date: '2026-04-07', uber: 250 }, // mardi (dow=2)
      { date: '2026-04-14', uber: 220 }
    ])
    expect(r[2]).toBeNull() // mardi : seulement 2 occurrences
  })

  it('4+ occurrences → médiane des 4 plus récents', () => {
    const r = calculerMediansUberParJourSemaine([
      { date: '2026-04-07', uber: 250 }, // mardi
      { date: '2026-04-14', uber: 220 },
      { date: '2026-04-21', uber: 280 },
      { date: '2026-04-28', uber: 240 },
      { date: '2026-03-31', uber: 100 } // 5e plus ancien, ignoré
    ])
    // 4 plus récents : 250, 220, 280, 240 → trié 220, 240, 250, 280 → médiane = (240+250)/2 = 245
    expect(r[2]).toBe(245)
  })

  it('hors zéros uniquement', () => {
    const r = calculerMediansUberParJourSemaine([
      { date: '2026-04-07', uber: 250 },
      { date: '2026-04-14', uber: 0 }, // ignoré
      { date: '2026-04-21', uber: 280 },
      { date: '2026-04-28', uber: 240 }
    ])
    expect(r[2]).toBeNull() // 3 valeurs > 0, médiane requiert 4
  })
})

describe('evaluerJour', () => {
  const baseArgs = {
    transactions: [],
    entrees: [],
    historique: [],
    joursFermesSemaine: [],
    mediansUberParJourSemaine: [null, null, null, null, null, null, null]
  }

  it('jour fermé (lundi avec joursFermes=[1]) → ferme', () => {
    const r = evaluerJour({
      ...baseArgs,
      jour: '2026-04-27', // lundi
      joursFermesSemaine: [1]
    })
    expect(r.etat).toBe('ferme')
    expect(r.detail).toBeNull()
  })

  it('aucune saisie → manquant', () => {
    const r = evaluerJour({
      ...baseArgs,
      jour: '2026-04-30'
    })
    expect(r.etat).toBe('manquant')
    expect(r.detail.caCaisse).toBe(0)
    expect(r.detail.uberEats).toBe(0)
    expect(r.detail.resultat).toBe(0)
  })

  it('CA caisse présent + Uber pas attendu → complet (vert)', () => {
    const r = evaluerJour({
      ...baseArgs,
      jour: '2026-04-30',
      historique: [{ date: '2026-04-30', ca_brut: 1500, especes: 200, uber: 0 }],
      mediansUberParJourSemaine: [null, null, null, null, 30, null, null] // jeudi: médiane 30€ < 50
    })
    expect(r.etat).toBe('complet')
    expect(r.detail.caCaisse).toBe(1500)
  })

  it('CA caisse présent + Uber attendu mais 0 → partiel (orange)', () => {
    const r = evaluerJour({
      ...baseArgs,
      jour: '2026-04-30', // jeudi (dow=4)
      historique: [{ date: '2026-04-30', ca_brut: 1500, especes: 200, uber: 0 }],
      mediansUberParJourSemaine: [null, null, null, null, 250, null, null]
    })
    expect(r.etat).toBe('partiel')
  })

  it('CA caisse + Uber attendu et présent → complet', () => {
    const r = evaluerJour({
      ...baseArgs,
      jour: '2026-04-30',
      historique: [{ date: '2026-04-30', ca_brut: 1500, especes: 200, uber: 230 }],
      mediansUberParJourSemaine: [null, null, null, null, 250, null, null]
    })
    expect(r.etat).toBe('complet')
    expect(r.detail.uberEats).toBe(230)
  })

  it('Uber via entrees manuelles uber_eats compte aussi', () => {
    const r = evaluerJour({
      ...baseArgs,
      jour: '2026-04-30',
      historique: [{ date: '2026-04-30', ca_brut: 1500, especes: 0, uber: 0 }],
      entrees: [{ date: '2026-04-30', source: 'uber_eats', montant_ttc: 180 }],
      mediansUberParJourSemaine: [null, null, null, null, 250, null, null]
    })
    expect(r.etat).toBe('complet')
    expect(r.detail.uberEats).toBe(180)
  })

  it('résultat = CA + Uber - dépenses', () => {
    const r = evaluerJour({
      ...baseArgs,
      jour: '2026-04-30',
      historique: [{ date: '2026-04-30', ca_brut: 1500, especes: 0, uber: 200 }],
      transactions: [{ date: '2026-04-30', id: 't1', montant_ttc: 300 }]
    })
    expect(r.detail.resultat).toBe(1400) // 1500 + 200 - 300
  })

  it('depenses sans CA → quand même complet (saisie présente)', () => {
    const r = evaluerJour({
      ...baseArgs,
      jour: '2026-04-30',
      transactions: [{ date: '2026-04-30', id: 't1', montant_ttc: 100 }],
      mediansUberParJourSemaine: [null, null, null, null, null, null, null] // pas de baseline Uber
    })
    expect(r.etat).toBe('complet') // pas manquant car saisie présente, Uber pas attendu
  })
})
