// Sprint IA Phase 1 commit 9 — Endpoint chat streaming SSE.
//
// POST /api/ia/chat
// Body : { conversation_id: uuid, message: string }
// Réponse : Server-Sent Events
//   data: {"type":"token","data":"..."}
//   data: {"type":"tool_use","data":{...}}
//   data: {"type":"tool_result","data":{...}}
//   data: {"type":"done","data":{...}}
//   data: {"type":"error","data":{...}}
//
// Sécurité : parametre_id TOUJOURS depuis la session, JAMAIS du body.

import { getParametreIdFromSession } from '@/lib/auth'
import { rateLimit } from '@/lib/ia/garde-fous'
import { streamChat } from '@/lib/ia-chat'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sse(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

export async function POST(request) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { conversation_id, message } = body

  if (!conversation_id || !UUID_REGEX.test(conversation_id)) {
    return Response.json({ error: 'conversation_id_invalide' }, { status: 400 })
  }
  if (!message || typeof message !== 'string') {
    return Response.json({ error: 'message_manquant' }, { status: 400 })
  }

  const rl = await rateLimit({ parametre_id, feature: 'chat' })
  if (!rl.ok) {
    return Response.json(
      { error: 'rate_limit_atteint', count: rl.count, limite: rl.limite },
      { status: 429 }
    )
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat({ parametre_id, conversation_id, message })) {
          controller.enqueue(encoder.encode(sse(chunk)))
        }
      } catch (e) {
        controller.enqueue(encoder.encode(sse({ type: 'error', data: { raison: 'exception', message: e.message } })))
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  })
}
