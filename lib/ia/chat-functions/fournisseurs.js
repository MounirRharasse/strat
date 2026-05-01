// Sprint IA Phase 1 commit 8 — Functions chat domaine "fournisseurs".

import { format, parseISO, subDays, differenceInCalendarDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { topFournisseursConsommations } from '@/lib/food-cost-decomposition'

const LIMIT_TRANSACTIONS_FOURNISSEUR = 50
const MAX_N_TOP = 10

function arrondi2(n) {
  return n == null ? null : Math.round(n * 100) / 100
}

function mediane(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export async function getTopFournisseurs({ parametre_id, periode_since, periode_until, n = 5 }) {
  const limit_n = Math.min(n, MAX_N_TOP)
  const today = new Date().toISOString().slice(0, 10)
  const since = periode_since || format(subDays(new Date(), 29), 'yyyy-MM-dd')
  const until = periode_until || today

  const dureeJours = differenceInCalendarDays(parseISO(until), parseISO(since)) + 1
  const sincePrec = format(subDays(parseISO(since), dureeJours), 'yyyy-MM-dd')
  const untilPrec = format(subDays(parseISO(since), 1), 'yyyy-MM-dd')

  const [actuelRes, precRes] = await Promise.all([
    supabase.from('transactions')
      .select('fournisseur_nom, montant_ht, montant_ttc, categorie_pl')
      .eq('parametre_id', parametre_id)
      .eq('categorie_pl', 'consommations')
      .gte('date', since).lte('date', until),
    supabase.from('transactions')
      .select('fournisseur_nom, montant_ht, categorie_pl')
      .eq('parametre_id', parametre_id)
      .eq('categorie_pl', 'consommations')
      .gte('date', sincePrec).lte('date', untilPrec)
  ])

  const top = topFournisseursConsommations(
    actuelRes.data || [],
    precRes.data || [],
    limit_n
  )

  return {
    periode_since: since,
    periode_until: until,
    fournisseurs: top.map(f => ({
      nom: f.fournisseur,
      cumul_ht: arrondi2(f.total),
      cumul_ht_periode_prec: arrondi2(f.totalPrec),
      variation_pct: f.variationPct != null ? arrondi2(f.variationPct) : null,
      variation_label: f.variationLabel || null
    })),
    truncated: n > MAX_N_TOP,
    n_demande: n,
    n_max: MAX_N_TOP
  }
}

export async function getTransactionsFournisseur({ parametre_id, fournisseur_nom, periode_since, periode_until }) {
  if (!fournisseur_nom || typeof fournisseur_nom !== 'string') {
    throw new Error('fournisseur_nom manquant')
  }
  const today = new Date().toISOString().slice(0, 10)
  const since = periode_since || format(subDays(new Date(), 89), 'yyyy-MM-dd')
  const until = periode_until || today

  const { data, count } = await supabase
    .from('transactions')
    .select('date, fournisseur_nom, montant_ttc, montant_ht, categorie_pl, sous_categorie',
      { count: 'exact' })
    .eq('parametre_id', parametre_id)
    .ilike('fournisseur_nom', `%${fournisseur_nom}%`)
    .gte('date', since).lte('date', until)
    .order('date', { ascending: false })
    .limit(LIMIT_TRANSACTIONS_FOURNISSEUR)

  const total = count || 0
  return {
    fournisseur_nom_recherche: fournisseur_nom,
    periode_since: since,
    periode_until: until,
    transactions: (data || []).map(t => ({
      date: t.date,
      fournisseur_nom: t.fournisseur_nom,
      montant_ttc: arrondi2(t.montant_ttc),
      montant_ht: arrondi2(t.montant_ht),
      categorie_pl: t.categorie_pl,
      sous_categorie: t.sous_categorie || null
    })),
    truncated: total > LIMIT_TRANSACTIONS_FOURNISSEUR,
    total_count: total,
    limit: LIMIT_TRANSACTIONS_FOURNISSEUR
  }
}

export async function getMedianeFournisseur({ parametre_id, fournisseur_nom }) {
  if (!fournisseur_nom || typeof fournisseur_nom !== 'string') {
    throw new Error('fournisseur_nom manquant')
  }
  const since6m = format(subDays(new Date(), 180), 'yyyy-MM-dd')

  const { data } = await supabase
    .from('transactions')
    .select('date, montant_ttc')
    .eq('parametre_id', parametre_id)
    .ilike('fournisseur_nom', `%${fournisseur_nom}%`)
    .gte('date', since6m)
    .order('date', { ascending: false })

  const montants = (data || []).map(r => r.montant_ttc || 0).filter(m => m > 0)
  if (montants.length === 0) {
    return {
      fournisseur_nom_recherche: fournisseur_nom,
      mediane_ttc: null,
      nb_achats: 0,
      message: 'Aucun achat trouvé pour ce fournisseur sur 6 mois.'
    }
  }
  const sorted = [...montants].sort((a, b) => a - b)
  return {
    fournisseur_nom_recherche: fournisseur_nom,
    mediane_ttc: arrondi2(mediane(montants)),
    min_ttc: arrondi2(sorted[0]),
    max_ttc: arrondi2(sorted[sorted.length - 1]),
    nb_achats: montants.length,
    periode_since: since6m
  }
}
