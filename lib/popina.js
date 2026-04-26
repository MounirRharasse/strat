const BASE_URL = 'https://api.pragma-project.dev'
const BATCH_SIZE = 10

function getHeaders() {
  return {
    'Authorization': `Bearer ${process.env.POPINA_API_KEY}`,
    'Content-Type': 'application/json'
  }
}

const toEuros = (centimes) => Math.round(centimes) / 100
const toISODate = (d) => new Date(d).toISOString().split('T')[0]

async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: getHeaders(),
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(`Popina ${res.status} — ${path}`)
  return res.json()
}

async function fetchAllPages(buildUrl) {
  const first = await apiGet(buildUrl(0))
  const totalPages = first.meta?.totalPage || 1
  if (totalPages <= 1) return first.data || []

  const allData = [...(first.data || [])]

  for (let start = 1; start < totalPages; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, totalPages)
    const batch = await Promise.all(
      Array.from({ length: end - start }, (_, i) => apiGet(buildUrl(start + i)))
    )
    allData.push(...batch.flatMap(r => r.data || []))
  }

  return allData
}

export async function getAllReports(since, until) {
  return fetchAllPages(page => `/v1/reports/?since=${since}&until=${until}&index=${page}&size=100`)
}

export async function getAllOrders(since, until) {
  return fetchAllPages(page => `/v1/orders/?since=${since}&until=${until}&index=${page}&size=100`)
}

function getCanalProduit(p) {
  return (p.category === 'FOXORDERS' || p.category === 'Foxorder') ? 'online' : 'caisse'
}

function repartitionPaiements(payments) {
  const r = { borne: 0, cb: 0, especes: 0, tr: 0, avoir: 0 }
  for (const p of payments) {
    const nom = (p.paymentName || '').toLowerCase()
    const montant = toEuros(p.paymentAmount)
    if (nom.includes('borne')) r.borne += montant
    else if (nom.includes('carte') || nom.includes('credit') || nom.includes('crédit')) r.cb += montant
    else if (nom.includes('esp')) r.especes += montant
    else if (nom.includes('titre') || nom.includes('restaurant')) r.tr += montant
    else if (nom.includes('avoir')) r.avoir += montant
  }
  return r
}

export async function getDailyKPIs(date) {
  const dateStr = toISODate(date || new Date())
  const [reports, orders] = await Promise.all([
    getAllReports(dateStr, dateStr),
    getAllOrders(dateStr, dateStr)
  ])

  if (!reports.length) return { hasData: false, date: dateStr }

  const caTotal = reports.reduce((s, r) => s + toEuros(r.totalSales), 0)
  const allPayments = reports.flatMap(r => r.reportPayments || [])
  const allProducts = reports.flatMap(r => r.reportProducts || [])
  const allTaxes = reports.flatMap(r => r.reportTaxes || [])
  const allDiscounts = reports.flatMap(r => r.reportDiscounts || [])
  const paiements = repartitionPaiements(allPayments)
  const commandesValides = orders.filter(o => !o.isCanceled)
  const nbCommandes = commandesValides.length
  const panierMoyen = nbCommandes > 0 ? caTotal / nbCommandes : 0
  const tva = allTaxes.reduce((s, t) => s + toEuros(t.taxAmount), 0)
  const remises = allDiscounts.reduce((s, d) => s + toEuros(d.discountValue || 0), 0)
  const caisseCA = allProducts.filter(p => getCanalProduit(p) === 'caisse').reduce((s, p) => s + toEuros(p.productSales), 0)
  const onlineCA = allProducts.filter(p => getCanalProduit(p) === 'online').reduce((s, p) => s + toEuros(p.productSales), 0)

  return {
    hasData: true,
    date: dateStr,
    ca: { brut: caTotal, ht: caTotal - tva, tva, remises },
    frequentation: { nbCommandes, couverts: reports.reduce((s, r) => s + (r.guestsNumber || 0), 0) },
    panierMoyen,
    paiements,
    canaux: { caisse: caisseCA, online: onlineCA },
    cashADeposer: paiements.especes,
    commissions: {
      cb: (paiements.borne + paiements.cb) * 0.015,
      tr: paiements.tr * 0.04
    }
  }
}

export async function getMixVentes(since, until) {
  const reports = await getAllReports(since, until)
  if (!reports.length) return { hasData: false }

  const caTotal = reports.reduce((s, r) => s + toEuros(r.totalSales), 0)
  const produitsMap = {}

  for (const report of reports) {
    for (const p of report.reportProducts || []) {
      const key = p.productCatalogId || p.productName
      if (!produitsMap[key]) {
        produitsMap[key] = { nom: p.productName, categorie: p.subCategory, canal: getCanalProduit(p), ca: 0, quantite: 0 }
      }
      produitsMap[key].ca += toEuros(p.productSales)
      produitsMap[key].quantite += p.productQuantity
    }
  }

  const produits = Object.values(produitsMap)
    .filter(p => p.ca > 0)
    .map(p => ({ ...p, pctCA: caTotal > 0 ? (p.ca / caTotal * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.ca - a.ca)

  return {
    hasData: true,
    caTotal,
    top: produits.slice(0, 10),
    flop: [...produits].sort((a, b) => a.ca - b.ca).slice(0, 5)
  }
}

export async function getWeeklyData() {
  const today = new Date()
  const dates = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    dates.push(date)
  }

  return Promise.all(dates.map(async date => {
    const dateStr = toISODate(date)
    const reports = await getAllReports(dateStr, dateStr)
    const ca = reports.reduce((s, r) => s + toEuros(r.totalSales), 0)
    const nbCommandes = reports.reduce((s, r) => s + (r.orders?.length || 0), 0)
    return {
      date: dateStr,
      label: date.toLocaleDateString('fr-FR', { weekday: 'short' }),
      ca,
      nbCommandes,
      panierMoyen: nbCommandes > 0 ? ca / nbCommandes : 0
    }
  }))
}