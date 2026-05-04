// Seuil de rentabilité — calcul, projection, statut, décomposition, sparkline.
// Cf. STRAT_CADRAGE.md §5.5 + décisions sprint dashboard 2026-04-30.
//
// Convention V1 :
// - Charges fixes 30j roulants (stable, indépendant de la période sélectionnée)
// - Marge brute 30j roulants (cohérente avec charges)
// - Seuil mensuel = chargesFixes30j / (margeBrute30j / 100)
// - Seuil par période = seuilMensuel × (nbJours / 30)
// - Projection fin de mois uniquement pour filtre 'ce-mois' (pas applicable aux autres)
//
// Liste charges fixes ÉLARGIE par rapport au commit 1 buggé (qui excluait personnel) :
// = TOUT sauf 'consommations' (qui sont les coûts variables / matières premières).

import { endOfMonth, parseISO, format } from 'date-fns'

export const CATEGORIES_CHARGES_FIXES = [
  'frais_personnel', 'autres_charges_personnel', 'frais_deplacement',
  'entretiens_reparations', 'energie', 'autres_frais_influencables',
  'loyers_charges', 'honoraires', 'redevance_marque',
  'prestations_operationnelles', 'frais_divers', 'autres_charges'
]

// Mapping categorie_pl → label de surface pour la décomposition drill.
// Personnel regroupe 3 catégories DB (cf. P&L).
const MACRO_LABELS = {
  frais_personnel: 'Personnel',
  autres_charges_personnel: 'Personnel',
  frais_deplacement: 'Personnel',
  loyers_charges: 'Loyer',
  energie: 'Énergie',
  honoraires: 'Honoraires',
  redevance_marque: 'Redevance',
  prestations_operationnelles: 'Prestations',
  entretiens_reparations: 'Entretien',
  autres_frais_influencables: 'Autres',
  frais_divers: 'Autres',
  autres_charges: 'Autres'
}

// Filtre un dataset transactions sur la fenêtre [refDate - 30j, refDate].
// refDate par défaut = today.
export function filtrer30j(transactions, refDate = new Date()) {
  const ref = typeof refDate === 'string' ? new Date(refDate) : refDate
  const debut = new Date(ref)
  debut.setDate(debut.getDate() - 30)
  const debutISO = debut.toISOString().slice(0, 10)
  const finISO = ref.toISOString().slice(0, 10)
  return (transactions || []).filter(t => {
    const d = t.date || ''
    return d >= debutISO && d <= finISO
  })
}

export function calculerSeuil({ chargesFixes30j, conso30j, caHT30j, periode }) {
  if (!chargesFixes30j || chargesFixes30j === 0) {
    return { etat: 'donnees-insuffisantes', seuilMensuel: null, seuilPeriode: null, margeBrute30j: null, chargesFixes30j: 0 }
  }

  const margeBrute30j = caHT30j > 0 ? ((caHT30j - conso30j) / caHT30j) * 100 : null

  if (margeBrute30j == null || margeBrute30j <= 0) {
    return { etat: 'marge-negative', seuilMensuel: null, seuilPeriode: null, margeBrute30j, chargesFixes30j }
  }

  const seuilMensuel = chargesFixes30j / (margeBrute30j / 100)
  const nbJours = (periode && periode.nbJours) || 30
  // Tous les filtres : seuilMensuel × (nbJours / 30).
  // Pour 'hier'/'aujourdhui' nbJours=1 → seuilJour = seuilMensuel/30.
  const seuilPeriode = seuilMensuel * (nbJours / 30)

  return {
    etat: 'ok',
    seuilMensuel,
    seuilPeriode,
    margeBrute30j,
    chargesFixes30j
  }
}

// Projection fin de mois : caEffectif extrapolé linéairement sur le nombre de jours
// total du mois. Retourne null si pas applicable (filtre ≠ ce-mois) ou pas de données.
export function calculerProjection({ caEffectif, periode, refDate = new Date() }) {
  if (!periode || periode.filtreId !== 'ce-mois') return null
  if (!caEffectif || caEffectif === 0) return null

  const joursEcoules = periode.nbJours || 1
  if (joursEcoules === 0) return null

  const ref = typeof refDate === 'string' ? parseISO(refDate) : refDate
  const finMois = endOfMonth(ref)
  const joursTotalMois = finMois.getDate()

  return (caEffectif / joursEcoules) * joursTotalMois
}

// Statut narratif :
// - ce-mois : 3 états (vert / jaune / rouge) avec projection
// - autres filtres : 2 états (vert / rouge) basés sur caEffectif vs seuilPeriode
export function computeStatutSeuil({ filtreId, caEffectif, seuilPeriode, projectionFinMois, seuilMensuel, etat }) {
  if (etat === 'donnees-insuffisantes') return 'donnees-insuffisantes'
  if (etat === 'marge-negative') return 'marge-negative'
  if (seuilPeriode == null) return 'donnees-insuffisantes'

  if (filtreId === 'ce-mois' && projectionFinMois != null && seuilMensuel != null) {
    if (caEffectif >= seuilPeriode) return 'vert'
    if (projectionFinMois >= seuilMensuel) return 'jaune'
    return 'rouge'
  }

  if (caEffectif >= seuilPeriode) return 'vert'
  return 'rouge'
}

// Décomposition charges fixes sur 30j roulants par macro-label de surface.
// Tri par total décroissant.
export function decomposerChargesFixes30j(transactions30j) {
  if (!transactions30j || transactions30j.length === 0) return []

  const buckets = new Map()
  let total = 0

  for (const t of transactions30j) {
    if (t.categorie_pl === 'consommations') continue
    const macro = MACRO_LABELS[t.categorie_pl] || 'Autres'
    if (!buckets.has(macro)) {
      buckets.set(macro, { macroLabel: macro, total: 0, count: 0 })
    }
    const b = buckets.get(macro)
    b.total += (t.montant_ht || 0)
    b.count += 1
    total += (t.montant_ht || 0)
  }

  return Array.from(buckets.values())
    .map(b => ({
      macroLabel: b.macroLabel,
      total: b.total,
      count: b.count,
      pct: total > 0 ? Math.round((b.total / total) * 100) : 0
    }))
    .sort((a, b) => b.total - a.total)
}

// Construit "YYYY-MM" à partir d'une Date en respectant la timezone locale
// (toISOString convertirait en UTC et décalerait les mois sur les fuseaux >0).
function ymLocal(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}

// Couverture mensuelle (caHT/seuilMensuel × 100) sur 6 mois calendaires
// jusqu'au mois de `refDate`. Pour chaque mois, calcul d'un seuilMensuel local
// basé sur les charges fixes ET la marge brute du mois (pas un seuil global figé).
export function calculerCouverture6Mois({
  transactionsChargesFixes6Mois,
  transactionsConso6Mois,
  histCa6Mois,
  entrees6Mois,
  refDate
}) {
  const ref = typeof refDate === 'string' ? new Date(refDate) : refDate
  const mois = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1)
    mois.push(ymLocal(d))
  }

  const chargesParMois = {}
  const consoParMois = {}
  const caParMois = {}
  for (const m of mois) {
    chargesParMois[m] = 0
    consoParMois[m] = 0
    caParMois[m] = 0
  }

  for (const t of (transactionsChargesFixes6Mois || [])) {
    const ym = (t.date || '').slice(0, 7)
    if (chargesParMois[ym] !== undefined) {
      chargesParMois[ym] += (t.montant_ht || 0)
    }
  }
  for (const t of (transactionsConso6Mois || [])) {
    const ym = (t.date || '').slice(0, 7)
    if (consoParMois[ym] !== undefined) {
      consoParMois[ym] += (t.montant_ht || 0)
    }
  }
  for (const r of (histCa6Mois || [])) {
    const ym = (r.date || '').slice(0, 7)
    if (caParMois[ym] !== undefined) {
      // Migration étape 5 Lot 4 : r.ca_ht est désormais TOTAL (popina HT + uber HT)
      // via getRowsCompatHCA. Retiré `+ r.uber/TVA_UBER_EATS` qui doublait l'uber.
      caParMois[ym] += (r.ca_ht || 0)
    }
  }
  // Boucle entrees6Mois retirée Lot 4 : saisies FAB Uber désormais dans r.ca_ht
  // via VPS uber_eats (étape 3-bis). Param entrees6Mois préservé pour rétro-compat
  // appelants V1, mais ignoré.

  return mois.map(m => {
    const caHT = caParMois[m]
    const conso = consoParMois[m]
    const charges = chargesParMois[m]
    const margeBrute = caHT > 0 ? ((caHT - conso) / caHT) * 100 : 0
    const seuilMensuel = (charges > 0 && margeBrute > 0) ? charges / (margeBrute / 100) : 0
    const couverture = seuilMensuel > 0 ? (caHT / seuilMensuel) * 100 : 0
    return {
      mois: m,
      caHT,
      conso,
      charges,
      margeBrute,
      seuilMensuel,
      couverture
    }
  })
}
