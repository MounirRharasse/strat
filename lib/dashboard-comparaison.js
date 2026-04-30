// Label dynamique de variation pour le HERO Dashboard, adapté à la période
// sélectionnée. Branché sur lib/periods.js (filtreId + nbJours + since).
//
// Cf. STRAT_CADRAGE.md §8 (vocabulaire fr) + décisions V1 du 2026-04-29.
export function getLabelVariation(periode) {
  if (!periode || typeof periode !== 'object') return 'vs période précédente'
  switch (periode.filtreId) {
    case 'aujourdhui':
    case 'hier':
      return 'vs même jour S-1'
    case 'cette-semaine':
      return 'vs sem-1'
    case 'semaine-derniere':
      return 'vs S-2'
    case 'ce-mois':
      return 'vs mois dernier (à J' + (periode.nbJours || '?') + ')'
    case 'mois-dernier':
      return 'vs M-2'
    case 'derniers-30-jours':
      return "vs 30 jours d'avant"
    case 'cette-annee': {
      const annee = parseInt((periode.since || '').slice(0, 4))
      return Number.isFinite(annee) ? 'vs ' + (annee - 1) + ' à date' : 'vs année précédente'
    }
    default:
      return 'vs période précédente'
  }
}
