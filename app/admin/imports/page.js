'use client'

import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'

const CHAMPS_CIBLES = {
  historique_ca: [
    { key: 'date', label: 'Date', required: true },
    { key: 'ca_brut', label: 'CA Brut TTC', required: true },
    { key: 'ca_ht', label: 'CA HT', required: false },
    { key: 'especes', label: 'Espèces', required: false },
    { key: 'cb', label: 'Carte bancaire', required: false },
    { key: 'tpa', label: 'Borne / TPA', required: false },
    { key: 'tr', label: 'Titres-restaurant', required: false },
    { key: 'uber', label: 'CA Uber Eats', required: false },
    { key: 'commission_uber', label: 'Commission Uber', required: false },
    { key: 'nb_commandes', label: 'Nb Commandes', required: false },
  ],
  transactions: [
    { key: 'date', label: 'Date', required: true },
    { key: 'montant_ttc', label: 'Montant TTC', required: true },
    { key: 'taux_tva', label: 'Taux TVA (%)', required: false },
    { key: 'montant_ht', label: 'Montant HT', required: false },
    { key: 'fournisseur_nom', label: 'Fournisseur', required: true },
    { key: 'categorie_pl', label: 'Catégorie P&L', required: true },
    { key: 'sous_categorie', label: 'Sous-catégorie', required: false },
    { key: 'note', label: 'Note', required: false },
  ],
  uber_orders: [
    { key: 'date', label: 'Date', required: true },
    { key: 'heure', label: 'Heure', required: false },
    { key: 'order_id', label: 'ID Commande', required: false },
    { key: 'produit', label: 'Produit', required: true },
    { key: 'quantite', label: 'Quantité', required: true },
    { key: 'ventes_ht', label: 'Ventes HT', required: false },
    { key: 'ventes_ttc', label: 'Ventes TTC', required: true },
    { key: 'montant_net', label: 'Montant net versé', required: false },
    { key: 'statut', label: 'Statut commande', required: false },
  ],
  entrees: [
    { key: 'date', label: 'Date', required: true },
    { key: 'montant_ttc', label: 'Montant TTC', required: true },
    { key: 'taux_tva', label: 'Taux TVA (%)', required: false },
    { key: 'source', label: 'Source', required: true },
    { key: 'nb_commandes', label: 'Nb Commandes', required: false },
    { key: 'note', label: 'Note', required: false },
  ],
}

const TYPES = [
  { value: 'historique_ca', label: 'CA Historique', desc: 'CA par jour' },
  { value: 'transactions', label: 'Dépenses', desc: 'Achats fournisseurs' },
  { value: 'uber_orders', label: 'Commandes Uber', desc: 'Rapport détaillé Uber Eats' },
  { value: 'entrees', label: 'Entrées', desc: 'Autres sources de CA' },
]

export default function AdminImports() {
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState('')
  const [type, setType] = useState('uber_orders')
  const [fichier, setFichier] = useState(null)
  const [colonnesFichier, setColonnesFichier] = useState([])
  const [apercu, setApercu] = useState([])
  const [mapping, setMapping] = useState({})
  const [loading, setLoading] = useState(false)
  const [resultat, setResultat] = useState(null)
  const [etape, setEtape] = useState(1) // 1: config, 2: mapping, 3: résultat

  useEffect(() => {
    fetch('/api/admin/clients').then(r => r.json()).then(data => {
      setClients(Array.isArray(data) ? data : [])
    })
  }, [])

  // Charger le mapping sauvegardé quand client+type changent
  useEffect(() => {
    if (!clientId || !type) return
    fetch(`/api/admin/mappings?clientId=${clientId}&type=${type}`)
      .then(r => r.json())
      .then(d => { if (d.mapping) setMapping(d.mapping) })
      .catch(() => {})
  }, [clientId, type])

  // Reset quand le type change
  useEffect(() => {
    setMapping({})
    setFichier(null)
    setColonnesFichier([])
    setApercu([])
    setEtape(1)
    setResultat(null)
  }, [type])

  async function lireFichier(file) {
    setFichier(file)
    setResultat(null)

    const buf = await file.arrayBuffer()
    let rows = []

    if (file.name.endsWith('.csv')) {
      const text = new TextDecoder('utf-8').decode(buf)
      const lines = text.split('\n').filter(l => l.trim())
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
      rows = lines.slice(1, 4).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
        const obj = {}
        headers.forEach((h, i) => obj[h] = vals[i] || '')
        return obj
      })
      setColonnesFichier(headers)
    } else {
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      rows = data.slice(0, 3)
      setColonnesFichier(data.length > 0 ? Object.keys(data[0]) : [])
    }

    setApercu(rows)

    // Auto-mapping intelligent
    const champs = CHAMPS_CIBLES[type] || []
    const autoMap = {}
    champs.forEach(champ => {
      // Cherche une colonne qui ressemble au champ cible
      const match = colonnesFichier.find(col => {
        const c = col.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const k = champ.key.toLowerCase()
        const l = champ.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        return c.includes(k) || c.includes(l) || l.includes(c)
      })
      if (match) autoMap[champ.key] = match
    })
    setMapping(prev => ({ ...autoMap, ...prev }))
  }

  async function sauvegarderMapping() {
    if (!clientId) return
    await fetch('/api/admin/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, type, source: fichier?.name || 'unknown', mapping })
    })
  }

  async function importer() {
    if (!fichier) return
    setLoading(true)
    setResultat(null)
    await sauvegarderMapping()
    const formData = new FormData()
    formData.append('fichier', fichier)
    formData.append('type', type)
    formData.append('mapping', JSON.stringify(mapping))
    if (clientId) formData.append('clientId', clientId)
    try {
      const res = await fetch('/api/admin/imports', { method: 'POST', body: formData })
      const data = await res.json()
      setResultat(data)
      setEtape(3)
    } catch (e) {
      setResultat({ error: e.message })
    }
    setLoading(false)
  }

  const champsType = CHAMPS_CIBLES[type] || []
  const mappingComplet = champsType.filter(c => c.required).every(c => mapping[c.key])

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Imports données</h1>
        <p className="text-gray-400 mt-1">Importez n'importe quel fichier avec mapping personnalisé</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-3 mb-8">
        {[
          { n: 1, label: 'Configuration' },
          { n: 2, label: 'Mapping colonnes' },
          { n: 3, label: 'Résultat' },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-3">
            <div className={"flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm " + (etape === s.n ? 'bg-white text-gray-950 font-semibold' : etape > s.n ? 'text-green-400' : 'text-gray-500')}>
              <span className={"w-5 h-5 rounded-full flex items-center justify-center text-xs " + (etape > s.n ? 'bg-green-900 text-green-400' : etape === s.n ? 'bg-gray-950 text-white' : 'bg-gray-800 text-gray-500')}>
                {etape > s.n ? '✓' : s.n}
              </span>
              {s.label}
            </div>
            {i < 2 && <div className="w-8 h-px bg-gray-700"></div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">

          {/* ÉTAPE 1 — Configuration */}
          {etape === 1 && (
            <>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">① Client</p>
                <select value={clientId} onChange={e => setClientId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none">
                  <option value="">Sélectionner un client...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.nom_restaurant || 'Sans nom'}</option>
                  ))}
                </select>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">② Type de données</p>
                <div className="grid grid-cols-2 gap-3">
                  {TYPES.map(t => (
                    <button key={t.value} onClick={() => setType(t.value)}
                      className={"p-3 rounded-xl border text-left transition " + (type === t.value ? 'border-blue-500 bg-blue-950/30' : 'border-gray-700 hover:border-gray-600')}>
                      <p className="font-medium text-sm">{t.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">③ Fichier</p>
                <div className={"border-2 border-dashed rounded-xl p-6 text-center transition " + (fichier ? 'border-green-700 bg-green-950/20' : 'border-gray-700')}>
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={e => lireFichier(e.target.files[0])}
                    className="hidden" id="file-input" />
                  <label htmlFor="file-input" className="cursor-pointer">
                    {fichier ? (
                      <div>
                        <p className="text-green-400 font-medium">✓ {fichier.name}</p>
                        <p className="text-xs text-gray-500 mt-1">{colonnesFichier.length} colonnes détectées</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-gray-400 text-sm">Glisser un fichier ou cliquer</p>
                        <p className="text-xs text-gray-600 mt-1">.xlsx, .xls, .csv</p>
                      </div>
                    )}
                  </label>
                </div>

                {fichier && colonnesFichier.length > 0 && (
                  <button onClick={() => setEtape(2)}
                    className="mt-4 w-full py-2.5 rounded-xl bg-white text-gray-950 font-semibold text-sm hover:bg-gray-100 transition">
                    Configurer le mapping →
                  </button>
                )}
              </div>
            </>
          )}

          {/* ÉTAPE 2 — Mapping */}
          {etape === 2 && (
            <>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Mapping des colonnes</p>
                  <button onClick={() => setEtape(1)} className="text-xs text-gray-500 hover:text-gray-300">← Retour</button>
                </div>
                <p className="text-xs text-gray-500 mb-4">Associe chaque champ Strat à la colonne correspondante dans ton fichier</p>

                <div className="space-y-3">
                  {champsType.map(champ => (
                    <div key={champ.key} className="flex items-center gap-4">
                      <div className="w-40 flex-shrink-0">
                        <p className="text-sm text-white">{champ.label}</p>
                        {champ.required && <p className="text-xs text-blue-400">requis</p>}
                      </div>
                      <div className="text-gray-600 text-sm">←</div>
                      <select
                        value={mapping[champ.key] || ''}
                        onChange={e => setMapping(prev => ({ ...prev, [champ.key]: e.target.value }))}
                        className={"flex-1 bg-gray-800 border rounded-xl px-3 py-2 text-sm text-white focus:outline-none " + (mapping[champ.key] ? 'border-blue-700' : champ.required ? 'border-red-900' : 'border-gray-700')}>
                        <option value="">— Ignorer —</option>
                        {colonnesFichier.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <button onClick={importer} disabled={!mappingComplet || loading}
                  className="mt-6 w-full py-3 rounded-xl bg-white text-gray-950 font-semibold text-sm hover:bg-gray-100 transition disabled:opacity-40">
                  {loading ? 'Import en cours...' : '✓ Importer les données'}
                </button>
                {!mappingComplet && (
                  <p className="text-xs text-red-400 text-center mt-2">Complète les champs requis pour continuer</p>
                )}
              </div>
            </>
          )}

          {/* ÉTAPE 3 — Résultat */}
          {etape === 3 && resultat && (
            <div className={"rounded-2xl p-6 border " + (resultat.error ? 'bg-red-950/30 border-red-900' : 'bg-green-950/30 border-green-900')}>
              {resultat.error ? (
                <div>
                  <p className="text-red-400 font-semibold mb-2">❌ Erreur</p>
                  <p className="text-red-300 text-sm">{resultat.error}</p>
                </div>
              ) : (
                <div>
                  <p className="text-green-400 font-semibold text-lg mb-2">✓ Import réussi</p>
                  <p className="text-gray-300 text-sm">{resultat.inserted} lignes insérées · {resultat.ignored || 0} ignorées</p>
                  {resultat.errors?.length > 0 && (
                    <p className="text-yellow-400 text-xs mt-2">{resultat.errors.length} erreur(s)</p>
                  )}
                  <button onClick={() => { setEtape(1); setFichier(null); setResultat(null) }}
                    className="mt-4 px-4 py-2 rounded-xl border border-green-700 text-green-400 text-sm hover:bg-green-950/50 transition">
                    Nouvel import
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Aperçu */}
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sticky top-8">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Aperçu du fichier</p>
            {apercu.length > 0 ? (
              <div className="space-y-3">
                {apercu.map((row, i) => (
                  <div key={i} className="bg-gray-800 rounded-xl p-3">
                    <p className="text-xs text-gray-500 mb-2">Ligne {i + 1}</p>
                    {champsType.filter(c => mapping[c.key]).map(c => (
                      <div key={c.key} className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500">{c.label}</span>
                        <span className="text-gray-300 font-mono truncate ml-2 max-w-24">
                          {String(row[mapping[c.key]] || '—').substring(0, 20)}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600">Upload un fichier pour voir l'aperçu</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}