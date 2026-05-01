// Calcule le food cost mensuel sur 6 mois calendaires glissants jusqu'au mois
// de la date `until` (incluse, possiblement partielle).
//
// Numérateur : SUM(transactions consommations.montant_ht) par mois
// Dénominateur : SUM(historique_ca.ca_ht) + Uber HT (historique_ca.uber + entrees uber_eats) par mois
//
// Retourne [{ mois, achats, caHT, foodCost }, ...] dans l'ordre chronologique
// (mois M-5 → mois M). foodCost = 0 si caHT du mois est nul.
import { TVA_UBER_EATS } from '@/lib/data/constants'

export function calculerFoodCost6Mois(transactions, historiqueCa, until, entreesUber) {
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
      caParMois[ym] += (r.ca_ht || 0) + (r.uber || 0) / TVA_UBER_EATS
    }
  }
  for (const e of (entreesUber || [])) {
    if (e.source !== 'uber_eats') continue
    const ym = (e.date || '').slice(0, 7)
    if (caParMois[ym] !== undefined) {
      caParMois[ym] += (e.montant_ttc || 0) / TVA_UBER_EATS
    }
  }

  return mois.map(m => ({
    mois: m,
    achats: achatsParMois[m],
    caHT: caParMois[m],
    foodCost: caParMois[m] > 0 ? (achatsParMois[m] / caParMois[m]) * 100 : 0
  }))
}
