'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { LABELS_FILTRES } from '@/lib/periods'

// Matrice profils → filtres affichés.
// Cf. STRAT_CADRAGE.md §13 + STRAT_ARCHITECTURE.md Décision #2.
//
// Note : le filtre 'personnalise' n'est pas inclus en V1 du composant —
// il sera ajouté quand le DatePicker sera implémenté.
const FILTRES_PAR_PROFIL = {
  pilotage: [
    'hier',
    'cette-semaine',
    'semaine-derniere',
    'ce-mois',
    'mois-dernier',
    'derniers-30-jours',
    'cette-annee'
  ],
  journal: [
    'aujourdhui',
    'hier',
    'cette-semaine',
    'semaine-derniere',
    'ce-mois',
    'mois-dernier',
    'derniers-30-jours',
    'cette-annee'
  ],
  comptable: [
    'cette-semaine',
    'semaine-derniere',
    'ce-mois',
    'mois-dernier',
    'derniers-30-jours',
    'cette-annee'
  ]
}

const FILTRE_DEFAUT_PAR_PROFIL = {
  pilotage: 'ce-mois',
  journal: 'aujourdhui',
  comptable: 'ce-mois'
}

export default function PeriodFilter({ profil, basePath, filtreActif }) {
  const searchParams = useSearchParams()

  if (!FILTRES_PAR_PROFIL[profil]) {
    throw new Error(`Profil PeriodFilter invalide: ${profil}`)
  }

  const filtres = FILTRES_PAR_PROFIL[profil]
  const actif = filtreActif || FILTRE_DEFAUT_PAR_PROFIL[profil]

  function buildHref(filtreId) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('periode', filtreId)
    return `${basePath}?${params.toString()}`
  }

  return (
    <div className="flex flex-wrap gap-1">
      {filtres.map(filtreId => {
        const isActive = filtreId === actif
        return (
          <Link
            key={filtreId}
            href={buildHref(filtreId)}
            className={"flex-1 text-center text-xs py-2 rounded-xl border " +
              (isActive
                ? 'bg-white text-gray-950 border-white font-semibold'
                : 'bg-gray-900 text-gray-400 border-gray-800')}
          >
            {LABELS_FILTRES[filtreId]}
          </Link>
        )
      })}
    </div>
  )
}
