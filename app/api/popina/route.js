import { getDailyKPIs, getMixVentes, getWeeklyData } from '@/lib/popina'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'daily'
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

  try {
    let data

    if (type === 'daily') {
      data = await getDailyKPIs(date)
    } else if (type === 'mix') {
      const since = searchParams.get('since') || date
      const until = searchParams.get('until') || date
      data = await getMixVentes(since, until)
    } else if (type === 'weekly') {
      data = await getWeeklyData()
    } else {
      return Response.json({ error: 'Type invalide' }, { status: 400 })
    }

    return Response.json(data)

  } catch (error) {
    console.error('Erreur Popina API:', error)
    return Response.json(
      { error: error.message },
      { status: 500 }
    )
  }
}