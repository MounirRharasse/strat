import { getMixVentes } from '@/lib/popina'
import { supabase } from '@/lib/supabase'
import MixClient from './MixClient'

export default async function MixVentes({ searchParams }) {
  const today = new Date().toISOString().split('T')[0]
  const periode = searchParams?.periode || 'week'

  let since = today
  if (periode === 'week') since = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  if (periode === 'month') since = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  const mix = await getMixVentes(since, today)

  const { data: uberProduits } = await supabase
    .from('uber_orders')
    .select('produit, quantite, ventes_ttc, heure, date')
    .gte('date', since)
    .lte('date', today)

  const uberParHeure = {}
  for (const row of (uberProduits || [])) {
    if (!row.heure) continue
    const h = row.heure.substring(0, 2)
    if (!uberParHeure[h]) uberParHeure[h] = { nb: 0, ca: 0 }
    uberParHeure[h].nb += 1
    uberParHeure[h].ca += row.ventes_ttc || 0
  }

  const uberTopMap = {}
  for (const row of (uberProduits || [])) {
    if (!row.produit) continue
    if (!uberTopMap[row.produit]) uberTopMap[row.produit] = { quantite: 0, ca: 0 }
    uberTopMap[row.produit].quantite += row.quantite || 0
    uberTopMap[row.produit].ca += row.ventes_ttc || 0
  }
  const uberTop = Object.entries(uberTopMap)
    .map(([nom, v]) => ({ nom, ...v, canal: 'uber' }))
    .sort((a, b) => b.ca - a.ca)

  const caUber = Math.round((uberProduits || []).reduce((s, r) => s + (r.ventes_ttc || 0), 0) * 100) / 100
  const caRestaurant = Math.round((mix.caTotal || 0) * 100) / 100
  const caTotal = caRestaurant + caUber

  return (
    <MixClient
      mix={mix}
      uberTop={uberTop}
      uberParHeure={uberParHeure}
      caUber={caUber}
      caRestaurant={caRestaurant}
      caTotal={caTotal}
      periode={periode}
    />
  )
}