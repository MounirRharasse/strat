// Sprint IA Phase 1 commit 2 — Cron brief lundi 06:00 UTC.
//
// Génère automatiquement le brief de la semaine passée pour chaque
// parametre. Idempotent : skip si déjà en cache pour cette semaine.
// La contrainte UNIQUE (parametre_id, indicateur, cle) protège contre
// les doubles écritures concurrentes (UPSERT côté genererBriefSemaine).

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  genererBriefSemaine,
  getBriefSemaine,
  getSemainePrecedente
} from '@/lib/ia-brief'

export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const semaine_iso = getSemainePrecedente()
  const result = { semaine_iso, processed: 0, skipped: 0, errors: [] }

  // TODO V1+ : filtrer sur `actif=true` quand la colonne existera
  const { data: parametres, error } = await supabase
    .from('parametres').select('id')

  if (error) {
    return NextResponse.json(
      { error: 'erreur_lecture_parametres', detail: error.message },
      { status: 500 }
    )
  }

  for (const p of parametres || []) {
    try {
      const existant = await getBriefSemaine({ parametre_id: p.id, semaine_iso })
      if (existant) {
        result.skipped++
        console.log('[cron-ia-brief] skip cache', { parametre_id: p.id })
        continue
      }
      const r = await genererBriefSemaine({ parametre_id: p.id, semaine_iso })
      if (r.error) {
        result.errors.push({ parametre_id: p.id, raison: r.error })
        console.warn('[cron-ia-brief] echec', { parametre_id: p.id, raison: r.error })
      } else {
        result.processed++
        console.log('[cron-ia-brief] genere', { parametre_id: p.id, cout_eur: r.cout_eur })
      }
    } catch (e) {
      result.errors.push({ parametre_id: p.id, raison: e.message })
      console.error('[cron-ia-brief] exception', { parametre_id: p.id, message: e.message })
    }
  }

  return NextResponse.json(result)
}
