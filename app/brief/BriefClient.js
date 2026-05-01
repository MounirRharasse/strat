'use client'

// Sprint IA Phase 1 commit 3 — UI Brief lundi matin.
//
// Lecture du brief en cache (commit 2). Parser markdown maison pour
// extraire les 4 sections du prompt. Fallback contenu brut si parsing KO.

import Link from 'next/link'

const TITRES_KNOWN = {
  resume: ['résumé', 'resume'],
  forts: ['points forts', 'forts'],
  vigilance: ['points de vigilance', 'vigilance'],
  actions: ['actions cette semaine', 'actions']
}

function categoriserSection(titre) {
  const t = titre.toLowerCase().trim()
  for (const [key, alias] of Object.entries(TITRES_KNOWN)) {
    if (alias.some(a => t.includes(a))) return key
  }
  return 'autre'
}

function parserBrief(contenu) {
  if (typeof contenu !== 'string' || !contenu.trim()) return null
  const sections = { resume: '', forts: [], vigilance: [], actions: [] }
  // Capture chaque "## titre\n contenu" jusqu'au prochain "## " ou EOF.
  const regex = /##\s*([^\n]+)\n([\s\S]*?)(?=\n##\s|$)/g
  let m
  while ((m = regex.exec(contenu)) !== null) {
    const titre = m[1].trim()
    // Retire les separateurs `---` que Sonnet ajoute parfois entre sections.
    const corps = m[2].replace(/^---\s*$/gm, '').trim()
    const cat = categoriserSection(titre)
    if (cat === 'resume') {
      sections.resume = corps
    } else if (cat === 'forts' || cat === 'vigilance' || cat === 'actions') {
      sections[cat] = corps
        .split(/\n\s*-\s+/)
        .map(s => s.replace(/^-\s+/, '').trim())
        .filter(s => s.length > 0)
    }
  }
  // Fallback : aucune section detectee → null pour afficher le contenu brut
  if (
    !sections.resume &&
    sections.forts.length === 0 &&
    sections.vigilance.length === 0 &&
    sections.actions.length === 0
  ) {
    return null
  }
  return sections
}

const COLORS = {
  forts: { border: 'border-green-500', bg: 'bg-green-950/20' },
  vigilance: { border: 'border-yellow-500', bg: 'bg-yellow-950/20' },
  actions: { border: 'border-blue-500', bg: 'bg-blue-950/20' }
}

function CardSection({ titre, items, type }) {
  const c = COLORS[type]
  return (
    <div className="mb-5">
      <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-2">{titre}</h2>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className={`border-l-2 ${c.border} ${c.bg} rounded-r-lg px-3 py-2`}>
            <p className="text-sm text-gray-200 leading-relaxed">{item}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BriefClient({ brief, semaine_iso, periode }) {
  const contenuParse = brief?.contenu ? parserBrief(brief.contenu) : null
  const dateGen = brief?.generee_le
    ? new Date(brief.generee_le).toLocaleDateString('fr-FR', {
        day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
      })
    : null

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto pb-24">
      <Link href="/" className="inline-block text-xs text-gray-500 hover:text-white mb-4">
        ‹ Mon Business
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">📊 Brief de la semaine</h1>
        <p className="text-violet-300 text-xs mt-1">
          Semaine {periode.semaine} · {periode.label_humain}
        </p>
      </div>

      {!brief && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4">
          <p className="text-sm text-gray-300 leading-relaxed">
            Le brief de cette semaine n'est pas encore généré. Il arrivera lundi prochain à 8h.
          </p>
        </div>
      )}

      {brief && !contenuParse && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Contenu brut</p>
          <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{brief.contenu}</p>
        </div>
      )}

      {contenuParse && (
        <>
          {contenuParse.resume && (
            <div className="bg-violet-950/30 border border-violet-900/60 rounded-2xl p-4 mb-5">
              <p className="text-xs uppercase tracking-widest text-violet-300 mb-2">Résumé</p>
              <p className="text-sm text-gray-200 leading-relaxed">{contenuParse.resume}</p>
            </div>
          )}
          {contenuParse.forts.length > 0 && (
            <CardSection titre="3 points forts" items={contenuParse.forts} type="forts" />
          )}
          {contenuParse.vigilance.length > 0 && (
            <CardSection titre="3 points de vigilance" items={contenuParse.vigilance} type="vigilance" />
          )}
          {contenuParse.actions.length > 0 && (
            <CardSection titre="3 actions cette semaine" items={contenuParse.actions} type="actions" />
          )}
        </>
      )}

      {brief && dateGen && (
        <p className="text-xs text-gray-600 mt-6 text-center">
          Brief généré le {dateGen} · prochain brief lundi prochain
        </p>
      )}
    </div>
  )
}
