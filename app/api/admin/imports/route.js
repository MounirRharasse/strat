import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

export async function POST(request) {
  try {
    const formData = await request.formData()
    const fichier = formData.get('fichier')
    const type = formData.get('type')

    const buffer = await fichier.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null })

    let inserted = 0
    let ignored = 0
    const errors = []

    if (type === 'historique_ca') {
      for (const row of rows) {
        try {
          const date = row['Date'] ? new Date(row['Date']).toISOString().split('T')[0] : null
          if (!date) { ignored++; continue }
          const record = {
            date,
            ca_brut: parseFloat(row['CA Brut'] || row['ca_brut'] || 0),
            ca_ht: parseFloat(row['CA HT'] || row['ca_ht'] || 0),
            especes: parseFloat(row['Especes'] || row['especes'] || row['Espèces'] || 0),
            cb: parseFloat(row['CB'] || row['cb'] || 0),
            tpa: parseFloat(row['TPA'] || row['tpa'] || 0),
            tr: parseFloat(row['TR'] || row['tr'] || 0),
            uber: parseFloat(row['Uber'] || row['uber'] || 0),
            commission_uber: parseFloat(row['Commission Uber'] || row['commission_uber'] || 0),
            nb_commandes: parseInt(row['Nb Commandes'] || row['nb_commandes'] || 0),
          }
          const { error } = await supabase.from('historique_ca').upsert(record, { onConflict: 'date' })
          if (error) { errors.push(date); ignored++ } else inserted++
        } catch (e) { ignored++ }
      }
    }

    if (type === 'transactions') {
      for (const row of rows) {
        try {
          const date = row['Date'] ? new Date(row['Date']).toISOString().split('T')[0] : null
          if (!date) { ignored++; continue }
          const montantTTC = parseFloat(row['Montant TTC'] || row['montant_ttc'] || 0)
          const tauxTVA = parseFloat(row['Taux TVA'] || row['taux_tva'] || 0)
          const montantHT = tauxTVA > 0 ? montantTTC / (1 + tauxTVA / 100) : montantTTC
          const montantTVA = montantTTC - montantHT
          const fournisseurNom = row['Fournisseur'] || row['fournisseur_nom'] || ''
          const record = {
            date,
            montant_ttc: montantTTC,
            taux_tva: tauxTVA,
            montant_ht: Math.round(montantHT * 100) / 100,
            montant_tva: Math.round(montantTVA * 100) / 100,
            fournisseur_nom: fournisseurNom,
            fournisseur_id: fournisseurNom.toLowerCase().trim(),
            sous_categorie: row['Sous-catégorie'] || row['sous_categorie'] || '',
            categorie_pl: row['Catégorie P&L'] || row['categorie_pl'] || 'autres_charges',
            note: row['Note'] || row['note'] || '',
          }
          const { error } = await supabase.from('transactions').insert(record)
          if (error) { errors.push(date); ignored++ } else inserted++
        } catch (e) { ignored++ }
      }
    }

    return Response.json({ inserted, ignored, errors })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}