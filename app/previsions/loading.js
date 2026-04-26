export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-gray-800 border-t-white rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Calcul des prévisions en cours...</p>
        <p className="text-xs text-gray-600">Récupération des données de caisse</p>
      </div>
    </div>
  )
}
