import { getAllReports } from '@/lib/popina'
import PreviClient from './PreviClient'

export default async function Previsions() {
  const now = new Date()
  const firstDay = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
  const since = firstDay.toISOString().split('T')[0]
  const today = now.toISOString().split('T')[0]

  const toEuros = (c) => Math.round(c) / 100

  const reports = await getAllReports(since, today)

  const caBrut = reports.reduce((s, r) => s + toEuros(r.totalSales), 0)
  const tvaCollectee = reports.reduce((s, r) => s + (r.reportTaxes || []).reduce((t, x) => t + toEuros(x.taxAmount), 0), 0)
  const nbCommandesTotal = reports.reduce((s, r) => s + (r.orders?.length || 0), 0)

  const nbJours = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const nbJoursEcoules = now.getDate()
  const nbJoursRestants = nbJours - nbJoursEcoules
  const panierMoyen = nbCommandesTotal > 0 ? caBrut / nbCommandesTotal : 14.5
  const commandesParJour = nbJoursEcoules > 0 ? Math.round(nbCommandesTotal / nbJoursEcoules) : 150

  const kpis = { caBrut, tvaCollectee }

  return (
    <PreviClient
      kpis={kpis}
      caActuel={caBrut}
      nbJours={nbJours}
      nbJoursEcoules={nbJoursEcoules}
      nbJoursRestants={nbJoursRestants}
      panierMoyen={panierMoyen}
      commandesParJour={commandesParJour}
    />
  )
}