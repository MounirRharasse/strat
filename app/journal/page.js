import { supabase } from '@/lib/supabase'
import { getDailyKPIs } from '@/lib/popina'
import { getParametreIdFromSession } from '@/lib/auth'
import { getAujourdhui, getHier, getPeriodeFromFiltreId } from '@/lib/periods'
import { auditerJournal } from '@/lib/audit-saisies'
import { redirect } from 'next/navigation'
import JournalClient from './JournalClient'

export default async function Journal({ searchParams }) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    redirect('/login')
  }

  const { data: parametres } = await supabase.from('parametres').select('*').eq('id', parametre_id).single()
  const timezone = parametres?.timezone || 'Europe/Paris'

  const today = getAujourdhui({ timezone }).until
  const yesterday = getHier({ timezone }).until
  // Default = hier (séance d'audit a posteriori, le service du jour n'est pas encore terminé)
  const periode = searchParams?.periode || 'hier'
  const type = searchParams?.type || 'all'

  const { since } = getPeriodeFromFiltreId(periode, { timezone })

  // Bornes 6 mois roulants jusqu'à today (médianes Uber, fournisseurs, trous catégorie).
  // 30 jours roulants = sous-fenêtre filtrée côté code (calendrier heat-map).
  const now = new Date()
  const debut6MoisDate = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const debut6Mois = debut6MoisDate.toISOString().slice(0, 10)
  const debut30jDate = new Date(now)
  debut30jDate.setDate(debut30jDate.getDate() - 29)
  const debut30j = debut30jDate.toISOString().slice(0, 10)

  const [
    { data: transactionsPeriode },
    { data: entreesPeriode },
    { data: historiquePeriode },
    { data: transactions6Mois },
    { data: entrees6Mois },
    { data: historique6Mois },
    { data: ignores },
    kpisToday,
    kpisYesterday
  ] = await Promise.all([
    supabase.from('transactions').select('*').eq('parametre_id', parametre_id)
      .gte('date', since).order('date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('entrees').select('*').eq('parametre_id', parametre_id)
      .gte('date', since).order('date', { ascending: false }),
    supabase.from('historique_ca')
      .select('date, ca_brut, ca_ht, uber, nb_commandes, especes, cb, tr')
      .eq('parametre_id', parametre_id).gte('date', since).order('date', { ascending: false }),
    supabase.from('transactions')
      .select('id, date, fournisseur_nom, sous_categorie, categorie_pl, montant_ht, montant_ttc')
      .eq('parametre_id', parametre_id).gte('date', debut6Mois).lte('date', today),
    supabase.from('entrees')
      .select('date, source, montant_ttc')
      .eq('parametre_id', parametre_id).gte('date', debut6Mois).lte('date', today),
    supabase.from('historique_ca')
      .select('date, ca_brut, uber')
      .eq('parametre_id', parametre_id).gte('date', debut6Mois).lte('date', today),
    supabase.from('audits_ignores')
      .select('type, cle')
      .eq('parametre_id', parametre_id),
    getDailyKPIs(today),
    getDailyKPIs(yesterday)
  ])

  const kpis = kpisToday.hasData ? kpisToday : kpisYesterday

  // ─────────────────────────────────────────────────────────────────────
  // Audit : 4 règles déterministes sur la période sélectionnée
  // ─────────────────────────────────────────────────────────────────────
  const joursFermesSemaine = parametres?.jours_fermes_semaine || []
  const audit = auditerJournal({
    since,
    today,
    historique: historiquePeriode || [],
    transactions: transactionsPeriode || [],
    entrees: entreesPeriode || [],
    transactionsHistorique: transactions6Mois || [],
    joursFermesSemaine,
    ignores: ignores || []
  })

  // ─────────────────────────────────────────────────────────────────────
  // Calendrier heat-map 30 jours roulants (indépendant du filtre)
  // ─────────────────────────────────────────────────────────────────────
  const datesSaisies30j = new Set()
  for (const h of (historique6Mois || [])) {
    if (h.date >= debut30j && (h.ca_brut || 0) > 0) datesSaisies30j.add(h.date)
  }
  for (const t of (transactions6Mois || [])) {
    if (t.date >= debut30j) datesSaisies30j.add(t.date)
  }
  for (const e of (entrees6Mois || [])) {
    if (e.date >= debut30j) datesSaisies30j.add(e.date)
  }

  const calendrier30j = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateISO = d.toISOString().slice(0, 10)
    const dow = d.getDay()
    let etat
    if (joursFermesSemaine.includes(dow)) etat = 'ferme'
    else if (datesSaisies30j.has(dateISO)) etat = 'complet'
    else etat = 'manquant'
    calendrier30j.push({ date: dateISO, etat })
  }

  return (
    <JournalClient
      transactions={transactionsPeriode || []}
      entrees={entreesPeriode || []}
      historique={historiquePeriode || []}
      kpis={kpis}
      today={today}
      yesterday={yesterday}
      periode={periode}
      type={type}
      audit={audit}
      calendrier30j={calendrier30j}
      joursFermesConfigures={joursFermesSemaine.length > 0}
    />
  )
}
