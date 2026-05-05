// Mapping macro-cat aligné sur app/pl/page.js (source de vérité métier).
// Cf. CLAUDE.md §4 + STRAT_CADRAGE.md §5.5.
export const MACRO_CATEGORIES = {
  'Consommations': ['consommations'],
  'Personnel': ['frais_personnel', 'autres_charges_personnel', 'frais_deplacement'],
  'Charges influençables': ['entretiens_reparations', 'energie', 'autres_frais_influencables'],
  'Charges fixes': ['loyers_charges', 'honoraires', 'redevance_marque', 'prestations_operationnelles', 'frais_divers', 'autres_charges'],
}

export const ORDRE_MACRO_CATS = ['Consommations', 'Personnel', 'Charges influençables', 'Charges fixes', 'Autres']

// Labels copiés depuis app/journal/JournalClient.js (V1 duplication acceptée).
// TODO V1.1 : consolider dans lib/labels.js et migrer Journal + FAB.
export const CATEGORIE_LABELS = {
  consommations: 'Consommations',
  frais_personnel: 'Frais personnel',
  autres_charges_personnel: 'Autres charges personnel',
  frais_deplacement: 'Frais deplacement',
  entretiens_reparations: 'Entretiens et Reparations',
  energie: 'Energie',
  autres_frais_influencables: 'Autres frais',
  loyers_charges: 'Loyers et Charges',
  honoraires: 'Honoraires',
  redevance_marque: 'Redevance de Marque',
  prestations_operationnelles: 'Prestations',
  frais_divers: 'Frais Divers',
  autres_charges: 'Autres charges',
  impots_benefices: 'Impots sur les benefices'
}

// Labels copiés depuis components/FAB.js (V1 duplication acceptée).
export const SOUS_CAT_LABELS = {
  viande: 'Viande et poisson',
  epicerie: 'Epicerie et feculent',
  boissons: 'Boissons',
  emballages: 'Emballages',
  autres_consommations: 'Autres consommations',
  salaires: 'Salaires',
  charges_sociales: 'Charges sociales',
  extras: 'Extras / interimaires',
  formation: 'Formation',
  autres_personnel: 'Autres',
  essence: 'Essence',
  transport: 'Transport',
  entretien_materiel: 'Entretien materiel',
  entretien_local: 'Entretien local',
  autres_entretiens: 'Autres entretiens',
  electricite: 'Electricite',
  gaz: 'Gaz',
  eau: 'Eau',
  frais_bancaires: 'Frais bancaires',
  autres_influencables: 'Autres',
  loyer: 'Loyer',
  charges_locatives: 'Charges locatives',
  comptable: 'Expert-comptable',
  autres_honoraires: 'Autres honoraires',
  redevance: 'Redevance de Marque',
  commissions_uber: 'Commissions Uber Eats',
  commissions_foxorder: 'Commissions Foxorder',
  logiciels: 'Logiciels et abonnements',
  autres_prestations: 'Autres prestations',
  frais_divers: 'Frais divers',
  autres_charges: 'Autres charges',
  is: 'Impot sur les benefices'
}

function macroCatFor(categoriePl) {
  for (const [macro, cats] of Object.entries(MACRO_CATEGORIES)) {
    if (cats.includes(categoriePl)) return macro
  }
  return 'Autres'
}

function computeVariation(actuel, precedent) {
  if (precedent === 0 && actuel > 0) return { pct: null, label: 'Nouveau' }
  if (precedent === 0 && actuel === 0) return { pct: null, label: '—' }
  return { pct: ((actuel - precedent) / precedent) * 100, label: null }
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
    const v = computeVariation(a.total, prec)
    return { ...a, totalPrecedent: prec, variationPct: v.pct, variationLabel: v.label }
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

// Agrège les transactions en arbre 4 niveaux : macro → cat P&L → sous-cat → fournisseur.
// Pad les 5 macro-cats même vides (cohérence affichage L1). Tri par total décroissant
// à chaque niveau.
// Lot post-V1.1 : tracke total (TTC, default) + total_ht à chaque niveau pour
// que /pl puisse réutiliser la hiérarchie sans dupliquer la logique d'agrégation.
// Le tri par défaut reste sur total (TTC).
export function agregerHierarchie(transactions) {
  const buckets = {}
  for (const macro of ORDRE_MACRO_CATS) {
    buckets[macro] = {
      macroCat: macro,
      total: 0,
      total_ht: 0,
      count: 0,
      _catMap: new Map()
    }
  }

  for (const t of transactions || []) {
    const macro = macroCatFor(t.categorie_pl)
    const cat = t.categorie_pl || 'autres_charges'
    const sousCatKey = t.sous_categorie || '__sans__'
    const fournisseur = t.fournisseur_nom || '(Sans nom)'
    const montant = t.montant_ttc || 0
    const montantHt = t.montant_ht || 0

    const m = buckets[macro]
    m.total += montant
    m.total_ht += montantHt
    m.count += 1

    if (!m._catMap.has(cat)) {
      m._catMap.set(cat, {
        cat,
        label: CATEGORIE_LABELS[cat] || cat,
        total: 0,
        total_ht: 0,
        count: 0,
        _sousMap: new Map()
      })
    }
    const c = m._catMap.get(cat)
    c.total += montant
    c.total_ht += montantHt
    c.count += 1

    if (!c._sousMap.has(sousCatKey)) {
      c._sousMap.set(sousCatKey, {
        sousCat: t.sous_categorie || '',
        label: t.sous_categorie ? (SOUS_CAT_LABELS[t.sous_categorie] || t.sous_categorie) : '(Sans sous-categorie)',
        total: 0,
        total_ht: 0,
        count: 0,
        _fournMap: new Map()
      })
    }
    const sc = c._sousMap.get(sousCatKey)
    sc.total += montant
    sc.total_ht += montantHt
    sc.count += 1

    if (!sc._fournMap.has(fournisseur)) {
      sc._fournMap.set(fournisseur, {
        fournisseur,
        total: 0,
        total_ht: 0,
        count: 0,
        transactionIds: []
      })
    }
    const f = sc._fournMap.get(fournisseur)
    f.total += montant
    f.total_ht += montantHt
    f.count += 1
    if (t.id) f.transactionIds.push(t.id)
  }

  return Object.values(buckets).map(m => ({
    macroCat: m.macroCat,
    total: m.total,
    total_ht: m.total_ht,
    count: m.count,
    categoriesPL: Array.from(m._catMap.values())
      .map(c => ({
        cat: c.cat,
        label: c.label,
        total: c.total,
        total_ht: c.total_ht,
        count: c.count,
        sousCategories: Array.from(c._sousMap.values())
          .map(sc => ({
            sousCat: sc.sousCat,
            label: sc.label,
            total: sc.total,
            total_ht: sc.total_ht,
            count: sc.count,
            fournisseurs: Array.from(sc._fournMap.values())
              .sort((a, b) => b.total - a.total)
          }))
          .sort((a, b) => b.total - a.total)
      }))
      .sort((a, b) => b.total - a.total)
  })).sort((a, b) => b.total - a.total)
}

// Agrégation flat par fournisseur — utile pour les variations niveau 4 sans
// rebâtir la hiérarchie complète sur la période précédente.
export function agregerParFournisseur(transactions) {
  const map = new Map()
  for (const t of transactions || []) {
    const f = t.fournisseur_nom || '(Sans nom)'
    map.set(f, (map.get(f) || 0) + (t.montant_ttc || 0))
  }
  return map
}

// Applique les variations sur niveau 1 (macro-cat) et niveau 4 (fournisseur).
// L2 et L3 restent sans variation : décision V1 du 2026-04-29 (éviter le bruit
// visuel sur des agrégats intermédiaires non-actionnables).
export function appliquerVariationsHierarchie(hierarchie, mapPrecMacro, mapPrecFournisseur) {
  return hierarchie.map(m => {
    const precMacro = mapPrecMacro.get(m.macroCat) || 0
    const vMacro = computeVariation(m.total, precMacro)
    return {
      ...m,
      totalPrecedent: precMacro,
      variationPct: vMacro.pct,
      variationLabel: vMacro.label,
      categoriesPL: m.categoriesPL.map(c => ({
        ...c,
        sousCategories: c.sousCategories.map(sc => ({
          ...sc,
          fournisseurs: sc.fournisseurs.map(f => {
            const precF = mapPrecFournisseur.get(f.fournisseur) || 0
            const vF = computeVariation(f.total, precF)
            return {
              ...f,
              totalPrecedent: precF,
              variationPct: vF.pct,
              variationLabel: vF.label
            }
          })
        }))
      }))
    }
  })
}
