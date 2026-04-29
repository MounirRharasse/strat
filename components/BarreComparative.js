export default function BarreComparative({ valeurActuelle, valeurPrecedente, max }) {
  const safeMax = max > 0 ? max : 1
  const widthActuelle = Math.max(0, Math.min(100, (valeurActuelle / safeMax) * 100))
  const widthPrecedente = Math.max(0, Math.min(100, (valeurPrecedente / safeMax) * 100))

  return (
    <div className="space-y-1">
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${widthActuelle}%` }} />
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-gray-600 rounded-full" style={{ width: `${widthPrecedente}%` }} />
      </div>
    </div>
  )
}
