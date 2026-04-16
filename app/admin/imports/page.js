'use client'

import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'

const COLONNES = {
  historique_ca: [
    { key: 'Date', label: 'Date', required: true, desc: 'Date du jour (YYYY-MM-DD)' },
    { key: 'CA Brut', label: 'CA Brut TTC', required: true, desc: 'CA total encaissé' },
    { key: 'CA HT', label: 'CA HT', required: false, desc: 'CA hors taxes' },
    { key: 'Especes', label: 'Espèces', required: false, desc: 'Encaissements espèces' },
    { key: 'CB', label: 'Carte bancaire', required: false, desc: 'Encaissements CB' },
    { key: 'TPA', label: 'Borne / TPA', required: false, desc: 'Encaissements borne de commande' },
    { key: 'TR', label: 'Titres-restaurant', required: false, desc: 'Encaissements TR' },
    { key: 'Uber', label: 'CA Uber Eats', required: false, desc: 'CA livraison Uber Eats' },
    { key: 'Commission Uber', label: 'Commission Uber', required: false, desc: 'Commission prélevée par Uber' },
    { key: 'Nb Commandes', label: 'Nb Commandes', required: false, desc: 'Nombre de commandes du jour' },
  ],
  transactions: [
    { key: 'Date', label: 'Date', required: true, desc: 'Date de la dépense' },
    { key: 'Montant TTC', label: 'Montant TTC', required: true, desc: 'Montant total avec TVA' },
    { key: 'Taux TVA', label: 'Taux TVA (%)', required: true, desc: '0, 5.5, 10 ou 20' },
    { key: 'Fournisseur', label: 'Fournisseur', required: true, desc: 'Nom du fournisseur' },
    { key: 'Sous-catégorie', label: 'Sous-catégorie', required: false, desc: 'Ex: Viandes, Boissons...' },
    { key: 'Catégorie P&L', label: 'Catégorie P&L', required: true, desc: 'Ex: consommations, loyers_charges...' },
    { key: 'Note', label: 'Note', required: false, desc: 'Commentaire libre' },
  ],
  entrees: [
    { key: 'Date', label: 'Date', required: true, desc: 'Date de l\'entrée' },
    { key: 'Montant TTC', label: 'Montant TTC', required: true, desc: 'Montant encaissé' },
    { key: 'Taux TVA', label: 'Taux TVA (%)', required: false, desc: '0, 5.5, 10 ou 20' },
    { key: 'Source', label: 'Source', required: true, desc: 'uber_eats, autre...' },
    { key: 'Nb Commandes', label: 'Nb Commandes', required: false, desc: 'Nombre de commandes' },
    { key: 'Note', label: 'Note', required: false, desc: 'Commentaire libre' },
  ]
}

const EXEMPLES = {
  historique_ca: { Date: '2026-01-01', 'CA Brut': 5000, 'CA HT': 4500, Especes: 500, CB: 2000, TPA: 1500, TR: 200, Uber: 800, 'Commission Uber': 120, 'Nb Commandes': 250 },
  transactions: { Date: '2026-01-01', 'Montant TTC': 1200, 'Taux TVA': 20, Fournisseur: 'Metro', 'Sous-catégorie': 'Viandes', 'Catégorie P&L': 'consommations', Note: '' },
  entrees: { Date: '2026-01-01', 'Montant TTC': 800, 'Taux TVA': 10, Source: 'uber_eats', 'Nb Commandes': 45, Note: '' }
}

export default function AdminImports() {
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState('')
  const [type, setType] = useState('historique_ca')
  const [colonnesActives, setColonnesActives] = useState({})
  const [fichier, setFichier] = useState(null)
  const [loading, setLoading] = useState(false)
  const [resultat, setResultat] = useState(null)

  useEffect(() => {
    fetch('/api/admin/clients').then(r => r.json()).then(data => {
      setClients(Array.isArray(data) ? data : [])
    })
  }, [])

  useEffect(() => {
    // Initialiser les colonnes actives selon le type
    const init = {}
    COLONNES[type].forEach(c => { init[c.key] = c.required })
    setColonnesActives(init)
    setResultat(null)
  }, [type])

  function toggleColonne(key, required) {
    if (required) return // les colonnes requises ne peuvent pas être décochées
    setColonnesActives(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function telechargerTemplate() {
    const colonnes = COLONNES[type].filter(c => colonnesActives[c.key]).map(c => c.key)
    const exemple = {}
    colonnes.forEach(k => { exemple[k] = EXEMPLES[type][k] ?? '' })
    const ws = XLSX.utils.json_to_sheet([exemple])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data')
    const client = clients.find(c => c.id === clientId)
    const nomClient = client?.nom_restaurant?.replace(/\s+/g, '_') || 'client'
    XLSX.writeFile(wb, `template_${nomClient}_${type}.xlsx`)
  }

  async function importer() {
    if (!fichier) return
    setLoading(true)
    setResultat(null)
    const formData = new FormData()
    formData.append('fichier', fichier)
    formData.append('type', type)
    if (clientId) formData.append('clientId', clientId)
    try {
      const res = await fetch('/api/admin/imports', { method: 'POST', body: formData })
      const data = await res.json()
      setResultat(data)
    } catch (e) {
      setResultat({ error: e.message })
    }
    setLoading(false)
  }

  const colonnesType = COLONNES[type]
  const colonnesSelectionnees = colonnesType.filter(c => colonnesActives[c.key])

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Imports données</h1>
        <p className="text-gray-400 mt-1">Générez un template personnalisé puis importez les données</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Colonne gauche — config */}
        <div className="col-span-2 space-y-4">

          {/* Étape 1 — Client */}
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

          {/* Étape 2 — Type */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">② Type de données</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'historique_ca', label: 'CA Historique', desc: 'CA par jour' },
                { value: 'transactions', label: 'Dépenses', desc: 'Achats fournisseurs' },
                { value: 'entrees', label: 'Entrées', desc: 'Uber Eats etc.' },
              ].map(t => (
                <button key={t.value} onClick={() => setType(t.value)}
                  className={"p-3 rounded-xl border text-left transition " + (type === t.value ? 'border-blue-500 bg-blue-950/30' : 'border-gray-700 hover:border-gray-600')}>
                  <p className="font-medium text-sm">{t.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Étape 3 — Colonnes */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">③ Colonnes à inclure</p>
            <div className="space-y-2">
              {colonnesType.map(c => (
                <div key={c.key}
                  onClick={() => toggleColonne(c.key, c.required)}
                  className={"flex items-center gap-3 p-3 rounded-xl border transition " + (colonnesActives[c.key] ? 'border-blue-700 bg-blue-950/20' : 'border-gray-800 opacity-50') + (c.required ? ' cursor-default' : ' cursor-pointer hover:border-gray-600')}>
                  <div className={"w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 " + (colonnesActives[c.key] ? 'bg-blue-500 border-blue-500' : 'border-gray-600')}>
                    {colonnesActives[c.key] && <span className="text-white text-xs">✓</span>}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{c.label}
                      {c.required && <span className="ml-2 text-xs text-gray-500">(requis)</span>}
                    </p>
                    <p className="text-xs text-gray-500">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Étape 4 — Fichier */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">④ Importer un fichier rempli</p>
            <div className={"border-2 border-dashed rounded-xl p-6 text-center transition " + (fichier ? 'border-green-700 bg-green-950/20' : 'border-gray-700')}>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={e => { setFichier(e.target.files[0]); setResultat(null) }}
                className="hidden" id="file-input" />
              <label htmlFor="file-input" className="cursor-pointer">
                {fichier ? (
                  <div>
                    <p className="text-green-400 font-medium">✓ {fichier.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{(fichier.size / 1024).toFixed(0)} KB · Cliquer pour changer</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-400 text-sm">Glisser un fichier ici ou cliquer</p>
                    <p className="text-xs text-gray-600 mt-1">.xlsx, .xls, .csv</p>
                  </div>
                )}
              </label>
            </div>
            <button onClick={importer} disabled={!fichier || loading}
              className="mt-4 w-full py-3 rounded-xl bg-white text-gray-950 font-semibold text-sm hover:bg-gray-100 transition disabled:opacity-40">
              {loading ? 'Import en cours...' : 'Importer les données'}
            </button>
          </div>

          {resultat && (
            <div className={"rounded-2xl p-6 border " + (resultat.error ? 'bg-red-950/30 border-red-900' : 'bg-green-950/30 border-green-900')}>
              {resultat.error ? (
                <p className="text-red-400 text-sm">❌ {resultat.error}</p>
              ) : (
                <div>
                  <p className="text-green-400 font-semibold mb-1">✓ Import réussi</p>
                  <p className="text-sm text-gray-300">{resultat.inserted} lignes insérées · {resultat.ignored || 0} ignorées</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Colonne droite — aperçu + téléchargement */}
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 sticky top-8">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Aperçu du template</p>
            <div className="space-y-1 mb-4">
              {colonnesSelectionnees.map((c, i) => (
                <div key={c.key} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600 w-4">{i + 1}</span>
                  <span className="font-mono text-gray-300">{c.key}</span>
                  {c.required && <span className="text-blue-500">*</span>}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mb-4">{colonnesSelectionnees.length} colonne(s) sélectionnée(s)</p>
            <button onClick={telechargerTemplate}
              className="w-full py-2.5 rounded-xl border border-gray-600 text-sm text-gray-300 hover:text-white hover:border-gray-400 transition">
              ↓ Télécharger le template
            </button>
            {clientId && (
              <p className="text-xs text-gray-600 text-center mt-2">
                Pour {clients.find(c => c.id === clientId)?.nom_restaurant}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}