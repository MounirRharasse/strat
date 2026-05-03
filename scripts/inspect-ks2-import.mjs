// Inspection lecture pure du fichier KS2 (1) (5).xlsx pour préparer l'import
// vers ventes_par_source + paiements_caisse.
// AUCUNE écriture nulle part.

import XLSX from 'xlsx'

const FILE = '/Users/mRharasse/Downloads/KS2 (1) (5).xlsx'

const wb = XLSX.readFile(FILE, { cellDates: false, cellNF: true, cellText: true })
const out = {}

out.A1_onglets = wb.SheetNames

function readSheet(name) {
  const ws = wb.Sheets[name]
  if (!ws) return null
  // header:1 = pas d'auto-mapping. defval:'' pour stabilité. raw:true pour valeurs brutes.
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: true })
}

function serialToISO(n) {
  if (!Number.isFinite(n) || n < 1000) return null
  const epoch = new Date(Date.UTC(1899, 11, 30))
  return new Date(epoch.getTime() + n * 86400000).toISOString().slice(0, 10)
}

function inspectSheet(name) {
  const rows = readSheet(name)
  if (!rows) return { absent: true }

  const result = {
    nb_lignes_total: rows.length,
    header_row_0: rows[0] ? rows[0].slice(0, 25).map((v, i) => ({ col_letter: String.fromCharCode(65 + i), col_index: i, value: v, type: typeof v })) : null,
    header_row_1_si_present: rows[1] ? rows[1].slice(0, 25).map((v, i) => ({ col_letter: String.fromCharCode(65 + i), col_index: i, value: v, type: typeof v })) : null,
    sample_rows_2_3_4: rows.slice(2, 5).map((r, idx) => ({
      row_index: idx + 2,
      values_A_to_W: r.slice(0, 23).map((v, i) => ({ col_letter: String.fromCharCode(65 + i), value: v, type: typeof v })),
    })),
  }
  return result
}

// ─── A.1 + A.2 + A.3 + A.4 — Onglets et headers ─────────────────────────
const NOMS_ONGLETS_VOULUS = ['Data_CA_N-2', 'Data_CA_N-1', 'Data_CA']
out.A2_inspect_onglets = {}
for (const nom of NOMS_ONGLETS_VOULUS) {
  out.A2_inspect_onglets[nom] = inspectSheet(nom)
}

// ─── A.5 + A.6 — Première et dernière ligne datée par onglet de scope ──
function dateRange(name, sinceISO, untilISO) {
  const rows = readSheet(name)
  if (!rows) return { absent: true }
  const datesObservees = []
  let lignes_avec_date = 0
  let premiere_ligne = null
  let derniere_ligne = null
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const v0 = r[0]
    let iso = null
    if (typeof v0 === 'number') iso = serialToISO(v0)
    else if (typeof v0 === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v0)) iso = v0
    else if (typeof v0 === 'string' && /^\d{2}\/\d{2}\/\d{4}/.test(v0)) {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v0)
      iso = `${m[3]}-${m[2]}-${m[1]}`
    }
    if (!iso) continue
    if (sinceISO && iso < sinceISO) continue
    if (untilISO && iso > untilISO) continue
    lignes_avec_date++
    datesObservees.push({ row: i, iso, valeur_brute_A: v0, type_A: typeof v0 })
    if (!premiere_ligne) premiere_ligne = { row: i, iso, valeur_brute: v0 }
    derniere_ligne = { row: i, iso, valeur_brute: v0 }
  }
  return { lignes_avec_date, premiere_ligne, derniere_ligne }
}

out.A5_Data_CA_N2_2024_range = dateRange('Data_CA_N-2', '2024-04-18', '2024-12-31')
out.A6_Data_CA_N1_2025_range = dateRange('Data_CA_N-1', '2025-01-01', '2025-01-15')

// ─── A.7 — Lignes "vides" (date présente mais montants 0) sur scope ────
function rowsVides(name, sinceISO, untilISO) {
  const rows = readSheet(name)
  if (!rows) return { absent: true }
  const vides = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const v0 = r[0]
    let iso = null
    if (typeof v0 === 'number') iso = serialToISO(v0)
    else if (typeof v0 === 'string' && /^(\d{2})\/(\d{2})\/(\d{4})/.test(v0)) {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v0)
      iso = `${m[3]}-${m[2]}-${m[1]}`
    }
    if (!iso) continue
    if (sinceISO && iso < sinceISO) continue
    if (untilISO && iso > untilISO) continue
    const num = (v) => Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0
    const especes = num(r[4]); const cb = num(r[5]); const tpa = num(r[6]); const tr = num(r[7]); const uber = num(r[8])
    if (especes === 0 && cb === 0 && tpa === 0 && tr === 0 && uber === 0) {
      vides.push({ row: i, iso, A: v0, E: r[4], F: r[5], G: r[6], H: r[7], I: r[8] })
    }
  }
  return { nb_lignes_vides: vides.length, exemples: vides.slice(0, 30), liste_dates: vides.map(v => v.iso) }
}
out.A7_lignes_vides_2024 = rowsVides('Data_CA_N-2', '2024-04-18', '2024-12-31')
out.A7_lignes_vides_2025_jusqu_15 = rowsVides('Data_CA_N-1', '2025-01-01', '2025-01-15')

// ─── B — 5 jours échantillon ────────────────────────────────────────────
function readDayValues(sheetName, isoDate) {
  const rows = readSheet(sheetName)
  if (!rows) return null
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const v0 = r[0]
    let iso = null
    if (typeof v0 === 'number') iso = serialToISO(v0)
    else if (typeof v0 === 'string' && /^(\d{2})\/(\d{2})\/(\d{4})/.test(v0)) {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v0)
      iso = `${m[3]}-${m[2]}-${m[1]}`
    }
    if (iso === isoDate) {
      return {
        row: i,
        date_iso: isoDate,
        cellule_A_brute: { val: v0, type: typeof v0 },
        E_especes: { val: r[4], type: typeof r[4] },
        F_cb: { val: r[5], type: typeof r[5] },
        G_tpa: { val: r[6], type: typeof r[6] },
        H_tr: { val: r[7], type: typeof r[7] },
        I_uber: { val: r[8], type: typeof r[8] },
        V_nb_vsp: { val: r[21], type: typeof r[21] },
        W_nb_uber: { val: r[22], type: typeof r[22] },
      }
    }
  }
  return null
}

// 5 jours échantillon : 1 avr 2024, 1 jul 2024, 1 nov 2024, 1 dec 2024, 15/01/2025
const ECHANTILLON = [
  { date: '2024-04-25', sheet: 'Data_CA_N-2', label: 'avril-2024' },
  { date: '2024-07-15', sheet: 'Data_CA_N-2', label: 'juillet-2024' },
  { date: '2024-11-15', sheet: 'Data_CA_N-2', label: 'novembre-2024' },
  { date: '2024-12-20', sheet: 'Data_CA_N-2', label: 'decembre-2024' },
  { date: '2025-01-15', sheet: 'Data_CA_N-1', label: '15-jan-2025' },
]
out.B_echantillon = []
const num = (v) => Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0
for (const e of ECHANTILLON) {
  const cell = readDayValues(e.sheet, e.date)
  if (!cell) {
    out.B_echantillon.push({ ...e, statut: 'date introuvable dans onglet' })
    continue
  }
  const especes = num(cell.E_especes.val)
  const cb = num(cell.F_cb.val)
  const tpa = num(cell.G_tpa.val)
  const tr = num(cell.H_tr.val)
  const uber = num(cell.I_uber.val)
  out.B_echantillon.push({
    ...e,
    cellules_brutes: cell,
    valeurs_calculees: {
      ventes_popina_montant_ttc: Math.round((especes + cb + tpa + tr) * 100) / 100,
      ventes_uber_montant_ttc: uber,
      ventes_uber_ligne_creee: uber > 0,
      paiements_caisse: {
        especes: especes,
        cb_avec_tpa_fusionne: Math.round((cb + tpa) * 100) / 100,
        tr: tr,
      },
    },
  })
}

// ─── C — Risques techniques détectables ─────────────────────────────────

// C1. Cellules fusionnées sur les onglets de scope ?
function cellulesFusionnees(name) {
  const ws = wb.Sheets[name]
  if (!ws) return null
  return (ws['!merges'] || []).map(m => XLSX.utils.encode_range(m))
}
out.C_cellules_fusionnees = {
  'Data_CA_N-2': cellulesFusionnees('Data_CA_N-2'),
  'Data_CA_N-1': cellulesFusionnees('Data_CA_N-1'),
}

// C2. Doublons de date dans la période d'import par onglet
function doublonsDate(name, sinceISO, untilISO) {
  const rows = readSheet(name)
  if (!rows) return null
  const counts = {}
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const v0 = r[0]
    let iso = null
    if (typeof v0 === 'number') iso = serialToISO(v0)
    else if (typeof v0 === 'string' && /^(\d{2})\/(\d{2})\/(\d{4})/.test(v0)) {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v0)
      iso = `${m[3]}-${m[2]}-${m[1]}`
    }
    if (!iso) continue
    if (sinceISO && iso < sinceISO) continue
    if (untilISO && iso > untilISO) continue
    counts[iso] = (counts[iso] || 0) + 1
  }
  const dupes = Object.entries(counts).filter(([d, n]) => n > 1).map(([d, n]) => ({ date: d, nb_lignes: n }))
  return { dates_uniques: Object.keys(counts).length, doublons: dupes }
}
out.C_doublons_date_2024 = doublonsDate('Data_CA_N-2', '2024-04-18', '2024-12-31')
out.C_doublons_date_2025_jusqu_15 = doublonsDate('Data_CA_N-1', '2025-01-01', '2025-01-15')

// C3. Lignes Total/sous-total dans le fichier (header A != date)
function lignesNonDate(name) {
  const rows = readSheet(name)
  if (!rows) return null
  const susp = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const v0 = r[0]
    if (typeof v0 === 'number' && v0 > 1000) continue
    if (typeof v0 === 'string' && /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/.test(v0)) continue
    if (v0 === '' || v0 === null || v0 === undefined) continue
    susp.push({ row: i, A: v0, type: typeof v0, B: r[1], E: r[4], I: r[8] })
  }
  return { nb_lignes_non_date: susp.length, exemples: susp.slice(0, 20) }
}
out.C_lignes_non_date_N2 = lignesNonDate('Data_CA_N-2')
out.C_lignes_non_date_N1 = lignesNonDate('Data_CA_N-1')

// C4. Format des nombres : présence de string vs number en colonne E sur 5 dates aléatoires
function formatNumeriques(name, indices = [10, 50, 100, 150, 200]) {
  const rows = readSheet(name)
  if (!rows) return null
  return indices.filter(i => i < rows.length).map(i => {
    const r = rows[i]
    return {
      row: i,
      A_type: typeof r[0],
      E_type: typeof r[4], E_val: r[4],
      F_type: typeof r[5], F_val: r[5],
      G_type: typeof r[6], G_val: r[6],
      H_type: typeof r[7], H_val: r[7],
      I_type: typeof r[8], I_val: r[8],
    }
  })
}
out.C_format_numeriques_N2 = formatNumeriques('Data_CA_N-2')
out.C_format_numeriques_N1 = formatNumeriques('Data_CA_N-1', [5, 10, 14, 15, 16])

// C5. Détection de valeurs négatives sur la période d'import
function valeursNegatives(name, sinceISO, untilISO) {
  const rows = readSheet(name)
  if (!rows) return null
  const negs = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const v0 = r[0]
    let iso = null
    if (typeof v0 === 'number') iso = serialToISO(v0)
    else if (typeof v0 === 'string' && /^(\d{2})\/(\d{2})\/(\d{4})/.test(v0)) {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v0)
      iso = `${m[3]}-${m[2]}-${m[1]}`
    }
    if (!iso) continue
    if (sinceISO && iso < sinceISO) continue
    if (untilISO && iso > untilISO) continue
    for (const colIdx of [4, 5, 6, 7, 8]) {
      const v = parseFloat(r[colIdx])
      if (Number.isFinite(v) && v < 0) negs.push({ row: i, iso, col_letter: String.fromCharCode(65 + colIdx), val: r[colIdx] })
    }
  }
  return negs
}
out.C_valeurs_negatives_2024 = valeursNegatives('Data_CA_N-2', '2024-04-18', '2024-12-31')
out.C_valeurs_negatives_2025_jusqu_15 = valeursNegatives('Data_CA_N-1', '2025-01-01', '2025-01-15')

console.log(JSON.stringify(out, null, 2))
process.exit(0)
