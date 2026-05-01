// Sprint IA Phase 1 commit 8 — Functions chat domaine "meta".

import { supabase } from '@/lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'
import { getISOWeek, getISOWeekYear } from 'date-fns'
import { fr } from 'date-fns/locale'

export async function getParametres({ parametre_id }) {
  const { data } = await supabase.from('parametres').select(`
    nom_restaurant, type_restaurant, plan, slug,
    timezone, jours_fermes_semaine,
    objectif_ca, objectif_food_cost, objectif_marge,
    alerte_food_cost_max, alerte_ticket_min,
    insight_cooldown_jours
  `).eq('id', parametre_id).single()
  return data || {}
}

export async function getStatutSynchro({ parametre_id }) {
  const { data } = await supabase
    .from('historique_ca')
    .select('date, created_at')
    .eq('parametre_id', parametre_id)
    .order('date', { ascending: false })
    .limit(1).maybeSingle()

  if (!data?.date) {
    return {
      synchro_ok: false,
      message: 'Aucune donnée historique_ca pour ce restaurant.',
      derniere_date: null,
      age_heures: null
    }
  }
  const finJourSaisi = new Date(data.date).getTime() + 24 * 3600 * 1000
  const ageH = (Date.now() - finJourSaisi) / 3600000
  return {
    synchro_ok: ageH < 48,
    derniere_date: data.date,
    derniere_synchro_at: data.created_at,
    age_heures: Math.max(0, Math.round(ageH * 10) / 10)
  }
}

export async function getDateAujourdhui({ parametre_id }) {
  const { data } = await supabase
    .from('parametres').select('timezone')
    .eq('id', parametre_id).single()
  const tz = data?.timezone || 'Europe/Paris'
  const now = new Date()
  return {
    date: formatInTimeZone(now, tz, 'yyyy-MM-dd'),
    semaine_iso: `${getISOWeekYear(now)}-W${String(getISOWeek(now)).padStart(2, '0')}`,
    mois_iso: formatInTimeZone(now, tz, 'yyyy-MM'),
    jour_semaine: formatInTimeZone(now, tz, 'EEEE', { locale: fr }),
    timezone: tz,
    timestamp_utc: now.toISOString()
  }
}
