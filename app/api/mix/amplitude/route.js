import { getAllOrders } from '@/lib/popina'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const since = searchParams.get('since')
  const until = searchParams.get('until')

  if (!since || !until) return Response.json({ error: 'since et until requis' }, { status: 400 })

  try {
    const orders = await getAllOrders(since, until)
    const valides = orders.filter(o => !o.isCanceled && o.total > 0)

    const parHeure = {}
    for (const order of valides) {
      const date = order.openedAt || order.createdAt
      if (!date) continue
      // UTC+2 pour heure française
      const d = new Date(date)
      const hFrance = (d.getUTCHours() + 2) % 24
      const h = hFrance.toString().padStart(2, '0')
      if (!parHeure[h]) parHeure[h] = { nb: 0, ca: 0 }
      parHeure[h].nb += 1
      parHeure[h].ca += order.total / 100
    }

    return Response.json({ parHeure, nbTotal: valides.length })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}