import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { readFileSync } from 'fs'

const supabase = createClient('https://bsmciuzxbspmvmlkzssz.supabase.co', process.env.SUPABASE_ANON_KEY)

const CAT_MAP = {
  'Consommations': 'consommations',
  'Frais de personnel': 'frais_personnel',
  'Autres Charges de personnel': 'autres_charges_personnel',
  'Frais de déplacement': 'frais_deplacement',
  'Entretiens & Réparations': 'entretiens_reparations',
  'Energie': 'energie',
  'Autres Frais Influençables': 'autres_frais_influencables',
  'Loyers & Charges': 'loyers_charges',
  'Honoraires': 'honoraires',
  'Redevance de Marque': 'redevance_marque',
  'Prestations Opérationnelles': 'prestations_operationnelles',
  'Frais Divers': 'frais_divers',
  'Autres frais fixes': 'autres_charges',
  'Autres charges': 'autres_charges',
  'Impots sur les bénéfices': 'autres_charges',
}

function getCategorie(cat) {
  if (!cat) return 'autres_charges'
  return CAT_MAP[cat] || 'autres_charges'
}

const buf = readFileSync(process.env.EXCEL_PATH)
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })

let total = 0

async function importSheet(sheetName, colDesc, colCat, colTVA, colHT, colTTC, colDate) {
  const sheet = wb.Sheets[sheetName]
  if (!sheet) { console.log('Onglet introuvable: ' + sheetName); return }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null })
  const records = []
  
  for (const row of rows) {
    const desc = row[colDesc]
    const cat = row[colCat]
    const date = row[colDate]
    const montantHT = parseFloat(row[colHT] || 0)
    const montantTTC = parseFloat(row[colTTC] || 0)
    if (!date || !desc || !cat) continue
    if (String(desc).startsWith('CA') || String(cat) === 'CA') continue
    if (!montantTTC || montantTTC <= 0) continue
    const categoriePL = getCategorie(String(cat))
    const tauxRaw = colTVA ? row[colTVA] : null
    const tauxTVA = tauxRaw != null ? Math.round(parseFloat(tauxRaw) * 100) : 0
    const ht = montantHT > 0 ? montantHT : (tauxTVA > 0 ? montantTTC / (1 + tauxTVA / 100) : montantTTC)
    const tva = Math.round((montantTTC - ht) * 100) / 100
    const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : String(date).split('T')[0]
    records.push({
      date: dateStr,
      montant_ttc: Math.round(montantTTC * 100) / 100,
      taux_tva: tauxTVA,
      montant_ht: Math.round(ht * 100) / 100,
      montant_tva: tva,
      fournisseur_nom: String(desc).trim(),
      sous_categorie: String(cat).trim(),
      categorie_pl: categoriePL,
      note: 'Import Excel',
    })
  }
  
  for (let i = 0; i < records.length; i += 100) {
    const { error } = await supabase.from('transactions').insert(records.slice(i, i + 100))
    if (error) console.error('Erreur:', error.message)
    else total += Math.min(100, records.length - i)
  }
  console.log('OK ' + sheetName + ': ' + records.length + ' lignes')
}

await importSheet('Data_P&L', 'Description', 'Catégorie', 'Taux TVA', 'Montant HT', 'Montant TTC', 'Date')
await importSheet('Data_P&L N-1', 'Description', 'Catégorie', 'Taux TVA', 'Montant HT', 'Montant TTC', 'Date')
await importSheet('Data24', 'Dépenses', 'Catégorie', null, ' Montant HT', ' Montant TTC', 'Date')
console.log('Total: ' + total + ' lignes')