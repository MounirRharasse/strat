// V1 : Restaurant = Caisse + Foxorder (bornes), Livraisons = Uber Eats.
// Préempte la stratégie Sources (STRAT_CADRAGE.md §3.2). En V1.2+ quand la table
// `sources` existe, remplacer cette logique par une lecture dynamique.
//
// Vocabulaire UI : seuls "restaurant" et "livraisons" sont exposés en surface.
// "foxorder" en interne (héritage Popina category 'FOXORDERS') ne doit jamais
// apparaître dans l'UI (charte §8 STRAT_CADRAGE).
export function regrouperCanaux(kpisCa) {
  const restaurant = (kpisCa?.caisse || 0) + (kpisCa?.foxorder || 0)
  const livraisons = kpisCa?.uber || 0
  const total = restaurant + livraisons
  return {
    restaurant,
    livraisons,
    total,
    pctRestaurant: total > 0 ? Math.round(restaurant / total * 100) : 0,
    pctLivraisons: total > 0 ? Math.round(livraisons / total * 100) : 0,
  }
}
