// Sprint IA Phase 1 commit 4 — Build inputs anomalie montant fournisseur.
//
// Récupère depuis Supabase :
// - La transaction ciblée (validation tenant)
// - Les 6 derniers achats du même fournisseur
// - La conso hebdo moyenne de la catégorie sur 4 sem précédentes
// Throw si historique insuffisant ou tenant mismatch.

import { parseISO, format, subDays, subWeeks } from 'date-fns'
import { supabase } from '@/lib/supabase'

const MIN_REF_FOURNISSEUR = 6

function unwrapData({ data, error }, table) {
  if (error) throw new Error(`[anomalie-inputs] ${table}: ${error.message}`)
  return data || []
}

function mediane(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function arrondi2(n) {
  return n == null ? null : Math.round(n * 100) / 100
}

/**
 * Construit les inputs structurés pour l'explication IA d'une anomalie de montant.
 * Throw `transaction_introuvable` | `fournisseur_inconnu` | `historique_insuffisant`.
 */
export async function buildAnomalieInputs({ parametre_id, transaction_id }) {
  const { data: transaction, error: errT } = await supabase
    .from('transactions')
    .select('id, date, fournisseur_nom, montant_ttc, montant_ht, categorie_pl, sous_categorie')
    .eq('parametre_id', parametre_id)
    .eq('id', transaction_id)
    .maybeSingle()

  if (errT) throw new Error(`[anomalie-inputs] transactions: ${errT.message}`)
  if (!transaction) throw new Error('transaction_introuvable')
  if (!transaction.fournisseur_nom) throw new Error('fournisseur_inconnu')

  const refs = await supabase
    .from('transactions')
    .select('date, montant_ttc')
    .eq('parametre_id', parametre_id)
    .eq('fournisseur_nom', transaction.fournisseur_nom)
    .lt('date', transaction.date)
    .order('date', { ascending: false })
    .limit(MIN_REF_FOURNISSEUR)
    .then(r => unwrapData(r, 'transactions_refs'))

  if (refs.length < MIN_REF_FOURNISSEUR) {
    throw new Error('historique_insuffisant')
  }

  const montants = refs.map(r => r.montant_ttc || 0)
  const med = mediane(montants)
  const minRef = Math.min(...montants)
  const maxRef = Math.max(...montants)

  const ecartEur = (transaction.montant_ttc || 0) - med
  const ecartPct = med > 0
    ? Math.round(((transaction.montant_ttc || 0) - med) / med * 1000) / 10
    : null

  const since4w = format(subWeeks(parseISO(transaction.date), 4), 'yyyy-MM-dd')
  const avant = format(subDays(parseISO(transaction.date), 1), 'yyyy-MM-dd')
  const consoCateg = await supabase
    .from('transactions')
    .select('date, montant_ttc')
    .eq('parametre_id', parametre_id)
    .eq('categorie_pl', transaction.categorie_pl)
    .gte('date', since4w)
    .lte('date', avant)
    .then(r => unwrapData(r, 'transactions_categ'))

  const totalCateg4w = consoCateg.reduce((s, t) => s + (t.montant_ttc || 0), 0)
  const consoHebdoCategMoy = arrondi2(totalCateg4w / 4)

  return {
    transaction: {
      date: transaction.date,
      fournisseur: transaction.fournisseur_nom,
      categorie: transaction.categorie_pl,
      sous_categorie: transaction.sous_categorie || null,
      montant_ttc: arrondi2(transaction.montant_ttc),
      montant_ht: arrondi2(transaction.montant_ht)
    },
    historique_fournisseur: {
      nb_achats: refs.length,
      mediane_ttc: arrondi2(med),
      min_ttc: arrondi2(minRef),
      max_ttc: arrondi2(maxRef),
      derniers_montants: refs.map(r => ({
        date: r.date,
        montant_ttc: arrondi2(r.montant_ttc)
      }))
    },
    ecart: {
      en_euros: arrondi2(ecartEur),
      en_pct: ecartPct,
      direction: ecartEur > 0 ? 'hausse' : 'baisse'
    },
    contexte_categorie: {
      conso_hebdo_moyenne_4sem: consoHebdoCategMoy
    }
  }
}
