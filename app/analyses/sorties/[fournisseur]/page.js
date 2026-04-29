import { redirect } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getParametreIdFromSession } from '@/lib/auth'
import { getPeriodeFromFiltreId, periodePrecedenteAEgaleDuree } from '@/lib/periods'
import { CATEGORIE_LABELS, SOUS_CAT_LABELS } from '@/lib/analyses/sorties'

const fmt = (n) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 2
}).format(n || 0)

export default async function FournisseurDetail({ params, searchParams }) {
  let parametre_id
  try {
    parametre_id = await getParametreIdFromSession()
  } catch {
    redirect('/login')
  }

  const fournisseur = decodeURIComponent(params.fournisseur)
  const periode = searchParams?.periode || 'ce-mois'

  const { data: parametres } = await supabase
    .from('parametres')
    .select('*')
    .eq('id', parametre_id)
    .single()

  const timezone = parametres?.timezone || 'Europe/Paris'

  const periodeActuelle = getPeriodeFromFiltreId(periode, { timezone })
  const periodePrec = periodePrecedenteAEgaleDuree(periodeActuelle)

  const [{ data: txActuelles }, { data: txPrec }] = await Promise.all([
    supabase
      .from('transactions')
      .select('*')
      .eq('parametre_id', parametre_id)
      .eq('fournisseur_nom', fournisseur)
      .gte('date', periodeActuelle.since)
      .lte('date', periodeActuelle.until)
      .order('date', { ascending: false }),
    supabase
      .from('transactions')
      .select('montant_ttc')
      .eq('parametre_id', parametre_id)
      .eq('fournisseur_nom', fournisseur)
      .gte('date', periodePrec.since)
      .lte('date', periodePrec.until)
  ])

  const transactions = txActuelles || []
  const totalActuel = transactions.reduce((s, t) => s + (t.montant_ttc || 0), 0)
  const totalPrecedent = (txPrec || []).reduce((s, t) => s + (t.montant_ttc || 0), 0)

  let variationPct = null
  let variationLabel = null
  if (totalPrecedent === 0 && totalActuel > 0) variationLabel = 'Nouveau'
  else if (totalPrecedent === 0 && totalActuel === 0) variationLabel = '—'
  else if (totalPrecedent > 0) variationPct = ((totalActuel - totalPrecedent) / totalPrecedent) * 100

  const backHref = `/analyses?onglet=sorties&periode=${periode}`

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto pb-24">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-gray-400 mb-3">
        <span>‹</span>
        <span>Retour Sorties</span>
      </Link>

      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight truncate">{fournisseur}</h1>
        <p className="text-gray-400 text-xs mt-0.5">
          {periodeActuelle.label} · {periodeActuelle.since} → {periodeActuelle.until}
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Total · TTC</p>
        <div className="flex items-baseline gap-3">
          <p className="text-2xl font-mono font-bold text-white">{fmt(totalActuel)}</p>
          {variationPct !== null && (
            <p className={"text-sm font-mono " + (variationPct > 0 ? 'text-red-400' : 'text-green-400')}>
              {variationPct > 0 ? '+' : ''}{variationPct.toFixed(1)}%
            </p>
          )}
          {variationLabel && (
            <p className="text-sm font-mono text-gray-500">{variationLabel}</p>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          vs {fmt(totalPrecedent)} période précédente · {transactions.length} transaction{transactions.length > 1 ? 's' : ''}
        </p>
      </div>

      {transactions.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
          <p className="text-gray-400 text-sm">Aucune transaction de {fournisseur} sur cette période</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {transactions.map((t, idx) => (
            <div key={t.id} className={"px-4 py-3 " + (idx > 0 ? 'border-t border-gray-800' : '')}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <p className="text-sm font-medium text-white truncate">
                  {t.note || CATEGORIE_LABELS[t.categorie_pl] || t.categorie_pl}
                </p>
                <p className="text-sm font-mono font-semibold text-white whitespace-nowrap">{fmt(t.montant_ttc)}</p>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{t.date}</span>
                <span className="truncate ml-2">
                  {t.sous_categorie ? (SOUS_CAT_LABELS[t.sous_categorie] || t.sous_categorie) : ''}
                  {t.taux_tva ? ` · TVA ${t.taux_tva}%` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
