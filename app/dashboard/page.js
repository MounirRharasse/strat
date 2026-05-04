import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'
import { getPeriodeFromFiltreId, periodePrecedenteAEgaleDuree, getCeMois } from '@/lib/periods'
import { getAnalysesKPIs } from '@/lib/data/analyses-kpis'
import { getLabelVariation } from '@/lib/dashboard-comparaison'
import { regrouperCanaux } from '@/lib/canaux'
import { decomposerParSousCategorie, topFournisseursConsommations } from '@/lib/food-cost-decomposition'
import { calculerFoodCost6Mois } from '@/lib/food-cost-historique'
import {
  CATEGORIES_CHARGES_FIXES,
  filtrer30j,
  calculerSeuil,
  calculerProjection,
  computeStatutSeuil,
  decomposerChargesFixes30j,
  calculerCouverture6Mois
} from '@/lib/seuil-rentabilite'
import { compterAlertesRapide } from '@/lib/audit-saisies'
import {
  getDerniereDateAvecCreatedAt,
  getRowsCompatHCA,
  getCaHtSomme,
  SOURCE_UBER_EATS_ID,
} from '@/lib/data/ventes'
import { getBriefSemaine, getSemainePrecedente } from '@/lib/ia-brief'
import { getInsightDuJour } from '@/lib/ia-insight'
import { formatInTimeZone } from 'date-fns-tz'
import { parseISO } from 'date-fns'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

// Filtres considérés "dans le mois courant" — seuls cas où le sous-bloc
// "Reste à faire ce mois" du HERO a du sens (cf. décision B2 du 2026-04-29).
const FILTRES_DANS_MOIS_COURANT = ['aujourdhui', 'hier', 'cette-semaine', 'ce-mois', 'derniers-30-jours']

function computeVariation(actuel, precedent) {
  if (precedent === 0 && actuel > 0) return { pct: null, label: 'Nouveau' }
  if (precedent === 0 && actuel === 0) return { pct: null, label: '—' }
  return { pct: ((actuel - precedent) / precedent) * 100, label: null }
}

export default async function Dashboard({ searchParams }) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    redirect('/login')
  }

  const { data: params } = await supabase
    .from('parametres')
    .select('*')
    .eq('id', parametre_id)
    .single()
  const timezone = params?.timezone || 'Europe/Paris'

  const periode = searchParams?.periode || 'ce-mois'
  const periodeActuelle = getPeriodeFromFiltreId(periode, { timezone })
  const periodePrec = periodePrecedenteAEgaleDuree(periodeActuelle)
  const { since, until, label, filtreId } = periodeActuelle

  const moisCourant = getCeMois({ timezone })

  // Bornes 6 mois jusqu'au mois courant (today), indépendant du filtre.
  // Le contexte historique de la sparkline doit être stable, pas suivre la période sélectionnée.
  const now = new Date()
  const todayISO = now.toISOString().slice(0, 10)
  const debut6MoisDate = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const debut6Mois = debut6MoisDate.toISOString().slice(0, 10)

  // Migration étape 5 Lot 4 :
  //   - historique_ca lectures → getRowsCompatHCA (adaptateur rétro-compat).
  //   - entrees count "ce mois" → count VPS uber_eats sur la période (nb jours uber).
  //   - entrees 6 mois → reste lecture brute (auditerJournal/compterAlertesRapide consomme entrees, P1).
  //   - derniereDate → getDerniereDateAvecCreatedAt (M1).
  const [
    kpisActuel,
    kpisPrec,
    derniereDateRow,
    { data: transactionsMois },
    histMois,
    histPeriode,
    { data: transactionsPeriode },
    { data: transactionsPeriodePrec },
    { data: transactionsConso6Mois },
    histCa6Mois,
    { data: transactionsChargesFixes6Mois },
    { count: nbEntreesMois },
    { data: entrees6Mois },
    { data: ignoresAudits }
  ] = await Promise.all([
    getAnalysesKPIs({ parametre_id, since, until, parametres: params }),
    getAnalysesKPIs({ parametre_id, since: periodePrec.since, until: periodePrec.until, parametres: params }),
    getDerniereDateAvecCreatedAt(parametre_id),
    supabase
      .from('transactions')
      .select('*')
      .eq('parametre_id', parametre_id)
      .gte('date', moisCourant.since)
      .lte('date', moisCourant.until),
    getRowsCompatHCA(parametre_id, moisCourant.since, moisCourant.until),
    getRowsCompatHCA(parametre_id, since, until),
    supabase
      .from('transactions')
      .select('fournisseur_nom, sous_categorie, montant_ht, categorie_pl')
      .eq('parametre_id', parametre_id)
      .eq('categorie_pl', 'consommations')
      .gte('date', since)
      .lte('date', until),
    supabase
      .from('transactions')
      .select('fournisseur_nom, montant_ht, categorie_pl')
      .eq('parametre_id', parametre_id)
      .eq('categorie_pl', 'consommations')
      .gte('date', periodePrec.since)
      .lte('date', periodePrec.until),
    // Consommations 6 mois jusqu'à today (sparkline food cost + marge brute 30j seuil)
    supabase
      .from('transactions')
      .select('date, montant_ht')
      .eq('parametre_id', parametre_id)
      .eq('categorie_pl', 'consommations')
      .gte('date', debut6Mois)
      .lte('date', todayISO),
    // CA 6 mois jusqu'à today via adaptateur (sparkline + marge 30j seuil + audit canal Uber)
    getRowsCompatHCA(parametre_id, debut6Mois, todayISO),
    // Charges fixes 6 mois jusqu'à today (sparkline couverture seuil + 30j seuil + décomposition)
    supabase
      .from('transactions')
      .select('date, montant_ht, categorie_pl, fournisseur_nom, sous_categorie, id, montant_ttc')
      .eq('parametre_id', parametre_id)
      .in('categorie_pl', CATEGORIES_CHARGES_FIXES)
      .gte('date', debut6Mois)
      .lte('date', todayISO),
    // Count "jours uber" sur le mois courant (card Acces rapide → Journal).
    // Sémantique post-Lot 4 : nb jours avec Uber dans VPS uber_eats (vs nb saisies FAB legacy).
    supabase
      .from('ventes_par_source')
      .select('*', { count: 'exact', head: true })
      .eq('parametre_id', parametre_id)
      .eq('source_id', SOURCE_UBER_EATS_ID)
      .gte('date', moisCourant.since)
      .lte('date', moisCourant.until),
    // Entrées 6 mois (audit alertes : trous de jours, détection canal — auditerJournal P1)
    supabase
      .from('entrees')
      .select('date, source, montant_ttc')
      .eq('parametre_id', parametre_id)
      .gte('date', debut6Mois)
      .lte('date', todayISO),
    // Audits ignorés (faux positifs marqués OK par l'utilisateur — sprint Journal)
    supabase
      .from('audits_ignores')
      .select('type, cle')
      .eq('parametre_id', parametre_id)
  ])
  const derniereDate = derniereDateRow  // alias rétrocompat (était { data: derniereDate })

  // ───────────────────────────────────────────────────────────────────
  // Variations CA / Cmd / Panier
  // ───────────────────────────────────────────────────────────────────
  const variations = {
    ca: computeVariation(kpisActuel.ca.brut, kpisPrec.ca.brut),
    cmd: computeVariation(kpisActuel.frequentation.nbCommandes, kpisPrec.frequentation.nbCommandes),
    panier: computeVariation(kpisActuel.panierMoyen, kpisPrec.panierMoyen),
    label: getLabelVariation(periodeActuelle)
  }
  const variationFoodCostPts = (kpisActuel.foodCostP || 0) - (kpisPrec.foodCostP || 0)

  const canauxRegroupes = regrouperCanaux(kpisActuel.ca)

  // ───────────────────────────────────────────────────────────────────
  // Reste à faire (ce-mois et filtres dans le mois courant uniquement)
  // ───────────────────────────────────────────────────────────────────
  const objectifCA = params?.objectif_ca || 0
  const caMoisCourant = (histMois || []).reduce((s, r) => s + (r.ca_brut || 0), 0)
  const resteAFaire = (objectifCA > 0 && FILTRES_DANS_MOIS_COURANT.includes(filtreId))
    ? Math.max(0, objectifCA - caMoisCourant)
    : null

  // ───────────────────────────────────────────────────────────────────
  // Food cost — décomposition + top fournisseurs + sparkline 6 mois
  // ───────────────────────────────────────────────────────────────────
  const decompositionMatieres = decomposerParSousCategorie(transactionsPeriode || [])
  const topFournisseurs = topFournisseursConsommations(
    transactionsPeriode || [],
    transactionsPeriodePrec || [],
    5
  )
  const foodCost6Mois = calculerFoodCost6Mois(
    transactionsConso6Mois || [],
    histCa6Mois || [],
    todayISO,
    entrees6Mois || []
  )

  // ───────────────────────────────────────────────────────────────────
  // Seuil de rentabilité — 30j roulants (charges fixes + marge brute)
  // + projection ce-mois + statut + couverture 6 mois + décomposition
  // ───────────────────────────────────────────────────────────────────
  const transactionsChargesFixes30j = filtrer30j(transactionsChargesFixes6Mois || [], now)
  const transactionsConso30j = filtrer30j(transactionsConso6Mois || [], now)

  const chargesFixes30j = transactionsChargesFixes30j.reduce((s, t) => s + (t.montant_ht || 0), 0)
  const conso30j = transactionsConso30j.reduce((s, t) => s + (t.montant_ht || 0), 0)
  // Migration étape 5 Lot 4 : caHT30j via getCaHtSomme (Option X cadrage Lot 4) :
  // remplace l'agrégat manuel `histCa30j.ca_ht + uber/TVA + entrees/TVA` qui aurait
  // double-compté l'uber HT post-Lot 3 (histCa6Mois.ca_ht inclut désormais uber/TVA).
  const debut30jDate = new Date(now)
  debut30jDate.setDate(debut30jDate.getDate() - 29)
  const debut30jISO = debut30jDate.toISOString().slice(0, 10)
  const caHT30j = await getCaHtSomme(parametre_id, debut30jISO, todayISO)

  const seuilResult = calculerSeuil({ chargesFixes30j, conso30j, caHT30j, periode: periodeActuelle })
  const projectionFinMois = calculerProjection({
    caEffectif: kpisActuel.ca.brut,
    periode: periodeActuelle,
    refDate: now
  })
  const statutSeuil = computeStatutSeuil({
    filtreId,
    caEffectif: kpisActuel.ca.brut,
    seuilPeriode: seuilResult.seuilPeriode,
    projectionFinMois,
    seuilMensuel: seuilResult.seuilMensuel,
    etat: seuilResult.etat
  })
  const couverture6Mois = calculerCouverture6Mois({
    transactionsChargesFixes6Mois: transactionsChargesFixes6Mois || [],
    transactionsConso6Mois: transactionsConso6Mois || [],
    histCa6Mois: histCa6Mois || [],
    entrees6Mois: entrees6Mois || [],
    refDate: now
  })
  const decompositionChargesFixes = decomposerChargesFixes30j(transactionsChargesFixes30j)

  // Charges fixes mensuelles agrégées (mois calendaire) — gardées pour rétro-compat
  // Utilisées par la projection de ce-mois et certains affichages drill.
  const chargesFixesMensuelles = (transactionsMois || [])
    .filter(t => CATEGORIES_CHARGES_FIXES.includes(t.categorie_pl))
    .reduce((s, t) => s + t.montant_ht, 0)

  // ───────────────────────────────────────────────────────────────────
  // Acces rapide — cards contextualisées (commit 4)
  // ───────────────────────────────────────────────────────────────────
  // Marge brute "ce mois" calculée depuis transactionsMois (consommations) + histMois.ca_ht
  // Indépendant du filtre dashboard pour libellé fixe "ce mois".
  const consoMoisCourant = (transactionsMois || [])
    .filter(t => t.categorie_pl === 'consommations')
    .reduce((s, t) => s + (t.montant_ht || 0), 0)
  const caHTMoisCourant = (histMois || []).reduce((s, r) => s + (r.ca_ht || 0), 0)
  const margeBruteCeMois = caHTMoisCourant > 0
    ? ((caHTMoisCourant - consoMoisCourant) / caHTMoisCourant) * 100
    : null

  // Projection mensuelle indépendante du filtre (linéaire depuis caMoisCourant)
  const joursEcoulesMois = now.getDate()
  const joursTotalMois = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const projectionMensuelle = (caMoisCourant > 0 && joursEcoulesMois > 0)
    ? (caMoisCourant / joursEcoulesMois) * joursTotalMois
    : 0
  const deltaProjectionPct = (projectionMensuelle > 0 && objectifCA > 0)
    ? ((projectionMensuelle - objectifCA) / objectifCA) * 100
    : null

  const accesRapide = {
    nbTransactionsMois: (transactionsMois || []).length,
    nbEntreesMois: nbEntreesMois || 0,
    projectionMensuelle,
    deltaProjectionPct,
    margeBruteCeMois
  }

  // ───────────────────────────────────────────────────────────────────
  // Audit Journal — count alertes pour le bandeau dashboard (commit 3 sprint Journal)
  // Fenêtre 7 derniers jours pour le compte (alertes actionnables récentes).
  // ───────────────────────────────────────────────────────────────────
  const debut7jDate = new Date(now)
  debut7jDate.setDate(debut7jDate.getDate() - 6)
  const since7jISO = debut7jDate.toISOString().slice(0, 10)
  const allTx6Mois = [...(transactionsConso6Mois || []), ...(transactionsChargesFixes6Mois || [])]
  const auditCount = compterAlertesRapide({
    since: since7jISO,
    today: todayISO,
    historique: histCa6Mois || [],
    transactions: allTx6Mois,
    entrees: entrees6Mois || [],
    transactionsHistorique: allTx6Mois,
    joursFermesSemaine: params?.jours_fermes_semaine || [],
    ignores: ignoresAudits || []
  })

  // ───────────────────────────────────────────────────────────────────
  // Card Brief : visible uniquement Mon/Tue/Wed Europe/Paris (commit 3 IA)
  // ───────────────────────────────────────────────────────────────────
  const dateParisISO = formatInTimeZone(now, timezone, 'yyyy-MM-dd')
  const dateParis = parseISO(dateParisISO + 'T12:00:00Z')
  const dayOfWeekParis = parseInt(formatInTimeZone(now, timezone, 'i'), 10)
  let briefDisponible = null
  if ([1, 2, 3].includes(dayOfWeekParis)) {
    const semainePrecISO = getSemainePrecedente(dateParis)
    const brief = await getBriefSemaine({ parametre_id, semaine_iso: semainePrecISO })
    if (brief?.contenu) {
      const m = brief.contenu.match(/##\s*Résumé\s*\n+([^\n]+)/i)
      const accroche = m
        ? m[1].trim().split(/(?<=[.!?])\s/)[0].slice(0, 140)
        : 'Lecture de la semaine passée'
      briefDisponible = { semaine_iso: semainePrecISO, accroche }
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // Card Insight du jour : visible si signal généré pour aujourd'hui (commit 7 IA)
  // ───────────────────────────────────────────────────────────────────
  const insight = await getInsightDuJour({ parametre_id, date_ref: dateParisISO })
  let insightDisponible = null
  if (insight?.contenu) {
    insightDisponible = {
      contenu: insight.contenu,
      signal_type: insight.signal_type,
      tier: insight.tier,
      magnitude: insight.magnitude,
      generee_le: insight.generee_le,
      date_ref: dateParisISO
    }
  }

  const data = {
    label,
    since,
    until,
    ca: { brut: kpisActuel.ca.brut, ht: kpisActuel.ca.ht, tva: kpisActuel.ca.tva },
    canaux: { caisse: kpisActuel.ca.caisse, foxorder: kpisActuel.ca.foxorder, uber: kpisActuel.ca.uber },
    canauxRegroupes,
    frequentation: {
      nbCommandes: kpisActuel.frequentation.nbCommandes,
      nbCommandesUber: kpisActuel.frequentation.nbCommandesUber || 0
    },
    panierMoyen: kpisActuel.panierMoyen,
    paiements: kpisActuel.paiements,
    cashADeposer: kpisActuel.cashADeposer,
    commissions: kpisActuel.commissions,
    foodCostP: kpisActuel.foodCostP,
    foodCostMode: kpisActuel.foodCostMode,
    foodCostPeriode: kpisActuel.foodCostPeriode,
    variationFoodCostPts,
    decompositionMatieres,
    topFournisseurs,
    foodCost6Mois,
    chargesFixesMensuelles,
    seuil: {
      etat: seuilResult.etat,
      chargesFixes30j: seuilResult.chargesFixes30j || 0,
      margeBrute30j: seuilResult.margeBrute30j,
      seuilMensuel: seuilResult.seuilMensuel,
      seuilPeriode: seuilResult.seuilPeriode,
      projectionFinMois,
      statut: statutSeuil,
      couverture6Mois,
      decomposition: decompositionChargesFixes
    },
    variations,
    resteAFaire,
    accesRapide,
    auditCount,
    lastSyncDate: derniereDate?.date || null,
    historique: histPeriode || [],
    nbJours: periodeActuelle.nbJours,
    periodeActuelle: {
      filtreId: periodeActuelle.filtreId,
      since: periodeActuelle.since,
      until: periodeActuelle.until,
      label: periodeActuelle.label,
      nbJours: periodeActuelle.nbJours
    },
    briefDisponible,
    insightDisponible
  }

  return <DashboardClient data={data} params={params || {}} periode={filtreId} />
}
