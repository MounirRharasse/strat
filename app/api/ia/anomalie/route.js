// Sprint IA Phase 1 commit 4 — Endpoint explication anomalie.
//
// POST /api/ia/anomalie  Body: { transaction_id }
// Auth NextAuth, rate-limite via feature 'anomalie' (50/jour).

import { NextResponse } from 'next/server'
import { getParametreIdFromSession } from '@/lib/auth'
import { rateLimit } from '@/lib/ia/garde-fous'
import { genererExplicationAnomalie } from '@/lib/ia-anomalies'

export async function POST(request) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const transaction_id = body.transaction_id
  if (!transaction_id || typeof transaction_id !== 'string') {
    return NextResponse.json({ error: 'transaction_id_manquant' }, { status: 400 })
  }

  const rl = await rateLimit({ parametre_id, feature: 'anomalie' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limit_atteint', count: rl.count, limite: rl.limite },
      { status: 429 }
    )
  }

  const r = await genererExplicationAnomalie({ parametre_id, transaction_id })
  if (r.error) return NextResponse.json(r, { status: 422 })
  return NextResponse.json(r)
}
