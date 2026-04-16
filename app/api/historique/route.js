import { supabase } from '@/lib/supabase'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const since = searchParams.get('since')
  const until = searchParams.get('until')
  const granularite = searchParams.get('granularite') || 'jour'

  let query = supabase
    .from('historique_ca')
    .select('*')
    .order('date', { ascending: true })

  if (since) query = query.gte('date', since)
  if (until) query = query.lte('date', until)

  const { data, error } = await query

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const rows = data || []

  if (granularite === 'jour') {
    return Response.json(rows.map(r => ({
      date: r.date,
      ca_brut: r.ca_brut,
      ca_ht: r.ca_ht,
      uber: r.uber,
      especes: r.especes,
      cb: r.cb,
      tr: r.tr,
      nb_commandes: r.nb_commandes,
      panier_moyen: r.nb_commandes > 0 ? r.ca_brut / r.nb_commandes : 0,
      commission_uber: r.commission_uber,
    })))
  }

  if (granularite === 'semaine') {
    const bySemaine = {}
    for (const r of rows) {
      const date = new Date(r.date)
      const lundi = new Date(date)
      lundi.setDate(date.getDate() - ((date.getDay() || 7) - 1))
      const key = lundi.toISOString().split('T')[0]
      if (!bySemaine[key]) bySemaine[key] = { date: key, ca_brut: 0, ca_ht: 0, uber: 0, especes: 0, nb_commandes: 0, jours: 0 }
      bySemaine[key].ca_brut += r.ca_brut
      bySemaine[key].ca_ht += r.ca_ht
      bySemaine[key].uber += r.uber
      bySemaine[key].especes += r.especes
      bySemaine[key].nb_commandes += r.nb_commandes
      bySemaine[key].jours++
    }
    return Response.json(Object.values(bySemaine).map(s => ({
      ...s,
      ca_brut: Math.round(s.ca_brut * 100) / 100,
      panier_moyen: s.nb_commandes > 0 ? Math.round((s.ca_brut / s.nb_commandes) * 100) / 100 : 0
    })))
  }

  if (granularite === 'mois') {
    const byMois = {}
    for (const r of rows) {
      const key = r.date.substring(0, 7)
      if (!byMois[key]) byMois[key] = { mois: key, ca_brut: 0, ca_ht: 0, uber: 0, especes: 0, nb_commandes: 0, jours: 0 }
      byMois[key].ca_brut += r.ca_brut
      byMois[key].ca_ht += r.ca_ht
      byMois[key].uber += r.uber
      byMois[key].especes += r.especes
      byMois[key].nb_commandes += r.nb_commandes
      byMois[key].jours++
    }
    return Response.json(Object.values(byMois).map(m => ({
      ...m,
      ca_brut: Math.round(m.ca_brut * 100) / 100,
      panier_moyen: m.nb_commandes > 0 ? Math.round((m.ca_brut / m.nb_commandes) * 100) / 100 : 0
    })))
  }

  return Response.json(rows)
}