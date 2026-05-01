// Sprint IA Phase 1 commit 8 — Functions chat domaine "anomalies".

import { format, subDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { auditerJournal } from '@/lib/audit-saisies'

const LIMIT_ALERTES = 20

async function getParametresDB(parametre_id) {
  const { data } = await supabase.from('parametres').select('*').eq('id', parametre_id).single()
  return data
}

export async function getAnomaliesJournal({ parametre_id, since, until }) {
  const today = new Date().toISOString().slice(0, 10)
  const _since = since || format(subDays(new Date(), 6), 'yyyy-MM-dd')
  const _until = until || today
  const since6m = format(subDays(new Date(), 180), 'yyyy-MM-dd')

  const params = await getParametresDB(parametre_id)

  const [hist, trans, entrees, transHist, ignores] = await Promise.all([
    supabase.from('historique_ca').select('*')
      .eq('parametre_id', parametre_id)
      .gte('date', since6m).lte('date', _until)
      .then(r => r.data || []),
    supabase.from('transactions').select('*')
      .eq('parametre_id', parametre_id)
      .gte('date', _since).lte('date', _until)
      .then(r => r.data || []),
    supabase.from('entrees').select('*')
      .eq('parametre_id', parametre_id)
      .gte('date', _since).lte('date', _until)
      .then(r => r.data || []),
    supabase.from('transactions').select('*')
      .eq('parametre_id', parametre_id)
      .gte('date', since6m).lte('date', _until)
      .then(r => r.data || []),
    supabase.from('audits_ignores').select('*')
      .eq('parametre_id', parametre_id)
      .then(r => r.data || [])
  ])

  const audit = auditerJournal({
    since: _since,
    today: _until,
    historique: hist,
    transactions: trans,
    entrees,
    transactionsHistorique: transHist,
    joursFermesSemaine: params?.jours_fermes_semaine || [],
    ignores
  })

  const total = (audit.alertes || []).length
  const alertes = (audit.alertes || []).slice(0, LIMIT_ALERTES).map(a => ({
    type: a.type,
    criticite: a.criticite,
    date: a.date,
    titre: a.titre,
    sous_texte: a.sousTexte,
    fournisseur_nom: a.fournisseur_nom || null,
    montant_ttc: a.montant_ttc || null,
    mediane: a.mediane || null,
    transaction_id: a.transaction_id || null,
    canal: a.canal || null
  }))

  return {
    since: _since,
    until: _until,
    nb_critiques: audit.nbCritiques || 0,
    nb_attention: audit.nbAttention || 0,
    alertes,
    truncated: total > LIMIT_ALERTES,
    total_count: total,
    limit: LIMIT_ALERTES
  }
}

export async function getTrousSaisie({ parametre_id, since, until }) {
  const r = await getAnomaliesJournal({ parametre_id, since, until })
  const trous = r.alertes.filter(a => typeof a.type === 'string' && a.type.startsWith('trou_'))
  return {
    since: r.since,
    until: r.until,
    trous,
    nb_total: trous.length,
    truncated: r.truncated,
    total_count_alertes: r.total_count
  }
}
