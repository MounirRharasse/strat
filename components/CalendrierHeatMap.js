'use client'

// Heat-map calendrier 30 jours pour /journal.
// 4 états V1 (decision Mounir 2026-04-30, ré-introduction de 'partiel') :
//   - complet  : tous les canaux attendus ont une saisie ce jour
//   - partiel  : au moins 1 saisie ET au moins 1 canal attendu manquant
//                (en V1 = Uber attendu mais 0€ alors que médiane ≥ 50€)
//   - manquant : jour ouvré sans aucune saisie
//   - ferme    : jour de fermeture hebdomadaire (parametres.jours_fermes_semaine)
//
// Layout mobile 448px : grille 7 colonnes alignée sur lundi.
// Fenêtre 30j roulants [today-30, today-1] (today exclu : service en cours).

const COULEURS = {
  complet: 'bg-green-600 hover:bg-green-500',
  partiel: 'bg-orange-500 hover:bg-orange-400',
  manquant: 'bg-red-700 hover:bg-red-600',
  ferme: 'bg-gray-700 hover:bg-gray-600'
}

const JOURS_HEADER = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']

export default function CalendrierHeatMap({ data, selectedDate, onSelect }) {
  if (!data || data.length === 0) return null

  // Aligner le 1er jour sur la colonne lundi.
  // JS getDay() : 0=dimanche, 1=lundi, ..., 6=samedi
  // Notre grille : 0=lundi, 1=mardi, ..., 6=dimanche
  const premierJourDate = new Date(data[0].date + 'T12:00:00')
  const dayJS = premierJourDate.getDay()
  const offsetLundi = (dayJS + 6) % 7

  const cells = []
  for (let i = 0; i < offsetLundi; i++) {
    cells.push({ empty: true, key: 'empty-' + i })
  }
  for (const d of data) {
    cells.push({ ...d, key: d.date })
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {JOURS_HEADER.map((j, i) => (
          <div key={i} className="text-center text-[9px] text-gray-600 uppercase tracking-wider">
            {j}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map(cell => {
          if (cell.empty) return <div key={cell.key} />
          const dayNum = new Date(cell.date + 'T12:00:00').getDate()
          const isSelected = cell.date === selectedDate
          const couleur = COULEURS[cell.etat] || 'bg-gray-800'
          return (
            <button
              key={cell.key}
              onClick={() => onSelect && onSelect(cell.date)}
              className={
                'aspect-square rounded text-[10px] font-medium text-white transition ' +
                couleur +
                (isSelected ? ' ring-2 ring-white' : '')
              }
              aria-label={cell.date + ' (' + cell.etat + ')'}
            >
              {dayNum}
            </button>
          )
        })}
      </div>

      <div className="flex justify-center flex-wrap gap-x-3 gap-y-1 mt-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-green-600"></span>complet
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-orange-500"></span>partiel
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-red-700"></span>manquant
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-gray-700"></span>fermé
        </span>
      </div>
    </div>
  )
}
