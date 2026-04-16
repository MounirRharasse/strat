export async function POST(request) {
  const body = await request.json()
  const { type, data, context } = body

  const restaurant = context?.nom || 'le restaurant'
  const typeResto = context?.type || 'fast-food'
  const objectifCA = context?.objectif_ca || 45000
  const objectifFC = context?.objectif_food_cost || 30

  const systemPrompt = `Tu es un conseiller business expert en restauration, spécialisé dans le pilotage financier de restaurants ${typeResto}. 
Tu analyses les données de ${restaurant} et donnes des conseils directs, concrets et actionnables en français.
Ton style : direct, bienveillant, chiffré. Jamais de bullet points. Toujours 2-4 phrases maximum.
Tu connais les normes du secteur : food cost 28-32%, staff cost 28-35%, EBE 15-20%, panier moyen fast-food 12-18€.`

  const prompts = {
    dashboard: `Analyse ces KPIs de ${restaurant} pour aujourd'hui et génère un insight actionnable.

CA du jour : ${data.caBrut}€ (objectif : ${data.objectifJour}€/j, soit ${Math.round(data.caBrut / data.objectifJour * 100)}% de l'objectif)
Commandes : ${data.nbCommandes} · Panier moyen : ${data.panierMoyen?.toFixed(2)}€ (objectif : ${data.alerteTicketMin}€)
Food cost MTD : ${data.foodCostP?.toFixed(1)}% (objectif : ${objectifFC}%)
Seuil de rentabilité : ${data.seuilAtteint ? 'Atteint ✓' : 'Non atteint'} (seuil : ${data.seuilJournalier}€/j)
CA Uber Eats : ${data.caUber}€ · CA Caisse/Foxorder : ${data.caCaisse}€

Commence par le point le plus important. Mentionne si c'est une bonne ou mauvaise journée. Donne 1 action concrète si nécessaire.`,

    analyses: `Compare ces deux périodes de ${restaurant} et génère une analyse stratégique.

${data.labelRef} :
CA HT ${data.caRef}€ · ${data.cmdRef} commandes · Panier ${data.panierRef?.toFixed(2)}€ · Food cost ${data.fcRef?.toFixed(1)}% · EBE ${data.ebeRef}€

${data.labelComp} :
CA HT ${data.caComp}€ · ${data.cmdComp} commandes · Panier ${data.panierComp?.toFixed(2)}€ · Food cost ${data.fcComp?.toFixed(1)}% · EBE ${data.ebeComp}€

Écart CA : ${data.caRef > data.caComp ? '+' : ''}${Math.round((data.caRef - data.caComp) / Math.max(data.caComp, 1) * 100)}%
Écart commandes : ${data.cmdRef > data.cmdComp ? '+' : ''}${Math.round((data.cmdRef - data.cmdComp) / Math.max(data.cmdComp, 1) * 100)}%

Identifie la tendance principale, explique-la et donne 1 recommandation concrète pour la semaine suivante.`,

    previsions: `Génère une analyse prévisionnelle pour ${restaurant} ce mois-ci.

CA réalisé : ${data.caBrut}€ sur ${data.nbJoursEcoules}j · Projeté : ${data.caProjecte}€ · Objectif : ${objectifCA}€
Rythme : ${data.caParJour}€/j · Il reste ${data.nbJoursRestants} jours
Food cost réel : ${data.foodCostP}%
Échéances du mois : ${data.totalEcheances}€ dont TVA ${data.tvaAPayer}€

${data.caProjecte >= objectifCA ? "L'objectif est en bonne voie." : "L'objectif est difficile à atteindre."} 
CA/j nécessaire pour objectif : ${Math.round((objectifCA - data.caBrut) / Math.max(data.nbJoursRestants, 1))}€/j

Dis clairement si l'objectif est atteignable. Mentionne la prochaine échéance importante. Donne 1 levier actionnable.`
  }

  const prompt = prompts[type]
  if (!prompt) return Response.json({ error: 'type invalide' }, { status: 400 })

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    // Stream la réponse directement au client
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  controller.enqueue(encoder.encode(parsed.delta.text))
                }
              } catch {}
            }
          }
        }
        controller.close()
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      }
    })

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}