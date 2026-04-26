import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request) {
  try {
    const formData = await request.formData()
    const parametre_id = formData.get('parametre_id')
    const fichier = formData.get('fichier')
    const type = formData.get('type')
    const mappingRaw = formData.get('mapping')
    const mapping = mappingRaw ? JSON.parse(mappingRaw) : {}

    if (!parametre_id || !UUID_REGEX.test(parametre_id)) {
      return Response.json({ error: 'parametre_id requis et au format UUID' }, { status: 400 })
    }

    const { data: tenant } = await supabase
      .from('parametres')
      .select('id')
      .eq('id', parametre_id)
      .single()
    if (!tenant) {
      return Response.json({ error: `parametre_id introuvable: ${parametre_id}` }, { status: 400 })
    }

    const buffer = await fichier.arrayBuffer()
    let rows = []

    if (fichier.name.endsWith('.csv')) {
      const text = new TextDecoder('utf-8').decode(buffer)
      const lines = text.split('\n').filter(l => l.trim())
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
      rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
        const obj = {}
        headers.forEach((h, i) => obj[h] = vals[i] || '')
        return obj
      })
    } else {
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json(sheet, { defval: null })
    }

    const get = (row, key) => {
      const col = mapping[key]
      return col ? row[col] : null
    }

    let inserted = 0
    let ignored = 0
    const errors = []

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
      'Impôts sur les bénéfices': 'autres_charges',
    }

    const parseDate = (val) => {
      if (!val) return null
      const s = String(val)
      if (s.includes('/')) return s.split('/').reverse().join('-')
      return s.split('T')[0]
    }

    const records = []

    for (const row of rows) {
      try {
        const date = parseDate(get(row, 'date'))
        if (!date || date === 'null') { ignored++; continue }

        if (type === 'historique_ca') {
          const caBrut = parseFloat(get(row, 'ca_brut') || 0)
          if (!caBrut) { ignored++; continue }
          records.push({
            date,
            ca_brut: caBrut,
            ca_ht: parseFloat(get(row, 'ca_ht') || 0),
            especes: parseFloat(get(row, 'especes') || 0),
            cb: parseFloat(get(row, 'cb') || 0),
            tpa: parseFloat(get(row, 'tpa') || 0),
            tr: parseFloat(get(row, 'tr') || 0),
            uber: parseFloat(get(row, 'uber') || 0),
            commission_uber: parseFloat(get(row, 'commission_uber') || 0),
            nb_commandes: parseInt(get(row, 'nb_commandes') || 0),
          })
        }

        if (type === 'transactions') {
          const montantTTC = parseFloat(get(row, 'montant_ttc') || 0)
          const fournisseur = get(row, 'fournisseur_nom')
          if (!montantTTC || !fournisseur) { ignored++; continue }
          const tauxTVA = parseFloat(get(row, 'taux_tva') || 0)
          const montantHT = get(row, 'montant_ht') ? parseFloat(get(row, 'montant_ht')) : (tauxTVA > 0 ? montantTTC / (1 + tauxTVA / 100) : montantTTC)
          const cat = get(row, 'categorie_pl') || ''
          records.push({
            date,
            montant_ttc: montantTTC,
            taux_tva: tauxTVA,
            montant_ht: Math.round(montantHT * 100) / 100,
            montant_tva: Math.round((montantTTC - montantHT) * 100) / 100,
            fournisseur_nom: String(fournisseur).trim(),
            sous_categorie: get(row, 'sous_categorie') || '',
            categorie_pl: CAT_MAP[cat] || cat || 'autres_charges',
            note: get(row, 'note') || 'Import',
          })
        }

        if (type === 'uber_orders') {
          const produit = get(row, 'produit')
          const quantite = parseFloat(get(row, 'quantite') || 0)
          const ventesTTC = parseFloat(get(row, 'ventes_ttc') || 0)
          const statut = get(row, 'statut')
          if (!produit || quantite <= 0) { ignored++; continue }
          if (statut && !['Terminée', 'completed', ''].includes(String(statut))) { ignored++; continue }
          records.push({
            date,
            heure: get(row, 'heure') ? String(get(row, 'heure')).substring(0, 5) : null,
            order_id: get(row, 'order_id') || null,
            produit: String(produit).trim(),
            quantite,
            ventes_ht: parseFloat(get(row, 'ventes_ht') || 0),
            ventes_ttc: ventesTTC,
            montant_net: parseFloat(get(row, 'montant_net') || 0),
          })
        }

        if (type === 'entrees') {
          const montantTTC = parseFloat(get(row, 'montant_ttc') || 0)
          if (!montantTTC) { ignored++; continue }
          const tauxTVA = parseFloat(get(row, 'taux_tva') || 10)
          const montantHT = montantTTC / (1 + tauxTVA / 100)
          records.push({
            date,
            montant_ttc: montantTTC,
            taux_tva: tauxTVA,
            montant_ht: Math.round(montantHT * 100) / 100,
            montant_tva: Math.round((montantTTC - montantHT) * 100) / 100,
            source: get(row, 'source') || 'uber_eats',
            nb_commandes: parseInt(get(row, 'nb_commandes') || 0),
            note: get(row, 'note') || '',
          })
        }
      } catch (e) {
        ignored++
      }
    }

    const table = type === 'historique_ca' ? 'historique_ca' :
                  type === 'transactions' ? 'transactions' :
                  type === 'uber_orders' ? 'uber_orders' : 'entrees'

    const upsertKey = type === 'historique_ca' ? 'parametre_id,date' : null

    const recordsAvecTenant = records.map(r => ({ ...r, parametre_id }))

    for (let i = 0; i < recordsAvecTenant.length; i += 100) {
      const batch = recordsAvecTenant.slice(i, i + 100)
      const { error } = upsertKey
        ? await supabase.from(table).upsert(batch, { onConflict: upsertKey })
        : await supabase.from(table).insert(batch)
      if (error) { errors.push(error.message); ignored += batch.length }
      else inserted += batch.length
    }

    return Response.json({ inserted, ignored, errors: errors.slice(0, 5) })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}