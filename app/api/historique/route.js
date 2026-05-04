import { getParametreIdFromSession } from '@/lib/auth'
import { getRowsCompatHCA } from '@/lib/data/ventes'

// ⚠ ENDPOINT POTENTIELLEMENT ORPHELIN (étape 5 Lot 3, mai 2026).
// Aucun consommateur connu dans le code Strat (vérifié via grep `/api/historique`
// et `fetch.*api/historique` retournant 0 résultats). Si utilisé en externe
// (curl, Postman, scripts perso), vérifier les chiffres post-migration :
//   - uber : reflète VPS uber_eats (peut sous-évaluer si saisies FAB récentes
//     pas encore propagées à VPS — comblé jusqu'au 03/05/2026 via Phase 0 Lot 3)
//   - commission_uber : null (legacy était nullable, valeur jamais peuplée par
//     le cron — cf. F6 IRRITANTS_UX_V1.md)
// Dette : à supprimer ou refondre en sprint dédié si confirmé orphelin.

export async function GET(request) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'Session invalide ou expirée' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const since = searchParams.get('since')
  const until = searchParams.get('until')
  const granularite = searchParams.get('granularite') || 'jour'

  const today = new Date().toISOString().slice(0, 10)
  let rows
  try {
    rows = await getRowsCompatHCA(parametre_id, since || '2024-01-01', until || today)
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }

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