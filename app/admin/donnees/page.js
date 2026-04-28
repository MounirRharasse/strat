import { supabase } from '@/lib/supabase'
import DonneesClient from './DonneesClient'

// TODO V1.1 (avant 2e tenant) : philosophie validée le 28 avril 2026
// = par tenant avec sélecteur. Ajouter ?tenant=<uuid> + dropdown +
// .eq('parametre_id', tenant) sur les 3 queries.
// Cf. session 28 avril, décision produit.

export default async function AdminDonnees({ searchParams }) {
  const onglet = searchParams?.onglet || 'ca'
  const page = parseInt(searchParams?.page || '1')
  const limit = 50
  const offset = (page - 1) * limit

  let data = []
  let total = 0

  if (onglet === 'ca') {
    const { data: hist, count } = await supabase
      .from('historique_ca')
      .select('*', { count: 'exact' })
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1)
    data = hist || []
    total = count || 0

    // Ajouter les entrées manuelles Uber par date
    const { data: entrees } = await supabase
      .from('entrees')
      .select('date, montant_ttc, nb_commandes, source')
      .eq('source', 'uber_eats')
      .order('date', { ascending: false })

    // Merger les entrées manuelles dans les données CA
    data = data.map(row => {
      const entreesJour = (entrees || []).filter(e => e.date === row.date)
      const uberManuel = entreesJour.reduce((s, e) => s + (e.montant_ttc || 0), 0)
      const cmdManuel = entreesJour.reduce((s, e) => s + (e.nb_commandes || 0), 0)
      return { ...row, uber_manuel: uberManuel, cmd_manuel: cmdManuel }
    })
  }

  if (onglet === 'depenses') {
    const { data: txs, count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1)
    data = txs || []
    total = count || 0
  }

  return <DonneesClient data={data} total={total} onglet={onglet} page={page} limit={limit} />
}