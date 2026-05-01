// Sprint IA Phase 1 commit 6 — Endpoint lecture insight quotidien.
//
// GET /api/ia/insight?date=YYYY-MM-DD → contenu IA en cache, 404 si absent.
// La génération est faite par le cron (commit 6), pas exposée à l'UI V1.

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'
import { getInsightDuJour } from '@/lib/ia-insight'
import { formatInTimeZone } from 'date-fns-tz'

export async function GET(request) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: params } = await supabase
    .from('parametres').select('timezone').eq('id', parametre_id).single()
  const timezone = params?.timezone || 'Europe/Paris'

  const { searchParams } = new URL(request.url)
  const date_ref = searchParams.get('date') ||
    formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd')

  const insight = await getInsightDuJour({ parametre_id, date_ref })
  if (!insight) {
    return NextResponse.json(
      { error: 'insight_indisponible', date_ref },
      { status: 404 }
    )
  }
  return NextResponse.json({ ...insight, date_ref })
}
