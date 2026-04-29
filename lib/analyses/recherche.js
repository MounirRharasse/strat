// Normalise une chaîne pour comparaison insensible aux accents et à la casse.
// Ex. 'Épicerie' → 'epicerie', 'Crédit' → 'credit'.
export function normalize(str) {
  return (str || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

// Filtre la hiérarchie pour ne garder que les nœuds qui matchent ou contiennent
// un descendant qui matche. Match permissif sur macroCat, label cat, slug cat,
// label sous-cat, slug sous-cat, nom fournisseur (tous normalisés).
//
// Si query vide ou whitespace-only : retourne hierarchie inchangée.
//
// Quand un parent matche, tous ses descendants sont conservés. Ex : "personnel"
// matche le macroCat → tous les fournisseurs de Personnel restent visibles.
export function matchHierarchie(hierarchie, query) {
  const q = normalize(query)
  if (!q) return hierarchie

  return hierarchie
    .map(macro => {
      const macroMatch = normalize(macro.macroCat).includes(q)

      const cats = (macro.categoriesPL || [])
        .map(cat => {
          const catMatch =
            normalize(cat.label).includes(q) || normalize(cat.cat).includes(q)

          const sousCats = (cat.sousCategories || [])
            .map(sc => {
              const scMatch =
                normalize(sc.label).includes(q) || normalize(sc.sousCat || '').includes(q)

              const fournisseurs = (sc.fournisseurs || []).filter(f =>
                macroMatch || catMatch || scMatch || normalize(f.fournisseur).includes(q)
              )

              if (scMatch || fournisseurs.length > 0) {
                return { ...sc, fournisseurs }
              }
              return null
            })
            .filter(Boolean)

          if (catMatch || sousCats.length > 0) {
            return { ...cat, sousCategories: sousCats }
          }
          return null
        })
        .filter(Boolean)

      if (macroMatch || cats.length > 0) {
        return { ...macro, categoriesPL: cats }
      }
      return null
    })
    .filter(Boolean)
}
