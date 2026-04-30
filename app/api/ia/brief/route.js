// Sprint IA Phase 1 commit 2 — Endpoint brief lundi.
//
// GET  /api/ia/brief?semaine=YYYY-Wxx → lit le cache (404 si absent)
// POST /api/ia/brief                  → force regénération (rate-limité brief)

import { NextResponse } from 'next/server'
import { getParametreIdFromSession } from '@/lib/auth'
import { rateLimit } from '@/lib/ia/garde-fous'
import {
  genererBriefSemaine,
  getBriefSemaine,
  getSemainePrecedente
} from '@/lib/ia-brief'

export async function GET(request) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const semaine_iso = searchParams.get('semaine') || getSemainePrecedente()

  const brief = await getBriefSemaine({ parametre_id, semaine_iso })
  if (!brief) {
    return NextResponse.json(
      { error: 'brief_indisponible', semaine_iso },
      { status: 404 }
    )
  }
  return NextResponse.json(brief)
}

export async function POST(request) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const semaine_iso = body.semaine_iso || getSemainePrecedente()

  const rl = await rateLimit({ parametre_id, feature: 'brief' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limit_atteint', count: rl.count, limite: rl.limite },
      { status: 429 }
    )
  }

  const r = await genererBriefSemaine({ parametre_id, semaine_iso })
  if (r.error) return NextResponse.json(r, { status: 422 })
  return NextResponse.json(r)
}
