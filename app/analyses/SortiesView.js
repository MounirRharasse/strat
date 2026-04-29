export default function SortiesView({ transactions, periode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
      <p className="text-gray-300 font-semibold mb-1">Bientôt : drill-down de tes dépenses</p>
      <p className="text-gray-500 text-xs">
        {transactions?.length || 0} transactions sur la période
      </p>
    </div>
  )
}
