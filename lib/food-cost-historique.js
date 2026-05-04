// Calcule le food cost mensuel sur 6 mois calendaires glissants jusqu'au mois
// de la date `until` (incluse, possiblement partielle).
//
// Numérateur : SUM(transactions consommations.montant_ht) par mois
// Dénominateur : SUM(rows.ca_ht) où rows vient de getRowsCompatHCA — ca_ht TOTAL
//                (popina HT + uber HT, cf. lib/data/ventes.js JSDoc).
//
// Migration étape 5 Lot 4 : retiré la double-addition `+ r.uber/TVA + entreesUber/TVA`
// qui faisait double-comptage post-Lot 3 (ca_ht inclut désormais uber).
// La signature `entreesUber` est conservée pour rétro-compat mais ignorée
// (saisies FAB Uber désormais mergées dans VPS uber_eats via étape 3-bis).
//
// Retourne [{ mois, achats, caHT, foodCost }, ...] dans l'ordre chronologique
// (mois M-5 → mois M). foodCost = 0 si caHT du mois est nul.

export function calculerFoodCost6Mois(transactions, historiqueCa, until, _entreesUber) {
  const untilDate = new Date(until)
  const mois = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(untilDate.getFullYear(), untilDate.getMonth() - i, 1)
    mois.push(d.toISOString().slice(0, 7))
  }

  const achatsParMois = {}
  const caParMois = {}
  for (const m of mois) {
    achatsParMois[m] = 0
    caParMois[m] = 0
  }

  const conso = (transactions || []).filter(t => t.categorie_pl === 'consommations' || !t.categorie_pl)
  // Note : la query SQL en amont filtre déjà categorie_pl='consommations',
  // donc le filter ici tolère les rows sans categorie_pl (cas d'une query
  // pré-filtrée qui n'inclurait pas ce champ).

  for (const t of conso) {
    const ym = (t.date || '').slice(0, 7)
    if (achatsParMois[ym] !== undefined) {
      achatsParMois[ym] += (t.montant_ht || 0)
    }
  }

  for (const r of (historiqueCa || [])) {
    const ym = (r.date || '').slice(0, 7)
    if (caParMois[ym] !== undefined) {
      caParMois[ym] += (r.ca_ht || 0)
    }
  }

  return mois.map(m => ({
    mois: m,
    achats: achatsParMois[m],
    caHT: caParMois[m],
    foodCost: caParMois[m] > 0 ? (achatsParMois[m] / caParMois[m]) * 100 : 0
  }))
}
