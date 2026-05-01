// Sprint IA Phase 1 commit 6 — Cron insight 04:00 UTC (06:00 Paris).
//
// Pour chaque parametre, calcule la date du jour en TZ tenant et appelle
// genererInsightDuJour. Idempotent : si le signal existe déjà, le pipeline
// court-circuite via cache.

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { genererInsightDuJour } from '@/lib/ia-insight'
import { formatInTimeZone } from 'date-fns-tz'

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = { processed: 0, skipped: 0, errors: [] }

  // TODO V1+ : filtrer sur `actif=true` quand la colonne existera
  const { data: parametres, error } = await supabase
    .from('parametres').select('id, timezone')

  if (error) {
    return NextResponse.json(
      { error: 'erreur_lecture_parametres', detail: error.message },
      { status: 500 }
    )
  }

  for (const p of parametres || []) {
    const tz = p.timezone || 'Europe/Paris'
    const date_ref = formatInTimeZone(new Date(), tz, 'yyyy-MM-dd')
    try {
      const r = await genererInsightDuJour({ parametre_id: p.id, date_ref })
      if (r.skipped) {
        result.skipped++
        console.log('[cron-ia-insight] skipped', { parametre_id: p.id, raison: r.raison })
      } else if (r.error) {
        result.errors.push({ parametre_id: p.id, raison: r.error })
        console.warn('[cron-ia-insight] erreur', { parametre_id: p.id, raison: r.error })
      } else {
        result.processed++
        console.log('[cron-ia-insight] genere', { parametre_id: p.id, cout_eur: r.cout_eur })
      }
    } catch (e) {
      result.errors.push({ parametre_id: p.id, raison: e.message })
      console.error('[cron-ia-insight] exception', { parametre_id: p.id, message: e.message })
    }
  }

  return NextResponse.json(result)
}
