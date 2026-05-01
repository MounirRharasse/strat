// Sprint IA Phase 1 commit 8 — Functions chat domaine "insights".

import { format, subDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { getBriefSemaine as getBriefCache } from '@/lib/ia-brief'

const N_JOURS_MAX = 14

const SEMAINE_REGEX = /^\d{4}-W\d{1,2}$/

export async function getInsightsRecents({ parametre_id, n_jours = 7 }) {
  const n = Math.min(Math.max(1, n_jours), N_JOURS_MAX)
  const since = format(subDays(new Date(), n - 1), 'yyyy-MM-dd')
  const until = new Date().toISOString().slice(0, 10)

  const { data } = await supabase
    .from('ia_signaux')
    .select('date_detection, type_trigger, tier, magnitude, ia_contenu, contexte')
    .eq('parametre_id', parametre_id)
    .eq('traite_par_ia', true)
    .gte('date_detection', since)
    .lte('date_detection', until)
    .order('date_detection', { ascending: false })

  return {
    since,
    until,
    n_jours_demande: n_jours,
    n_jours_applique: n,
    truncated: n_jours > N_JOURS_MAX,
    n_max: N_JOURS_MAX,
    insights: (data || []).map(s => ({
      date: s.date_detection,
      type: s.type_trigger,
      tier: s.tier,
      magnitude: s.magnitude,
      contenu: s.ia_contenu
    }))
  }
}

export async function getBriefSemaine({ parametre_id, semaine_iso }) {
  if (!SEMAINE_REGEX.test(semaine_iso || '')) {
    throw new Error('semaine_iso invalide (YYYY-Wxx requis)')
  }
  const brief = await getBriefCache({ parametre_id, semaine_iso })
  if (!brief) {
    return {
      semaine_iso,
      present: false,
      message: 'Aucun brief disponible pour cette semaine.'
    }
  }
  return {
    semaine_iso,
    present: true,
    contenu: brief.contenu,
    generee_le: brief.generee_le
  }
}
