/**
 * lib/periods.js — calculs de périodes pour les 9 filtres V1
 *
 * Lib pure : aucun accès Supabase, Popina ou réseau. Toutes les fonctions sont
 * déterministes étant donné (timezone, refDate).
 *
 * Conventions structurantes :
 *
 *  - Format des dates : strings ISO 'YYYY-MM-DD'.
 *  - Sémantique INCLUSIVE de `until` : compatible Postgres BETWEEN.
 *    Exemple : { since: '2026-04-20', until: '2026-04-26' } couvre les 7 jours
 *    du lundi 20 au dimanche 26 INCLUS.
 *  - Granularité : jour. Pas d'heure ni de minute.
 *  - Semaine commence le LUNDI (convention France / ISO 8601).
 *  - Timezone : passée en argument explicite, pas de magie cachée.
 *  - refDate : optionnel (défaut new Date()). Permet les tests déterministes
 *    et un usage futur "Cette semaine d'il y a 3 mois".
 *
 * Format de retour :
 *   {
 *     since: 'YYYY-MM-DD',
 *     until: 'YYYY-MM-DD',           // INCLUSIVE
 *     label: 'Cette semaine',         // depuis LABELS_FILTRES
 *     nbJours: 7,                     // pour comparaisons à durée égale
 *     filtreId: 'cette-semaine'       // kebab-case, sérialisable
 *   }
 */

import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  subDays,
  addDays,
  subWeeks,
  subMonths,
  subYears,
  differenceInCalendarDays
} from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

export const LABELS_FILTRES = {
  'aujourdhui': "Aujourd'hui",
  'hier': 'Hier',
  'cette-semaine': 'Cette semaine',
  'semaine-derniere': 'Semaine dernière',
  'ce-mois': 'Ce mois',
  'mois-dernier': 'Mois dernier',
  'derniers-30-jours': '30 derniers jours',
  'cette-annee': 'Cette année',
  'personnalise': 'Personnalisé'
}

// Throw si tz n'est pas un string non vide ou si Intl ne la reconnaît pas.
function validerTimezone(tz) {
  if (typeof tz !== 'string' || tz.length === 0) {
    throw new Error(`Timezone invalide: ${tz}`)
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    throw new Error(`Timezone invalide: ${tz}`)
  }
}

// Convertit refDate (Date ou ISO string) en string YYYY-MM-DD dans la timezone.
function dateLocale(refDate, timezone) {
  const date = refDate instanceof Date ? refDate : new Date(refDate)
  return formatInTimeZone(date, timezone, 'yyyy-MM-dd')
}

// Nombre de jours entre 2 dates ISO inclusives (since=until → 1 jour).
function nbJoursInclusif(since, until) {
  return differenceInCalendarDays(parseISO(until), parseISO(since)) + 1
}

// Construit l'objet de retour à partir d'un filtreId et de bornes.
function buildPeriode(filtreId, since, until) {
  return {
    since,
    until,
    label: LABELS_FILTRES[filtreId],
    nbJours: nbJoursInclusif(since, until),
    filtreId
  }
}

export function getAujourdhui({ timezone, refDate = new Date() } = {}) {
  validerTimezone(timezone)
  const today = dateLocale(refDate, timezone)
  return buildPeriode('aujourdhui', today, today)
}

export function getHier({ timezone, refDate = new Date() } = {}) {
  validerTimezone(timezone)
  const today = dateLocale(refDate, timezone)
  const yesterday = format(subDays(parseISO(today), 1), 'yyyy-MM-dd')
  return buildPeriode('hier', yesterday, yesterday)
}

export function getCetteSemaine({ timezone, refDate = new Date() } = {}) {
  validerTimezone(timezone)
  const today = dateLocale(refDate, timezone)
  const lundi = format(
    startOfWeek(parseISO(today), { weekStartsOn: 1 }),
    'yyyy-MM-dd'
  )
  return buildPeriode('cette-semaine', lundi, today)
}

export function getSemaineDerniere({ timezone, refDate = new Date() } = {}) {
  validerTimezone(timezone)
  const today = dateLocale(refDate, timezone)
  const lundiSemDerniere = format(
    subWeeks(startOfWeek(parseISO(today), { weekStartsOn: 1 }), 1),
    'yyyy-MM-dd'
  )
  const dimancheSemDerniere = format(
    endOfWeek(parseISO(lundiSemDerniere), { weekStartsOn: 1 }),
    'yyyy-MM-dd'
  )
  return buildPeriode('semaine-derniere', lundiSemDerniere, dimancheSemDerniere)
}

export function getCeMois({ timezone, refDate = new Date() } = {}) {
  validerTimezone(timezone)
  const today = dateLocale(refDate, timezone)
  const debutMois = format(startOfMonth(parseISO(today)), 'yyyy-MM-dd')
  return buildPeriode('ce-mois', debutMois, today)
}

export function getMoisDernier({ timezone, refDate = new Date() } = {}) {
  validerTimezone(timezone)
  const today = dateLocale(refDate, timezone)
  const debutMoisDernier = format(
    startOfMonth(subMonths(parseISO(today), 1)),
    'yyyy-MM-dd'
  )
  const finMoisDernier = format(
    endOfMonth(parseISO(debutMoisDernier)),
    'yyyy-MM-dd'
  )
  return buildPeriode('mois-dernier', debutMoisDernier, finMoisDernier)
}

export function getDerniers30Jours({ timezone, refDate = new Date() } = {}) {
  validerTimezone(timezone)
  const today = dateLocale(refDate, timezone)
  const ilYa29Jours = format(subDays(parseISO(today), 29), 'yyyy-MM-dd')
  return buildPeriode('derniers-30-jours', ilYa29Jours, today)
}

export function getCetteAnnee({ timezone, refDate = new Date() } = {}) {
  validerTimezone(timezone)
  const today = dateLocale(refDate, timezone)
  const debutAnnee = format(startOfYear(parseISO(today)), 'yyyy-MM-dd')
  return buildPeriode('cette-annee', debutAnnee, today)
}

// Mapping filtreId → fonction publique correspondante.
// 'personnalise' n'est PAS inclus (signature différente : nécessite since + until).
const FILTRES_FONCTIONS = {
  'aujourdhui': getAujourdhui,
  'hier': getHier,
  'cette-semaine': getCetteSemaine,
  'semaine-derniere': getSemaineDerniere,
  'ce-mois': getCeMois,
  'mois-dernier': getMoisDernier,
  'derniers-30-jours': getDerniers30Jours,
  'cette-annee': getCetteAnnee
}

/**
 * Dispatche vers la fonction de filtre correspondant à filtreId.
 * Permet d'utiliser un filtreId venu de l'URL sans dupliquer le switch.
 * Throw si filtreId est inconnu (incluant 'personnalise', qui a sa propre signature).
 */
export function getPeriodeFromFiltreId(filtreId, { timezone, refDate } = {}) {
  const fn = FILTRES_FONCTIONS[filtreId]
  if (!fn) {
    throw new Error(`filtreId inconnu: ${filtreId}`)
  }
  return fn({ timezone, refDate })
}

export function getPeriodePersonnalisee({ since, until, timezone }) {
  validerTimezone(timezone)
  if (typeof since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    throw new Error(`Date since invalide: ${since}`)
  }
  if (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    throw new Error(`Date until invalide: ${until}`)
  }
  if (since > until) {
    throw new Error(`Période invalide: since (${since}) postérieur à until (${until})`)
  }
  return buildPeriode('personnalise', since, until)
}

/**
 * Retourne la période précédente à durée égale (Option B — alignement calendaire).
 *
 * Pour les filtres alignés sur un calendrier (cette-semaine, semaine-derniere,
 * ce-mois, mois-dernier, cette-annee) : retourne les N premiers jours de
 * l'unité calendaire précédente correspondante.
 *
 * Pour les filtres glissants ou ouverts (aujourdhui, hier, derniers-30-jours,
 * personnalise) : retourne les N jours immédiatement avant la période donnée.
 *
 * Cas limite : pour mois-dernier, si le mois encore avant est plus court
 * (ex. mars 31j → précédent calé sur février qui a 28-29j), la période peut
 * déborder sur le mois suivant pour conserver les N jours. Comportement
 * délibéré pour préserver la durée égale.
 *
 * Le label retourné est générique ('Période précédente') pour ne pas dépendre
 * d'une logique de présentation. Le caller est libre de surcharger.
 */
export function periodePrecedenteAEgaleDuree(periode) {
  if (
    !periode ||
    typeof periode !== 'object' ||
    typeof periode.since !== 'string' ||
    typeof periode.until !== 'string' ||
    typeof periode.filtreId !== 'string'
  ) {
    throw new Error(`Période invalide: ${JSON.stringify(periode)}`)
  }
  const nbJours = periode.nbJours || nbJoursInclusif(periode.since, periode.until)

  let newSince, newUntil

  switch (periode.filtreId) {
    case 'cette-semaine':
    case 'semaine-derniere': {
      const lundiPrecedent = format(
        subWeeks(parseISO(periode.since), 1),
        'yyyy-MM-dd'
      )
      newSince = lundiPrecedent
      newUntil = format(addDays(parseISO(lundiPrecedent), nbJours - 1), 'yyyy-MM-dd')
      break
    }
    case 'ce-mois':
    case 'mois-dernier': {
      const debutMoisPrecedent = format(
        startOfMonth(subMonths(parseISO(periode.since), 1)),
        'yyyy-MM-dd'
      )
      newSince = debutMoisPrecedent
      newUntil = format(addDays(parseISO(debutMoisPrecedent), nbJours - 1), 'yyyy-MM-dd')
      break
    }
    case 'cette-annee': {
      const debutAnneePrecedente = format(
        startOfYear(subYears(parseISO(periode.since), 1)),
        'yyyy-MM-dd'
      )
      newSince = debutAnneePrecedente
      newUntil = format(addDays(parseISO(debutAnneePrecedente), nbJours - 1), 'yyyy-MM-dd')
      break
    }
    case 'aujourdhui':
    case 'hier':
    case 'derniers-30-jours':
    case 'personnalise':
    default: {
      newUntil = format(subDays(parseISO(periode.since), 1), 'yyyy-MM-dd')
      newSince = format(subDays(parseISO(newUntil), nbJours - 1), 'yyyy-MM-dd')
      break
    }
  }

  return {
    since: newSince,
    until: newUntil,
    label: 'Période précédente',
    nbJours,
    filtreId: `${periode.filtreId}-precedente`
  }
}
