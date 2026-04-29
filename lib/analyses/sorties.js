// Mapping macro-cat aligné sur app/pl/page.js (source de vérité métier).
// Cf. CLAUDE.md §4 + STRAT_CADRAGE.md §5.5.
export const MACRO_CATEGORIES = {
  'Consommations': ['consommations'],
  'Personnel': ['frais_personnel', 'autres_charges_personnel', 'frais_deplacement'],
  'Charges influençables': ['entretiens_reparations', 'energie', 'autres_frais_influencables'],
  'Charges fixes': ['loyers_charges', 'honoraires', 'redevance_marque', 'prestations_operationnelles', 'frais_divers', 'autres_charges'],
}

export const ORDRE_MACRO_CATS = ['Consommations', 'Personnel', 'Charges influençables', 'Charges fixes', 'Autres']

function macroCatFor(categoriePl) {
  for (const [macro, cats] of Object.entries(MACRO_CATEGORIES)) {
    if (cats.includes(categoriePl)) return macro
  }
  return 'Autres'
}

export function agregerParMacroCategorie(transactions) {
  const buckets = {}
  for (const macro of ORDRE_MACRO_CATS) {
    buckets[macro] = { macroCat: macro, total: 0, count: 0 }
  }
  for (const t of transactions || []) {
    const macro = macroCatFor(t.categorie_pl)
    buckets[macro].total += (t.montant_ttc || 0)
    buckets[macro].count += 1
  }
  return Object.values(buckets).sort((a, b) => b.total - a.total)
}

export function calculerVariations(actuel, precedent) {
  const mapPrec = new Map((precedent || []).map(p => [p.macroCat, p.total]))
  return actuel.map(a => {
    const prec = mapPrec.get(a.macroCat) || 0
    let variationPct = null
    let variationLabel = null
    if (prec === 0 && a.total > 0) {
      variationLabel = 'Nouveau'
    } else if (prec === 0 && a.total === 0) {
      variationLabel = '—'
    } else {
      variationPct = ((a.total - prec) / prec) * 100
    }
    return { ...a, totalPrecedent: prec, variationPct, variationLabel }
  })
}

// 6 mois calendaires glissants jusqu'au mois de `until`. Inclut le mois courant
// (peut être partiel — accepté V1, cf. décision 2026-04-29). Retourne un objet
// { 'Consommations': [v0, v1, ..., v5], ... } où v0 = mois M-5, v5 = mois M.
export function agregerSparkline6Mois(transactions, until) {
  const untilDate = new Date(until)
  const mois = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(untilDate.getFullYear(), untilDate.getMonth() - i, 1)
    mois.push(d.toISOString().slice(0, 7))
  }

  const result = {}
  for (const macro of ORDRE_MACRO_CATS) {
    result[macro] = mois.map(() => 0)
  }

  for (const t of transactions || []) {
    const ym = (t.date || '').slice(0, 7)
    const idx = mois.indexOf(ym)
    if (idx === -1) continue
    const macro = macroCatFor(t.categorie_pl)
    result[macro][idx] += (t.montant_ttc || 0)
  }

  return result
}
