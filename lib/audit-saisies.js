// Audit de saisie quotidien — 4 règles déterministes V1 (commit 1).
// Cf. cadrage Journal 2026-04-30 (audit "10h café").
//
// Règles (toutes désactivables individuellement selon données dispo) :
//   1. detecterTrousJours      — jour ouvré sans aucune saisie (rouge)
//   2. detecterTrousCanal      — Uber 0€ alors que médiane même jour ≥ 50€ (orange)
//   3. detecterTrousCategories — pas de facture energie/loyer/redevance ce mois (orange)
//   4. detecterAnomaliesMontant — montant fournisseur > 50% écart médiane et > 100€ (orange)
//
// Convention `parametres.jours_fermes_semaine` : array int[] 0-6 (0=dimanche, 6=samedi)
// = convention JS standard `Date.getDay()`.
//
// Convention clé `audits_ignores.cle` :
//   trou_jour       → 'YYYY-MM-DD'
//   trou_canal      → 'YYYY-MM-DD+canal'
//   trou_categorie  → 'YYYY-MM+categorie'
//   anomalie_montant → transaction_id (uuid)

import { parseISO, format, eachDayOfInterval } from 'date-fns'

// Helpers ──────────────────────────────────────────────────────────────

// Médiane robuste sur petits échantillons. Filtre null/undefined/NaN.
// Tableau vide → null (caller gère = règle désactivée).
export function mediane(arr) {
  const sorted = [...(arr || [])]
    .filter(v => v != null && Number.isFinite(v))
    .sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function buildIgnoresSet(ignores) {
  const set = new Set()
  for (const ig of (ignores || [])) {
    set.add(ig.type + '|' + ig.cle)
  }
  return set
}

function estIgnore(ignSet, type, cle) {
  return ignSet.has(type + '|' + cle)
}

function formatDateFr(dateISO) {
  try {
    const d = parseISO(dateISO)
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  } catch {
    return dateISO
  }
}

// Sous-catégorie la plus fréquente pour une catégorie donnée (préremplissage FAB).
function sousCatPlusFrequente(transactions, categorie) {
  const counts = {}
  for (const t of (transactions || [])) {
    if (t.categorie_pl !== categorie) continue
    const sc = t.sous_categorie
    if (!sc) continue
    counts[sc] = (counts[sc] || 0) + 1
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return entries.length > 0 ? entries[0][0] : null
}

// Règle 1 : trous de jours ─────────────────────────────────────────────
// Pour chaque jour entre `since` et `today` (inclus), si pas fermé et aucune saisie → alerte.
// Désactive si `joursFermesSemaine` vide/null (sinon false positives garantis).
export function detecterTrousJours({
  since, today,
  historique, transactions, entrees,
  joursFermesSemaine,
  ignores
}) {
  if (!joursFermesSemaine || joursFermesSemaine.length === 0) {
    return { alertes: [], desactive: 'jours_fermes_non_configures' }
  }

  const ignSet = buildIgnoresSet(ignores)
  const datesSaisies = new Set()

  for (const h of (historique || [])) {
    if ((h.ca_brut || 0) > 0) datesSaisies.add(h.date)
  }
  for (const t of (transactions || [])) {
    if (t.date) datesSaisies.add(t.date)
  }
  for (const e of (entrees || [])) {
    if (e.date) datesSaisies.add(e.date)
  }

  const alertes = []
  const jours = eachDayOfInterval({ start: parseISO(since), end: parseISO(today) })

  for (const d of jours) {
    const dateISO = format(d, 'yyyy-MM-dd')
    const dow = d.getDay()
    if (joursFermesSemaine.includes(dow)) continue
    if (datesSaisies.has(dateISO)) continue
    if (estIgnore(ignSet, 'trou_jour', dateISO)) continue

    alertes.push({
      type: 'trou_jour',
      criticite: 'rouge',
      cle: dateISO,
      date: dateISO,
      titre: formatDateFr(dateISO) + ' : aucune saisie',
      sousTexte: "Pas de CA, pas de dépense, pas d'entrée",
      cta: { mode: 'depense', date: dateISO }
    })
  }

  return { alertes }
}

// Règle 2 : trous de canal Uber ────────────────────────────────────────
// Pour chaque jour de la période où uber=0, si médiane même jour de semaine
// (4 derniers, hors zéros) ≥ 50€ → alerte.
export function detecterTrousCanal({
  since, today,
  historique,
  ignores
}) {
  const ignSet = buildIgnoresSet(ignores)

  // Pré-calcul : pour chaque jour de semaine, les uber > 0 triés par date desc
  const ubersByDow = [[], [], [], [], [], [], []]
  for (const h of (historique || [])) {
    if (!h.date || (h.uber || 0) <= 0) continue
    const d = parseISO(h.date)
    ubersByDow[d.getDay()].push({ date: h.date, uber: h.uber })
  }

  // Médianes par dow sur les 4 plus récents (acceptable approximation V1)
  const medianesByDow = {}
  for (let dow = 0; dow < 7; dow++) {
    const samples = ubersByDow[dow]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4)
      .map(s => s.uber)
    medianesByDow[dow] = samples.length >= 4 ? mediane(samples) : null
  }

  // Index uber par date
  const uberParDate = {}
  for (const h of (historique || [])) {
    if (h.date) uberParDate[h.date] = h.uber || 0
  }

  const alertes = []
  const jours = eachDayOfInterval({ start: parseISO(since), end: parseISO(today) })

  for (const d of jours) {
    const dateISO = format(d, 'yyyy-MM-dd')
    const dow = d.getDay()
    const med = medianesByDow[dow]
    if (med == null || med < 50) continue

    const uberJour = uberParDate[dateISO] || 0
    if (uberJour > 0) continue

    const cle = dateISO + '+uber'
    if (estIgnore(ignSet, 'trou_canal', cle)) continue

    alertes.push({
      type: 'trou_canal',
      criticite: 'orange',
      cle,
      date: dateISO,
      canal: 'uber',
      titre: formatDateFr(dateISO) + ' : Uber 0 €',
      sousTexte: 'Habituellement ~' + Math.round(med) + ' € ce jour de la semaine',
      cta: { mode: 'entree', date: dateISO, source: 'uber_eats' }
    })
  }

  return { alertes }
}

// Règle 3 : trous de catégorie charges fixes mensuelles ────────────────
// Pour chaque catégorie cible, si présente dans ≥ 3/6 mois ET absente ce mois
// ET today.day >= 15 → alerte.
const CATEGORIES_CIBLES_TROUS = ['energie', 'loyers_charges', 'redevance_marque']
const LABELS_CATEGORIES = {
  energie: 'Énergie',
  loyers_charges: 'Loyer',
  redevance_marque: 'Redevance'
}

export function detecterTrousCategories({
  today,
  transactionsHistorique,
  ignores
}) {
  const todayDate = parseISO(today)
  if (todayDate.getDate() < 15) {
    return { alertes: [], desactive: 'avant_J15' }
  }

  const ignSet = buildIgnoresSet(ignores)
  const moisCourant = format(todayDate, 'yyyy-MM')

  // Index par mois × catégorie : présente ou non
  const moisParCategorie = {}
  for (const cat of CATEGORIES_CIBLES_TROUS) {
    moisParCategorie[cat] = new Set()
  }
  for (const t of (transactionsHistorique || [])) {
    if (!t.date || !t.categorie_pl) continue
    if (!CATEGORIES_CIBLES_TROUS.includes(t.categorie_pl)) continue
    const mois = t.date.slice(0, 7)
    moisParCategorie[t.categorie_pl].add(mois)
  }

  const alertes = []
  for (const cat of CATEGORIES_CIBLES_TROUS) {
    const moisPresence = moisParCategorie[cat]
    const moisHorsCourant = Array.from(moisPresence).filter(m => m !== moisCourant)
    const presentCeMois = moisPresence.has(moisCourant)
    if (presentCeMois) continue
    if (moisHorsCourant.length < 3) continue // pas assez d'historique pour conclure

    const cle = moisCourant + '+' + cat
    if (estIgnore(ignSet, 'trou_categorie', cle)) continue

    const sousCatSugg = sousCatPlusFrequente(transactionsHistorique, cat)

    alertes.push({
      type: 'trou_categorie',
      criticite: 'orange',
      cle,
      mois: moisCourant,
      categorie: cat,
      titre: LABELS_CATEGORIES[cat] + ' : pas de facture ce mois',
      sousTexte: 'Habituellement présente (' + moisHorsCourant.length + ' mois sur 6)',
      cta: {
        mode: 'depense',
        date: today,
        categorie: cat,
        sous_categorie: sousCatSugg || undefined
      }
    })
  }

  return { alertes }
}

// Règle 4 : anomalies montant fournisseur ──────────────────────────────
// Pour chaque transaction de la période, si écart à la médiane des 6 derniers
// achats de ce fournisseur > 50% ET > 100€ → alerte.
export function detecterAnomaliesMontant({
  since, until,
  transactionsHistorique,
  ignores
}) {
  const ignSet = buildIgnoresSet(ignores)

  // Index transactions par fournisseur, triées date desc
  const parFournisseur = {}
  for (const t of (transactionsHistorique || [])) {
    if (!t.fournisseur_nom) continue
    if (!parFournisseur[t.fournisseur_nom]) parFournisseur[t.fournisseur_nom] = []
    parFournisseur[t.fournisseur_nom].push(t)
  }
  for (const f of Object.keys(parFournisseur)) {
    parFournisseur[f].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }

  const alertes = []

  // Pour chaque transaction de la période
  for (const t of (transactionsHistorique || [])) {
    if (!t.date || t.date < since || t.date > until) continue

    const allByFournisseur = parFournisseur[t.fournisseur_nom] || []
    // 6 transactions les plus récentes de ce fournisseur AVANT cette transaction
    const reference = allByFournisseur
      .filter(x => x.id !== t.id && (x.date || '') < t.date)
      .slice(0, 6)
      .map(x => x.montant_ttc || 0)

    if (reference.length < 6) continue // historique insuffisant

    const med = mediane(reference)
    if (med == null || med <= 0) continue

    const ecartAbs = Math.abs((t.montant_ttc || 0) - med)
    const ecartRel = ecartAbs / med

    if (ecartRel <= 0.5) continue
    if (ecartAbs <= 100) continue

    const cle = t.id
    if (estIgnore(ignSet, 'anomalie_montant', cle)) continue

    const direction = (t.montant_ttc || 0) > med ? 'hausse' : 'baisse'
    alertes.push({
      type: 'anomalie_montant',
      criticite: 'orange',
      cle,
      transaction_id: t.id,
      date: t.date,
      fournisseur_nom: t.fournisseur_nom,
      montant_ttc: t.montant_ttc,
      mediane: Math.round(med),
      titre: t.fournisseur_nom + ' : montant inhabituel',
      sousTexte: Math.round(t.montant_ttc) + ' € · habituellement ~' + Math.round(med) + ' € (' + direction + ')',
      cta: { mode: 'view_transaction', transaction_id: t.id }
    })
  }

  return { alertes }
}

// Composeur principal ──────────────────────────────────────────────────
// Appelle les 4 règles et trie les alertes par criticité (rouge en haut).
export function auditerJournal({
  since, today,
  historique, transactions, entrees,
  transactionsHistorique,
  joursFermesSemaine,
  ignores
}) {
  const trousJours = detecterTrousJours({
    since, today, historique, transactions, entrees, joursFermesSemaine, ignores
  })
  const trousCanal = detecterTrousCanal({
    since, today, historique, ignores
  })
  const trousCateg = detecterTrousCategories({
    today, transactionsHistorique, ignores
  })
  const anomalies = detecterAnomaliesMontant({
    since, until: today, transactionsHistorique, ignores
  })

  const alertes = [
    ...(trousJours.alertes || []),
    ...(trousCanal.alertes || []),
    ...(trousCateg.alertes || []),
    ...(anomalies.alertes || [])
  ]

  alertes.sort((a, b) => {
    if (a.criticite === 'rouge' && b.criticite !== 'rouge') return -1
    if (a.criticite !== 'rouge' && b.criticite === 'rouge') return 1
    return (a.date || '').localeCompare(b.date || '')
  })

  return {
    alertes,
    nbCritiques: alertes.filter(a => a.criticite === 'rouge').length,
    nbAttention: alertes.filter(a => a.criticite === 'orange').length,
    desactivations: {
      trousJours: trousJours.desactive || null,
      trousCanal: trousCanal.desactive || null,
      trousCateg: trousCateg.desactive || null,
      anomalies: anomalies.desactive || null
    }
  }
}

// Version optimisée pour le dashboard : juste un count (court-circuit possible).
// Réutilise les mêmes inputs que `auditerJournal`.
export function compterAlertesRapide(args) {
  const r = auditerJournal(args)
  return {
    nbTotal: r.alertes.length,
    nbCritiques: r.nbCritiques,
    nbAttention: r.nbAttention
  }
}

// ─────────────────────────────────────────────────────────────────────
// Calendrier 4 états — evaluerJour + médianes Uber par jour de semaine
// ─────────────────────────────────────────────────────────────────────

// Pré-calcule 7 médianes Uber (une par jour de semaine, 0=dimanche...6=samedi)
// sur les 4 plus récents même_jour_semaine, hors zéros.
// Si < 4 occurrences pour un dow → null (Uber pas attendu ce dow).
export function calculerMediansUberParJourSemaine(historique6Mois) {
  const ubersByDow = [[], [], [], [], [], [], []]
  for (const h of (historique6Mois || [])) {
    if (!h.date || (h.uber || 0) <= 0) continue
    const dow = new Date(h.date + 'T12:00:00').getDay()
    ubersByDow[dow].push({ date: h.date, uber: h.uber })
  }
  const result = [null, null, null, null, null, null, null]
  for (let dow = 0; dow < 7; dow++) {
    const samples = ubersByDow[dow]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4)
      .map(s => s.uber)
    result[dow] = samples.length >= 4 ? mediane(samples) : null
  }
  return result
}

// Évalue l'état d'un jour pour le calendrier heat-map (4 états).
// Cf. décision Mounir 2026-04-30 : reintroduction de l'état 'partiel'.
//
// Règles V1 (canaux attendus) :
//   - CA caisse : toujours attendu (canal principal du restaurant)
//   - Uber Eats : attendu si médiane même jour de semaine ≥ 50€
//
// Retour :
//   - 'ferme'     : jour fermé (jours_fermes_semaine)
//   - 'manquant'  : aucune saisie alors que jour ouvré
//   - 'partiel'   : au moins 1 saisie ET au moins 1 canal attendu manquant
//                   (en V1 = Uber attendu mais 0€)
//   - 'complet'   : tous les canaux attendus présents
//
// `detail` exposé pour alimenter le PanneauDetailJour côté client (pas de
// re-fetch côté client, tout est pré-calculé côté serveur).
export function evaluerJour({ jour, transactions, entrees, historique, joursFermesSemaine, mediansUberParJourSemaine }) {
  const dateJS = new Date(jour + 'T12:00:00')
  const dow = dateJS.getDay()

  if (joursFermesSemaine && joursFermesSemaine.includes(dow)) {
    return { etat: 'ferme', detail: null }
  }

  const histJour = (historique || []).find(h => h.date === jour) || null
  const txJour = (transactions || []).filter(t => t.date === jour)
  const entreesJour = (entrees || []).filter(e => e.date === jour)

  const caCaisse = histJour ? (histJour.ca_brut || 0) : 0
  const especes = histJour ? (histJour.especes || 0) : 0
  const uberEatsHist = histJour ? (histJour.uber || 0) : 0
  const uberEatsManuel = entreesJour
    .filter(e => e.source === 'uber_eats')
    .reduce((s, e) => s + (e.montant_ttc || 0), 0)
  const uberEats = uberEatsHist + uberEatsManuel
  const depensesTotal = txJour.reduce((s, t) => s + (t.montant_ttc || 0), 0)
  const resultat = caCaisse + uberEats - depensesTotal

  const detail = {
    caCaisse,
    especes,
    uberEats,
    depenses: txJour,
    resultat
  }

  const aucuneSaisie =
    caCaisse === 0 &&
    especes === 0 &&
    uberEats === 0 &&
    txJour.length === 0 &&
    entreesJour.length === 0

  if (aucuneSaisie) {
    return { etat: 'manquant', detail }
  }

  // Uber attendu ce jour ?
  const medianeUber = mediansUberParJourSemaine ? mediansUberParJourSemaine[dow] : null
  const uberAttendu = medianeUber != null && medianeUber >= 50

  if (uberAttendu && uberEats === 0) {
    return { etat: 'partiel', detail }
  }

  return { etat: 'complet', detail }
}
