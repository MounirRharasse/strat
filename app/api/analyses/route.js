import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'
import { getAnalysesKPIs } from '@/lib/data/analyses-kpis'

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
  if (!since || !until) return Response.json({ error: 'since et until requis' }, { status: 400 })

  try {
    const { data: parametres } = await supabase
      .from('parametres')
      .select('*')
      .eq('id', parametre_id)
      .single()

    const kpis = await getAnalysesKPIs({ parametre_id, since, until, parametres })
    return Response.json(kpis)
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
