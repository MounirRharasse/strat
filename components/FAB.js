'use client'

import { useState, useEffect, useRef } from 'react'

const CATEGORIES_DEPENSE = {
  consommations: {
    label: 'Consommations',
    color: 'text-orange-400',
    sous: ['viande', 'epicerie', 'boissons', 'emballages', 'autres_consommations']
  },
  frais_personnel: {
    label: 'Frais de personnel',
    color: 'text-blue-400',
    sous: ['salaires']
  },
  autres_charges_personnel: {
    label: 'Autres charges personnel',
    color: 'text-blue-300',
    sous: ['charges_sociales', 'extras', 'formation', 'autres_personnel']
  },
  frais_deplacement: {
    label: 'Frais de deplacement',
    color: 'text-cyan-400',
    sous: ['essence', 'transport']
  },
  entretiens_reparations: {
    label: 'Entretiens et Reparations',
    color: 'text-yellow-400',
    sous: ['entretien_materiel', 'entretien_local', 'autres_entretiens']
  },
  energie: {
    label: 'Energie',
    color: 'text-green-400',
    sous: ['electricite', 'gaz', 'eau']
  },
  autres_frais_influencables: {
    label: 'Autres frais influencables',
    color: 'text-green-300',
    sous: ['frais_bancaires', 'autres_influencables']
  },
  loyers_charges: {
    label: 'Loyers et Charges',
    color: 'text-purple-400',
    sous: ['loyer', 'charges_locatives']
  },
  honoraires: {
    label: 'Honoraires',
    color: 'text-purple-300',
    sous: ['comptable', 'autres_honoraires']
  },
  redevance_marque: {
    label: 'Redevance de Marque',
    color: 'text-pink-400',
    sous: ['redevance']
  },
  prestations_operationnelles: {
    label: 'Prestations Operationnelles',
    color: 'text-red-400',
    sous: ['commissions_uber', 'commissions_foxorder', 'logiciels', 'autres_prestations']
  },
  frais_divers: {
    label: 'Frais Divers',
    color: 'text-gray-400',
    sous: ['frais_divers']
  },
  autres_charges: {
    label: 'Autres charges',
    color: 'text-gray-300',
    sous: ['autres_charges']
  },
  impots_benefices: {
    label: 'Impots sur les benefices',
    color: 'text-red-300',
    sous: ['is']
  }
}

const SOUS_CAT_LABELS = {
  viande: 'Viande et poisson',
  epicerie: 'Epicerie et feculent',
  boissons: 'Boissons',
  emballages: 'Emballages',
  autres_consommations: 'Autres consommations',
  salaires: 'Salaires',
  charges_sociales: 'Charges sociales',
  extras: 'Extras / interimaires',
  formation: 'Formation',
  autres_personnel: 'Autres',
  essence: 'Essence',
  transport: 'Transport',
  entretien_materiel: 'Entretien materiel',
  entretien_local: 'Entretien local',
  autres_entretiens: 'Autres entretiens',
  electricite: 'Electricite',
  gaz: 'Gaz',
  eau: 'Eau',
  frais_bancaires: 'Frais bancaires',
  autres_influencables: 'Autres',
  loyer: 'Loyer',
  charges_locatives: 'Charges locatives',
  comptable: 'Expert-comptable',
  autres_honoraires: 'Autres honoraires',
  redevance: 'Redevance de Marque',
  commissions_uber: 'Commissions Uber Eats',
  commissions_foxorder: 'Commissions Foxorder',
  logiciels: 'Logiciels et abonnements',
  autres_prestations: 'Autres prestations',
  frais_divers: 'Frais divers',
  autres_charges: 'Autres charges',
  is: 'Impot sur les benefices'
}

const CATEGORIES_ENTREE = [
  { val: 'uber_eats', label: 'Uber Eats', icon: '🛵' },
  { val: 'deliveroo', label: 'Deliveroo', icon: '🦘' },
  { val: 'just_eat', label: 'Just Eat', icon: '🍔' },
  { val: 'autre_livraison', label: 'Autre livraison', icon: '📦' },
  { val: 'autre_entree', label: 'Autre entree', icon: '💰' },
]

const TVA_TAUX = [5.5, 10, 20]

export default function FAB() {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('depense') // 'depense' ou 'entree'
  const [step, setStep] = useState(1)
  const [montant, setMontant] = useState('')
  const [fournisseur, setFournisseur] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [categorie, setCategorie] = useState('')
  const [sousCategorie, setSousCategorie] = useState('')
  const [categorieEntree, setCategorieEntree] = useState('')
  const [tva, setTva] = useState(10)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (fournisseur.length < 2) { setSuggestions([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/transactions?q=${encodeURIComponent(fournisseur)}`)
      const data = await res.json()
      setSuggestions(data)
    }, 300)
    return () => clearTimeout(timer)
  }, [fournisseur])

  function selectSuggestion(s) {
    setFournisseur(s.nom)
    setCategorie(s.categorie_pl)
    setSousCategorie(s.sous_categorie)
    setTva(s.taux_tva_defaut)
    setSuggestions([])
    setStep(3)
  }

  function reset() {
    setStep(1)
    setType('depense')
    setMontant('')
    setFournisseur('')
    setSuggestions([])
    setCategorie('')
    setSousCategorie('')
    setCategorieEntree('')
    setTva(10)
    setNote('')
    setDate(new Date().toISOString().split('T')[0])
    setSuccess(false)
  }

  function close() {
    setOpen(false)
    setTimeout(reset, 300)
  }

  async function submitDepense() {
    setLoading(true)
    const montantTTC = parseFloat(montant)
    const montantHT = Math.round((montantTTC / (1 + tva / 100)) * 100) / 100
    const montantTVA = Math.round((montantTTC - montantHT) * 100) / 100

    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        montant_ttc: montantTTC,
        taux_tva: tva,
        fournisseur_nom: fournisseur,
        sous_categorie: sousCategorie,
        categorie_pl: categorie,
        note
      })
    })
    setLoading(false)
    if (res.ok) { setSuccess(true); setTimeout(close, 1500) }
  }

  async function submitEntree() {
    setLoading(true)
    const montantTTC = parseFloat(montant)
    const montantHT = Math.round((montantTTC / (1 + tva / 100)) * 100) / 100
    const montantTVA = Math.round((montantTTC - montantHT) * 100) / 100

    const res = await fetch('/api/entrees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        montant_ttc: montantTTC,
        taux_tva: tva,
        montant_ht: montantHT,
        montant_tva: montantTVA,
        source: categorieEntree,
        categorie: CATEGORIES_ENTREE.find(c => c.val === categorieEntree)?.label || categorieEntree,
        note
      })
    })
    setLoading(false)
    if (res.ok) { setSuccess(true); setTimeout(close, 1500) }
  }

  const montantHT = montant ? Math.round((parseFloat(montant) / (1 + tva / 100)) * 100) / 100 : 0
  const montantTVA = montant ? Math.round((parseFloat(montant) - montantHT) * 100) / 100 : 0

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-white text-gray-950 rounded-full flex items-center justify-center shadow-lg text-2xl font-light z-40 hover:bg-gray-100 transition"
      >
        +
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={close}></div>
          <div className="relative w-full max-w-md mx-auto bg-gray-900 rounded-t-2xl border border-gray-800 pb-8 z-10">
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mt-3 mb-4"></div>

            {success ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">{type === 'entree' ? '✅' : '✅'}</div>
                <p className="text-white font-medium">{type === 'entree' ? 'Entree enregistree' : 'Depense enregistree'}</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center px-5 mb-4">
                  <h2 className="text-lg font-semibold">Nouvelle transaction</h2>
                  <span className="text-xs text-gray-500">{step}/{type === 'entree' ? '3' : '4'}</span>
                </div>

                {/* TOGGLE ENTREE / DEPENSE */}
                {step === 1 && (
                  <div className="flex bg-gray-800 rounded-xl p-1 mx-5 mb-4">
                    <button onClick={() => setType('depense')}
                      className={"flex-1 py-2 rounded-lg text-sm font-medium transition " + (type === 'depense' ? 'bg-red-500 text-white' : 'text-gray-400')}>
                      Depense
                    </button>
                    <button onClick={() => setType('entree')}
                      className={"flex-1 py-2 rounded-lg text-sm font-medium transition " + (type === 'entree' ? 'bg-green-500 text-white' : 'text-gray-400')}>
                      Entree
                    </button>
                  </div>
                )}

                {/* STEP 1 — MONTANT */}
                {step === 1 && (
                  <div className="px-5">
                    <p className="text-gray-400 text-sm mb-3">Quel montant ? (TTC)</p>
                    <div className="flex items-center gap-2 bg-gray-800 rounded-xl px-4 py-3 mb-4">
                      <span className="text-gray-400 text-lg">€</span>
                      <input
                        type="number"
                        value={montant}
                        onChange={e => setMontant(e.target.value)}
                        className="flex-1 bg-transparent text-2xl font-mono text-white focus:outline-none"
                        placeholder="0.00"
                        autoFocus
                      />
                    </div>
                    <div className="mb-4">
                      <p className="text-gray-400 text-sm mb-2">Date</p>
                      <input
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => montant && setStep(2)}
                      disabled={!montant}
                      className="w-full bg-white text-gray-950 font-semibold rounded-xl py-3 disabled:opacity-30"
                    >
                      Continuer →
                    </button>
                  </div>
                )}

                {/* STEP 2 ENTREE — CATEGORIE */}
                {step === 2 && type === 'entree' && (
                  <div className="px-5">
                    <p className="text-gray-400 text-sm mb-3">Source de l'entree</p>
                    <div className="space-y-2 mb-4">
                      {CATEGORIES_ENTREE.map(c => (
                        <button
                          key={c.val}
                          onClick={() => setCategorieEntree(c.val)}
                          className={"w-full text-left px-4 py-3 rounded-xl border transition flex items-center gap-3 " + (categorieEntree === c.val ? 'border-white bg-gray-800' : 'border-gray-700 bg-gray-800/50')}
                        >
                          <span className="text-xl">{c.icon}</span>
                          <span className="font-medium">{c.label}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => categorieEntree && setStep(3)}
                      disabled={!categorieEntree}
                      className="w-full bg-white text-gray-950 font-semibold rounded-xl py-3 disabled:opacity-30"
                    >
                      Continuer →
                    </button>
                  </div>
                )}

                {/* STEP 3 ENTREE — TVA + RESUME */}
                {step === 3 && type === 'entree' && (
                  <div className="px-5">
                    <p className="text-gray-400 text-sm mb-3">Taux de TVA</p>
                    <div className="flex gap-2 mb-4">
                      {TVA_TAUX.map(t => (
                        <button
                          key={t}
                          onClick={() => setTva(t)}
                          className={"flex-1 py-3 rounded-xl font-mono font-semibold transition " + (tva === t ? 'bg-white text-gray-950' : 'bg-gray-800 text-gray-300')}
                        >
                          {t}%
                        </button>
                      ))}
                    </div>
                    <div className="bg-gray-800 rounded-xl p-4 mb-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Source</span>
                        <span className="font-medium">{CATEGORIES_ENTREE.find(c => c.val === categorieEntree)?.label}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Montant TTC</span>
                        <span className="font-mono font-semibold text-green-400">+{parseFloat(montant).toFixed(2)}€</span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-gray-700 pt-2">
                        <span className="text-gray-400">Montant HT</span>
                        <span className="font-mono">{montantHT.toFixed(2)}€</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">TVA ({tva}%)</span>
                        <span className="font-mono">{montantTVA.toFixed(2)}€</span>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none mb-4 text-sm"
                      placeholder="Note (optionnel)"
                    />
                    <button
                      onClick={submitEntree}
                      disabled={loading}
                      className="w-full bg-green-500 text-white font-semibold rounded-xl py-3 disabled:opacity-50"
                    >
                      {loading ? 'Enregistrement...' : 'Enregistrer l\'entree'}
                    </button>
                  </div>
                )}

                {/* STEP 2 DEPENSE — FOURNISSEUR */}
                {step === 2 && type === 'depense' && (
                  <div className="px-5">
                    <p className="text-gray-400 text-sm mb-3">Chez qui ?</p>
                    <input
                      type="text"
                      value={fournisseur}
                      onChange={e => setFournisseur(e.target.value)}
                      className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none mb-2"
                      placeholder="Ex: Boucherie Karim, Metro..."
                      autoFocus
                    />
                    {suggestions.length > 0 && (
                      <div className="bg-gray-800 rounded-xl overflow-hidden mb-3 border border-gray-700">
                        {suggestions.map(s => (
                          <button
                            key={s.id}
                            onClick={() => selectSuggestion(s)}
                            className="w-full text-left px-4 py-3 hover:bg-gray-700 border-b border-gray-700 last:border-0"
                          >
                            <div className="text-sm font-medium">{s.nom}</div>
                            <div className="text-xs text-gray-400">{SOUS_CAT_LABELS[s.sous_categorie]} · TVA {s.taux_tva_defaut}%</div>
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => fournisseur && setStep(3)}
                      disabled={!fournisseur}
                      className="w-full bg-white text-gray-950 font-semibold rounded-xl py-3 disabled:opacity-30"
                    >
                      Continuer →
                    </button>
                  </div>
                )}

                {/* STEP 3 DEPENSE — CATEGORIE */}
                {step === 3 && type === 'depense' && (
                  <div className="px-5 max-h-96 overflow-y-auto">
                    <p className="text-gray-400 text-sm mb-3">Quelle categorie ?</p>
                    <div className="space-y-2 mb-4">
                      {Object.entries(CATEGORIES_DEPENSE).map(([key, cat]) => (
                        <div key={key}>
                          <button
                            onClick={() => { setCategorie(key); setSousCategorie('') }}
                            className={"w-full text-left px-4 py-3 rounded-xl border transition " + (categorie === key ? 'border-white bg-gray-800' : 'border-gray-700 bg-gray-800/50')}
                          >
                            <span className={"font-medium " + cat.color}>{cat.label}</span>
                          </button>
                          {categorie === key && (
                            <div className="ml-4 mt-1 space-y-1">
                              {cat.sous.map(s => (
                                <button
                                  key={s}
                                  onClick={() => setSousCategorie(s)}
                                  className={"w-full text-left px-4 py-2 rounded-lg text-sm transition " + (sousCategorie === s ? 'bg-white text-gray-950 font-medium' : 'text-gray-300 hover:bg-gray-700')}
                                >
                                  {SOUS_CAT_LABELS[s]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => categorie && sousCategorie && setStep(4)}
                      disabled={!categorie || !sousCategorie}
                      className="w-full bg-white text-gray-950 font-semibold rounded-xl py-3 disabled:opacity-30 sticky bottom-0"
                    >
                      Continuer →
                    </button>
                  </div>
                )}

                {/* STEP 4 DEPENSE — TVA + RESUME */}
                {step === 4 && type === 'depense' && (
                  <div className="px-5">
                    <p className="text-gray-400 text-sm mb-3">Taux de TVA</p>
                    <div className="flex gap-2 mb-4">
                      {TVA_TAUX.map(t => (
                        <button
                          key={t}
                          onClick={() => setTva(t)}
                          className={"flex-1 py-3 rounded-xl font-mono font-semibold transition " + (tva === t ? 'bg-white text-gray-950' : 'bg-gray-800 text-gray-300')}
                        >
                          {t}%
                        </button>
                      ))}
                    </div>
                    <div className="bg-gray-800 rounded-xl p-4 mb-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Fournisseur</span>
                        <span className="font-medium">{fournisseur}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Categorie</span>
                        <span>{SOUS_CAT_LABELS[sousCategorie]}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Montant TTC</span>
                        <span className="font-mono font-semibold text-red-400">-{parseFloat(montant).toFixed(2)}€</span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-gray-700 pt-2">
                        <span className="text-gray-400">Montant HT</span>
                        <span className="font-mono">{montantHT.toFixed(2)}€</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">TVA ({tva}%)</span>
                        <span className="font-mono">{montantTVA.toFixed(2)}€</span>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none mb-4 text-sm"
                      placeholder="Note (optionnel)"
                    />
                    <button
                      onClick={submitDepense}
                      disabled={loading}
                      className="w-full bg-white text-gray-950 font-semibold rounded-xl py-3 disabled:opacity-50"
                    >
                      {loading ? 'Enregistrement...' : 'Enregistrer la depense'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}