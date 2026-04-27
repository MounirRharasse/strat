import { describe, it, expect } from 'vitest'
import {
  LABELS_FILTRES,
  getAujourdhui,
  getHier,
  getCetteSemaine,
  getSemaineDerniere,
  getCeMois,
  getMoisDernier,
  getDerniers30Jours,
  getCetteAnnee,
  getPeriodePersonnalisee,
  periodePrecedenteAEgaleDuree
} from './periods'

const TZ = 'Europe/Paris'

describe('LABELS_FILTRES', () => {
  it('contient les 9 filtres V1', () => {
    expect(Object.keys(LABELS_FILTRES)).toHaveLength(9)
  })

  it('expose les libellés français exacts', () => {
    expect(LABELS_FILTRES.aujourdhui).toBe("Aujourd'hui")
    expect(LABELS_FILTRES['cette-semaine']).toBe('Cette semaine')
    expect(LABELS_FILTRES['derniers-30-jours']).toBe('30 derniers jours')
  })
})

describe('getAujourdhui', () => {
  it('retourne la date locale en Europe/Paris', () => {
    const r = getAujourdhui({ timezone: TZ, refDate: new Date('2026-04-27T10:00:00Z') })
    expect(r).toEqual({
      since: '2026-04-27',
      until: '2026-04-27',
      label: "Aujourd'hui",
      nbJours: 1,
      filtreId: 'aujourdhui'
    })
  })

  it('respecte la timezone (NY vs Paris à minuit Paris)', () => {
    // 22h00 UTC = 00h00 Paris (été UTC+2) = 18h00 NY (été UTC-4)
    const refDate = new Date('2026-04-27T22:00:00Z')
    expect(getAujourdhui({ timezone: 'Europe/Paris', refDate }).since).toBe('2026-04-28')
    expect(getAujourdhui({ timezone: 'America/New_York', refDate }).since).toBe('2026-04-27')
  })

  it('throw sur timezone invalide', () => {
    expect(() => getAujourdhui({ timezone: 'Mars/Olympus' })).toThrow(/Timezone invalide/)
  })

  it('throw sur timezone vide', () => {
    expect(() => getAujourdhui({ timezone: '' })).toThrow(/Timezone invalide/)
  })

  it('throw sur timezone undefined', () => {
    expect(() => getAujourdhui({})).toThrow(/Timezone invalide/)
  })
})

describe('getHier', () => {
  it('retourne la veille', () => {
    const r = getHier({ timezone: TZ, refDate: new Date('2026-04-27T10:00:00Z') })
    expect(r.since).toBe('2026-04-26')
    expect(r.until).toBe('2026-04-26')
    expect(r.nbJours).toBe(1)
  })

  it('traverse un changement de mois (1er du mois)', () => {
    const r = getHier({ timezone: TZ, refDate: new Date('2026-05-01T10:00:00Z') })
    expect(r.since).toBe('2026-04-30')
  })

  it("traverse un changement d'année (1er janvier)", () => {
    const r = getHier({ timezone: TZ, refDate: new Date('2027-01-01T10:00:00Z') })
    expect(r.since).toBe('2026-12-31')
  })
})

describe('getCetteSemaine', () => {
  it("retourne lundi → aujourd'hui", () => {
    // 2026-04-27 est un lundi
    const r = getCetteSemaine({ timezone: TZ, refDate: new Date('2026-04-27T10:00:00Z') })
    expect(r.since).toBe('2026-04-27')
    expect(r.until).toBe('2026-04-27')
    expect(r.nbJours).toBe(1)
    expect(r.filtreId).toBe('cette-semaine')
  })

  it("en milieu de semaine retourne lundi → aujourd'hui", () => {
    // 2026-04-30 est un jeudi
    const r = getCetteSemaine({ timezone: TZ, refDate: new Date('2026-04-30T10:00:00Z') })
    expect(r.since).toBe('2026-04-27')
    expect(r.until).toBe('2026-04-30')
    expect(r.nbJours).toBe(4)
  })

  it('un dimanche, retourne lundi → dimanche (7 jours)', () => {
    // 2026-05-03 est un dimanche
    const r = getCetteSemaine({ timezone: TZ, refDate: new Date('2026-05-03T10:00:00Z') })
    expect(r.since).toBe('2026-04-27')
    expect(r.until).toBe('2026-05-03')
    expect(r.nbJours).toBe(7)
  })

  it('traverse le DST printemps 2026 (29 mars)', () => {
    // 2026-03-29 dimanche, jour du DST (clocks 02h → 03h)
    const r = getCetteSemaine({ timezone: TZ, refDate: new Date('2026-03-29T10:00:00Z') })
    expect(r.since).toBe('2026-03-23')
    expect(r.until).toBe('2026-03-29')
    expect(r.nbJours).toBe(7)
  })
})

describe('getSemaineDerniere', () => {
  it('retourne lundi → dimanche complets (7 jours)', () => {
    const r = getSemaineDerniere({ timezone: TZ, refDate: new Date('2026-04-28T10:00:00Z') })
    expect(r.since).toBe('2026-04-20')
    expect(r.until).toBe('2026-04-26')
    expect(r.nbJours).toBe(7)
  })

  it('toujours 7 jours peu importe le jour de référence', () => {
    const r1 = getSemaineDerniere({ timezone: TZ, refDate: new Date('2026-05-03T10:00:00Z') })
    expect(r1.nbJours).toBe(7)
    const r2 = getSemaineDerniere({ timezone: TZ, refDate: new Date('2026-04-27T10:00:00Z') })
    expect(r2.nbJours).toBe(7)
  })

  it('traverse le DST automne 2026 (25 octobre)', () => {
    // refDate lundi 26 octobre, semaine dernière inclut DST 25 oct
    const r = getSemaineDerniere({ timezone: TZ, refDate: new Date('2026-10-26T10:00:00Z') })
    expect(r.since).toBe('2026-10-19')
    expect(r.until).toBe('2026-10-25')
    expect(r.nbJours).toBe(7)
  })
})

describe('getCeMois', () => {
  it("retourne 1er → aujourd'hui", () => {
    const r = getCeMois({ timezone: TZ, refDate: new Date('2026-04-27T10:00:00Z') })
    expect(r.since).toBe('2026-04-01')
    expect(r.until).toBe('2026-04-27')
    expect(r.nbJours).toBe(27)
  })

  it('le 1er du mois, retourne 1 jour', () => {
    const r = getCeMois({ timezone: TZ, refDate: new Date('2026-04-01T10:00:00Z') })
    expect(r.nbJours).toBe(1)
    expect(r.since).toBe('2026-04-01')
    expect(r.until).toBe('2026-04-01')
  })

  it('le 29 février 2024 (bissextile)', () => {
    const r = getCeMois({ timezone: TZ, refDate: new Date('2024-02-29T10:00:00Z') })
    expect(r.since).toBe('2024-02-01')
    expect(r.until).toBe('2024-02-29')
    expect(r.nbJours).toBe(29)
  })
})

describe('getMoisDernier', () => {
  it('retourne le mois calendaire complet précédent', () => {
    const r = getMoisDernier({ timezone: TZ, refDate: new Date('2026-04-27T10:00:00Z') })
    expect(r.since).toBe('2026-03-01')
    expect(r.until).toBe('2026-03-31')
    expect(r.nbJours).toBe(31)
  })

  it('en mars 2024 retourne février 2024 avec 29 jours (bissextile)', () => {
    const r = getMoisDernier({ timezone: TZ, refDate: new Date('2024-03-15T10:00:00Z') })
    expect(r.since).toBe('2024-02-01')
    expect(r.until).toBe('2024-02-29')
    expect(r.nbJours).toBe(29)
  })

  it("en janvier retourne décembre de l'année précédente", () => {
    const r = getMoisDernier({ timezone: TZ, refDate: new Date('2027-01-15T10:00:00Z') })
    expect(r.since).toBe('2026-12-01')
    expect(r.until).toBe('2026-12-31')
    expect(r.nbJours).toBe(31)
  })
})

describe('getDerniers30Jours', () => {
  it('retourne J-29 → J inclusivement (30 jours)', () => {
    const r = getDerniers30Jours({ timezone: TZ, refDate: new Date('2026-04-27T10:00:00Z') })
    expect(r.since).toBe('2026-03-29')
    expect(r.until).toBe('2026-04-27')
    expect(r.nbJours).toBe(30)
  })

  it("traverse un changement d'année", () => {
    const r = getDerniers30Jours({ timezone: TZ, refDate: new Date('2027-01-15T10:00:00Z') })
    expect(r.since).toBe('2026-12-17')
    expect(r.until).toBe('2027-01-15')
    expect(r.nbJours).toBe(30)
  })
})

describe('getCetteAnnee', () => {
  it("retourne 1er janvier → aujourd'hui", () => {
    const r = getCetteAnnee({ timezone: TZ, refDate: new Date('2026-04-27T10:00:00Z') })
    expect(r.since).toBe('2026-01-01')
    expect(r.until).toBe('2026-04-27')
    expect(r.nbJours).toBe(117)
  })

  it('le 1er janvier retourne 1 jour', () => {
    const r = getCetteAnnee({ timezone: TZ, refDate: new Date('2026-01-01T10:00:00Z') })
    expect(r.since).toBe('2026-01-01')
    expect(r.until).toBe('2026-01-01')
    expect(r.nbJours).toBe(1)
  })

  it('année bissextile : 366 jours possibles', () => {
    const r = getCetteAnnee({ timezone: TZ, refDate: new Date('2024-12-31T10:00:00Z') })
    expect(r.nbJours).toBe(366)
  })
})

describe('getPeriodePersonnalisee', () => {
  it('retourne la période fournie', () => {
    const r = getPeriodePersonnalisee({
      since: '2026-04-01',
      until: '2026-04-15',
      timezone: TZ
    })
    expect(r.since).toBe('2026-04-01')
    expect(r.until).toBe('2026-04-15')
    expect(r.nbJours).toBe(15)
    expect(r.filtreId).toBe('personnalise')
  })

  it('throw si format de date invalide', () => {
    expect(() => getPeriodePersonnalisee({
      since: '01/04/2026',
      until: '2026-04-15',
      timezone: TZ
    })).toThrow(/Date since invalide/)
  })

  it('throw si since > until', () => {
    expect(() => getPeriodePersonnalisee({
      since: '2026-04-15',
      until: '2026-04-01',
      timezone: TZ
    })).toThrow(/Période invalide/)
  })

  it('accepte since = until (1 jour)', () => {
    const r = getPeriodePersonnalisee({
      since: '2026-04-15',
      until: '2026-04-15',
      timezone: TZ
    })
    expect(r.nbJours).toBe(1)
  })
})

describe('periodePrecedenteAEgaleDuree', () => {
  it('Cette semaine 4 jours → 4 premiers jours de la semaine dernière', () => {
    const courante = getCetteSemaine({ timezone: TZ, refDate: new Date('2026-04-30T10:00:00Z') })
    expect(courante.since).toBe('2026-04-27')
    expect(courante.until).toBe('2026-04-30')

    const precedente = periodePrecedenteAEgaleDuree(courante)
    expect(precedente.since).toBe('2026-04-20')
    expect(precedente.until).toBe('2026-04-23')
    expect(precedente.nbJours).toBe(4)
    expect(precedente.filtreId).toBe('cette-semaine-precedente')
  })

  it('Ce mois 27 jours → 27 premiers jours du mois dernier', () => {
    const courante = getCeMois({ timezone: TZ, refDate: new Date('2026-04-27T10:00:00Z') })
    expect(courante.nbJours).toBe(27)

    const precedente = periodePrecedenteAEgaleDuree(courante)
    expect(precedente.since).toBe('2026-03-01')
    expect(precedente.until).toBe('2026-03-27')
    expect(precedente.nbJours).toBe(27)
  })

  it("Cette année 117 jours → 117 premiers jours de l'année dernière", () => {
    const courante = getCetteAnnee({ timezone: TZ, refDate: new Date('2026-04-27T10:00:00Z') })
    expect(courante.nbJours).toBe(117)

    const precedente = periodePrecedenteAEgaleDuree(courante)
    expect(precedente.since).toBe('2025-01-01')
    expect(precedente.until).toBe('2025-04-27')
    expect(precedente.nbJours).toBe(117)
  })

  it("Semaine dernière (7 jours) → semaine d'avant (7 jours)", () => {
    const courante = getSemaineDerniere({ timezone: TZ, refDate: new Date('2026-04-27T10:00:00Z') })
    expect(courante.since).toBe('2026-04-20')
    expect(courante.until).toBe('2026-04-26')

    const precedente = periodePrecedenteAEgaleDuree(courante)
    expect(precedente.since).toBe('2026-04-13')
    expect(precedente.until).toBe('2026-04-19')
    expect(precedente.nbJours).toBe(7)
  })

  it("Mois dernier 31 jours → mois d'avant peut déborder (cas limite documenté)", () => {
    // refDate avril 2024 → mois dernier = mars 2024 (31 jours)
    const courante = getMoisDernier({ timezone: TZ, refDate: new Date('2024-04-15T10:00:00Z') })
    expect(courante.since).toBe('2024-03-01')
    expect(courante.nbJours).toBe(31)

    // Précédente : 31 jours en partant du 1er février 2024 (qui n'a que 29 jours)
    // → déborde sur le 1er-2 mars 2024 (29 jours fév + 2 jours mars)
    const precedente = periodePrecedenteAEgaleDuree(courante)
    expect(precedente.since).toBe('2024-02-01')
    expect(precedente.until).toBe('2024-03-02')
    expect(precedente.nbJours).toBe(31)
  })

  it('Hier → avant-hier (cas générique)', () => {
    const courante = getHier({ timezone: TZ, refDate: new Date('2026-04-27T10:00:00Z') })
    const precedente = periodePrecedenteAEgaleDuree(courante)
    expect(precedente.since).toBe('2026-04-25')
    expect(precedente.until).toBe('2026-04-25')
    expect(precedente.nbJours).toBe(1)
  })

  it('30 derniers jours → 30 jours encore avant (cas générique)', () => {
    const courante = getDerniers30Jours({ timezone: TZ, refDate: new Date('2026-04-27T10:00:00Z') })
    const precedente = periodePrecedenteAEgaleDuree(courante)
    expect(precedente.until).toBe('2026-03-28')
    expect(precedente.since).toBe('2026-02-27')
    expect(precedente.nbJours).toBe(30)
  })

  it('Personnalisée → période juste avant (cas générique)', () => {
    const courante = getPeriodePersonnalisee({
      since: '2026-04-10',
      until: '2026-04-20',
      timezone: TZ
    })
    expect(courante.nbJours).toBe(11)

    const precedente = periodePrecedenteAEgaleDuree(courante)
    expect(precedente.until).toBe('2026-04-09')
    expect(precedente.since).toBe('2026-03-30')
    expect(precedente.nbJours).toBe(11)
  })

  it('throw si période invalide', () => {
    expect(() => periodePrecedenteAEgaleDuree(null)).toThrow(/Période invalide/)
    expect(() => periodePrecedenteAEgaleDuree({})).toThrow(/Période invalide/)
    expect(() => periodePrecedenteAEgaleDuree({ since: '2026-04-01' })).toThrow(/Période invalide/)
  })

  it('label "Période précédente" et filtreId suffixé "-precedente"', () => {
    const courante = getCeMois({ timezone: TZ, refDate: new Date('2026-04-27T10:00:00Z') })
    const precedente = periodePrecedenteAEgaleDuree(courante)
    expect(precedente.label).toBe('Période précédente')
    expect(precedente.filtreId).toBe('ce-mois-precedente')
  })
})
