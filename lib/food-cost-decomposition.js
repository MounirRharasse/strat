// Décomposition food cost : par sous-catégorie d'achats matières premières
// + top fournisseurs Consommations sur la période avec variations.
//
// Sous-catégories aligneés sur components/FAB.js:79-90 (les 5 buckets standard
// pour categorie_pl='consommations'). V1 duplication acceptée — TODO V1.1
// consolider dans lib/labels.js.

const SOUS_CAT_LABELS_CONSOMMATIONS = {
  viande: 'Viande / poisson',
  epicerie: 'Épicerie',
  boissons: 'Boissons',
  emballages: 'Emballages',
  autres_consommations: 'Autres'
}

function computeVariation(actuel, precedent) {
  if (precedent === 0 && actuel > 0) return { pct: null, label: 'Nouveau' }
  if (precedent === 0 && actuel === 0) return { pct: null, label: '—' }
  return { pct: ((actuel - precedent) / precedent) * 100, label: null }
}

// Filtre transactions où categorie_pl === 'consommations', regroupe par
// sous_categorie, calcule pct du total. Tri par total décroissant.
export function decomposerParSousCategorie(transactions) {
  const conso = (transactions || []).filter(t => t.categorie_pl === 'consommations')
  const buckets = new Map()
  for (const t of conso) {
    const key = t.sous_categorie || '__sans__'
    if (!buckets.has(key)) {
      buckets.set(key, { sousCategorie: t.sous_categorie || '', total: 0, count: 0 })
    }
    const b = buckets.get(key)
    b.total += (t.montant_ht || 0)
    b.count += 1
  }

  const total = Array.from(buckets.values()).reduce((s, b) => s + b.total, 0)

  return Array.from(buckets.values())
    .map(b => ({
      sousCategorie: b.sousCategorie,
      label: b.sousCategorie
        ? (SOUS_CAT_LABELS_CONSOMMATIONS[b.sousCategorie] || b.sousCategorie)
        : '(Sans sous-categorie)',
      total: b.total,
      count: b.count,
      pct: total > 0 ? Math.round((b.total / total) * 100) : 0
    }))
    .sort((a, b) => b.total - a.total)
}

// Top N fournisseurs sur les transactions Consommations de la période actuelle,
// avec variation par fournisseur vs période précédente.
// Si fournisseur uniquement actuel : variationLabel = 'Nouveau'.
// Si fournisseur uniquement précédent : il n'apparaît pas (on parcourt l'actuel).
export function topFournisseursConsommations(transactionsActuel, transactionsPrec, limit = 5) {
  const consoActuel = (transactionsActuel || []).filter(t => t.categorie_pl === 'consommations')
  const consoPrec = (transactionsPrec || []).filter(t => t.categorie_pl === 'consommations')

  const mapActuel = new Map()
  const mapPrec = new Map()

  for (const t of consoActuel) {
    const f = t.fournisseur_nom || '(Sans nom)'
    mapActuel.set(f, (mapActuel.get(f) || 0) + (t.montant_ht || 0))
  }
  for (const t of consoPrec) {
    const f = t.fournisseur_nom || '(Sans nom)'
    mapPrec.set(f, (mapPrec.get(f) || 0) + (t.montant_ht || 0))
  }

  return Array.from(mapActuel.entries())
    .map(([fournisseur, total]) => {
      const totalPrec = mapPrec.get(fournisseur) || 0
      const v = computeVariation(total, totalPrec)
      return {
        fournisseur,
        total,
        totalPrec,
        variationPct: v.pct,
        variationLabel: v.label
      }
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}
