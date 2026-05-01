// Sprint IA Phase 1 commit 3 — Page /brief lecture seule.
//
// Lit le cache `ia_explications_cache` (rempli par le cron lundi 06h UTC
// ou par POST /api/ia/brief). Pas de génération depuis l'UI V1.

import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'
import { getBriefSemaine, getSemainePrecedente } from '@/lib/ia-brief'
import { parseSemaineISO } from '@/lib/ia/brief-inputs'
import { formatInTimeZone } from 'date-fns-tz'
import { parseISO } from 'date-fns'
import BriefClient from './BriefClient'

export default async function BriefPage({ searchParams }) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    redirect('/login')
  }

  const { data: params } = await supabase
    .from('parametres')
    .select('timezone')
    .eq('id', parametre_id)
    .single()
  const timezone = params?.timezone || 'Europe/Paris'

  // Anti-décalage UTC : on calcule la "date Paris" pour ne pas demander
  // la mauvaise semaine quand le serveur est UTC à minuit Paris.
  const now = new Date()
  const dateParisISO = formatInTimeZone(now, timezone, 'yyyy-MM-dd')
  const dateParis = parseISO(dateParisISO + 'T12:00:00Z')

  let semaine_iso = searchParams?.semaine || getSemainePrecedente(dateParis)
  let periode
  try {
    periode = parseSemaineISO(semaine_iso)
  } catch {
    // Format invalide → fallback semaine précédente
    semaine_iso = getSemainePrecedente(dateParis)
    periode = parseSemaineISO(semaine_iso)
  }

  const brief = await getBriefSemaine({ parametre_id, semaine_iso })

  return <BriefClient brief={brief} semaine_iso={semaine_iso} periode={periode} />
}
