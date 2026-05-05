'use client'

// Modal "Importer depuis catalogue" — réutilisable Lot 7 onboarding.
// Lot 4 Charges Récurrentes V1.1.
//
// Affiche les charges_types groupées par categorie_pl. Pré-cochage selon
// applicable_si.type_restaurant ⊇ tenant.type_restaurant + ordre_affichage < 30.
// Saisie montant_attendu par charge cochée (placeholder = médiane plage typique).
// Submit → POST /api/charges-recurrentes une fois par charge cochée.
//
// Charges déjà existantes dans charges_recurrentes du tenant : disabled
// "(déjà configurée)" basé sur charge_type_id.

import { useState, useMemo } from 'react'

const fmtEur = (n) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0
}).format(n || 0)

// Labels FR pour les sections (depuis les codes catalogue)
const SECTION_LABELS = {
  loyers_charges: '🏪 Locaux',
  energie: '⚡ Énergie',
  autres_frais_influencables: '📡 Télécoms & abonnements',
  autres_charges_personnel: '👥 Personnel',
  honoraires: '📊 Honoraires',
  redevance_marque: '™️ Franchise',
  prestations_operationnelles: '🔧 Logiciels',
  entretiens_reparations: '🛡️ Sécurité & entretien',
  autres_charges: '💼 Fiscalité',
  consommations: '🍴 Consommations',
  frais_personnel: '👥 Personnel',
  frais_deplacement: '🚗 Déplacements',
  frais_divers: '📦 Frais divers',
}

// Liste exhaustive des catégories P&L pour le dropdown charge custom
const CATEGORIES_PL_OPTIONS = [
  ['loyers_charges', 'Locaux & Loyers'],
  ['energie', 'Énergie'],
  ['autres_frais_influencables', 'Télécoms & abonnements'],
  ['autres_charges_personnel', 'Charges personnel (URSSAF, mutuelle...)'],
  ['frais_personnel', 'Salaires'],
  ['frais_deplacement', 'Déplacements'],
  ['entretiens_reparations', 'Entretiens & réparations'],
  ['honoraires', 'Honoraires (comptable, avocat...)'],
  ['redevance_marque', 'Redevance marque (franchise)'],
  ['prestations_operationnelles', 'Logiciels & prestations'],
  ['frais_divers', 'Frais divers'],
  ['autres_charges', 'Autres charges (TVA, IS, CFE...)'],
]

export default function ChargesCatalogueModal({ types, parametres, chargesExistantes, onClose, onCreated }) {
  // Map des charge_type_id déjà utilisés par le tenant (disabled)
  const existantsTypeIds = useMemo(
    () => new Set((chargesExistantes || []).map(c => c.charge_type_id).filter(Boolean)),
    [chargesExistantes]
  )

  const typeRestaurant = parametres?.type_restaurant || 'restaurant'

  // Pré-cochage : applicable_si vide OU type_restaurant inclus + ordre_affichage < 30
  const initSelection = useMemo(() => {
    const sel = {}
    for (const t of (types || [])) {
      if (existantsTypeIds.has(t.id)) continue  // skip les déjà configurées
      const applicable = !t.applicable_si?.type_restaurant ||
        t.applicable_si.type_restaurant.includes(typeRestaurant)
      const essentielle = t.ordre_affichage < 30
      sel[t.id] = applicable && essentielle
    }
    return sel
  }, [types, typeRestaurant, existantsTypeIds])

  const [selection, setSelection] = useState(initSelection)
  const [montants, setMontants] = useState({})
  const [jours, setJours] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  // Sub-form charge personnalisée (charge_type_id=null, source='manuel_ui')
  const [showCustom, setShowCustom] = useState(false)
  const [custom, setCustom] = useState({
    libelle: '',
    categorie_pl: 'loyers_charges',
    profil: 'fixe',
    frequence: 'mensuel',
    jour_du_mois: '',
    montant_attendu: '',
    fournisseur_nom_attendu: '',
  })

  function customIsValid() {
    if (!custom.libelle.trim()) return false
    const j = parseInt(custom.jour_du_mois, 10)
    if (!j || j < 1 || j > 28) return false
    if (custom.profil === 'fixe') {
      const m = parseFloat(custom.montant_attendu)
      if (!m || m <= 0) return false
    }
    return true
  }

  // Group par categorie_pl
  const groupes = useMemo(() => {
    const g = {}
    for (const t of (types || [])) {
      if (!g[t.categorie_pl]) g[t.categorie_pl] = []
      g[t.categorie_pl].push(t)
    }
    // Tri intra-groupe par ordre_affichage
    for (const k in g) g[k].sort((a, b) => a.ordre_affichage - b.ordre_affichage)
    return g
  }, [types])

  const placeholderMontant = (t) => {
    const plage = t.hints_ia?.plage_montant_typique
    if (!Array.isArray(plage) || plage.length !== 2) return ''
    return String(Math.round((plage[0] + plage[1]) / 2))
  }

  const placeholderJour = (t) => t.jour_typique ? String(t.jour_typique) : '1'

  async function submit() {
    setSubmitting(true); setErrorMsg(null)
    const aCreer = (types || []).filter(t => selection[t.id])
    const errors = []
    let nbCreees = 0

    for (const t of aCreer) {
      const montant = parseFloat(montants[t.id] ?? placeholderMontant(t))
      const jour = parseInt(jours[t.id] ?? placeholderJour(t), 10)

      // Skip variable_recurrente sans montant : OK pour formule (URSSAF, TVA)
      const profil = t.profil_defaut
      const formuleCalcul = t.formule_calcul_defaut
      const montantAttendu = profil === 'variable_recurrente' && formuleCalcul && !montants[t.id]
        ? null
        : montant

      if (profil === 'fixe' && (!montantAttendu || montantAttendu <= 0)) {
        errors.push(`${t.libelle} : montant requis`); continue
      }
      if (!jour || jour < 1 || jour > 28) {
        errors.push(`${t.libelle} : jour invalide`); continue
      }

      try {
        const res = await fetch('/api/charges-recurrentes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            charge_type_id: t.id,
            libelle_personnalise: t.libelle,
            categorie_pl: t.categorie_pl,
            profil,
            frequence: t.frequence_defaut,
            jour_du_mois: jour,
            montant_attendu: montantAttendu,
            formule_calcul: formuleCalcul,
            source_creation: 'onboarding_catalogue',
          })
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          errors.push(`${t.libelle} : ${data.error || res.status}`)
          continue
        }
        nbCreees++
      } catch (e) {
        errors.push(`${t.libelle} : ${e.message}`)
      }
    }

    // Charge personnalisée : POST si valide
    if (showCustom && customIsValid()) {
      try {
        const res = await fetch('/api/charges-recurrentes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            charge_type_id: null,
            libelle_personnalise: custom.libelle.trim(),
            categorie_pl: custom.categorie_pl,
            fournisseur_nom_attendu: custom.fournisseur_nom_attendu.trim() || null,
            profil: custom.profil,
            frequence: custom.frequence,
            jour_du_mois: parseInt(custom.jour_du_mois, 10),
            montant_attendu: parseFloat(custom.montant_attendu) || null,
            source_creation: 'manuel_ui',
          })
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          errors.push(`${custom.libelle} : ${data.error || res.status}`)
        } else {
          nbCreees++
        }
      } catch (e) {
        errors.push(`${custom.libelle} : ${e.message}`)
      }
    }

    setSubmitting(false)
    if (errors.length > 0) {
      setErrorMsg(`${nbCreees} créées, ${errors.length} erreurs : ${errors.slice(0, 3).join(' / ')}`)
    } else {
      onCreated()
    }
  }

  const nbSelectedCatalogue = Object.values(selection).filter(Boolean).length
  const nbCustom = showCustom && customIsValid() ? 1 : 0
  const nbSelected = nbSelectedCatalogue + nbCustom

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70"></div>
      <div
        className="relative w-full max-w-md mx-auto bg-gray-900 rounded-t-2xl border border-gray-800 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mt-3 mb-2"></div>

        <div className="px-5 pb-3">
          <h2 className="text-lg font-semibold">Importer depuis catalogue</h2>
          <p className="text-xs text-gray-400 mt-1">
            Coche les charges qui te concernent. Tu pourras éditer ou ajouter plus tard.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {/* Bloc charge personnalisée — toggleable */}
          <div className="mb-4">
            {!showCustom ? (
              <button
                onClick={() => setShowCustom(true)}
                className="w-full text-left px-3 py-3 rounded-xl border border-dashed border-gray-700 bg-gray-800/30 text-sm text-gray-300 hover:border-white hover:bg-gray-800 transition"
              >
                ➕ Ajouter une charge personnalisée (hors catalogue)
              </button>
            ) : (
              <div className="rounded-xl border border-white bg-gray-800 p-3 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Charge personnalisée</p>
                  <button
                    onClick={() => { setShowCustom(false); setCustom({ libelle: '', categorie_pl: 'loyers_charges', profil: 'fixe', frequence: 'mensuel', jour_du_mois: '', montant_attendu: '', fournisseur_nom_attendu: '' }) }}
                    className="text-xs text-gray-500 hover:text-gray-300"
                  >
                    Annuler
                  </button>
                </div>

                <input
                  type="text"
                  value={custom.libelle}
                  onChange={e => setCustom({ ...custom, libelle: e.target.value })}
                  placeholder="Libellé (ex. Cotisation syndicat pro)"
                  className="w-full bg-gray-900 rounded px-3 py-2 text-sm"
                  autoFocus
                />

                <input
                  type="text"
                  value={custom.fournisseur_nom_attendu}
                  onChange={e => setCustom({ ...custom, fournisseur_nom_attendu: e.target.value })}
                  placeholder="Fournisseur attendu (optionnel)"
                  className="w-full bg-gray-900 rounded px-3 py-2 text-sm"
                />

                <select
                  value={custom.categorie_pl}
                  onChange={e => setCustom({ ...custom, categorie_pl: e.target.value })}
                  className="w-full bg-gray-900 rounded px-3 py-2 text-sm"
                >
                  {CATEGORIES_PL_OPTIONS.map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <select
                    value={custom.profil}
                    onChange={e => setCustom({ ...custom, profil: e.target.value })}
                    className="flex-1 bg-gray-900 rounded px-2 py-2 text-sm"
                  >
                    <option value="fixe">Fixe (montant identique)</option>
                    <option value="variable_recurrente">Variable récurrente</option>
                    <option value="one_shot">Ponctuelle (one-shot)</option>
                  </select>
                  <select
                    value={custom.frequence}
                    onChange={e => setCustom({ ...custom, frequence: e.target.value })}
                    className="flex-1 bg-gray-900 rounded px-2 py-2 text-sm"
                  >
                    <option value="mensuel">Mensuel</option>
                    <option value="trimestriel">Trimestriel</option>
                    <option value="semestriel">Semestriel</option>
                    <option value="annuel">Annuel</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <input
                    type="number" step="0.01"
                    value={custom.montant_attendu}
                    onChange={e => setCustom({ ...custom, montant_attendu: e.target.value })}
                    placeholder={custom.profil === 'fixe' ? 'Montant € (requis)' : 'Montant € (optionnel si variable)'}
                    className="flex-1 bg-gray-900 rounded px-3 py-2 text-sm font-mono text-right"
                  />
                  <input
                    type="number" min="1" max="28" step="1"
                    value={custom.jour_du_mois}
                    onChange={e => setCustom({ ...custom, jour_du_mois: e.target.value })}
                    placeholder="Jour 1-28"
                    className="w-24 bg-gray-900 rounded px-2 py-2 text-sm font-mono text-center"
                  />
                </div>

                <p className="text-xs text-gray-500">
                  {customIsValid() ? '✓ Cette charge sera créée à la confirmation.' : 'Libellé + jour (1-28) requis. Montant requis si profil fixe.'}
                </p>
              </div>
            )}
          </div>

          {Object.entries(groupes).map(([cat, items]) => (
            <div key={cat} className="mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                {SECTION_LABELS[cat] || cat}
              </p>
              <div className="space-y-2">
                {items.map(t => {
                  const isExist = existantsTypeIds.has(t.id)
                  const isSelected = !!selection[t.id]
                  const isVariable = t.profil_defaut === 'variable_recurrente' && t.formule_calcul_defaut
                  return (
                    <div
                      key={t.id}
                      className={`rounded-xl border ${isExist ? 'border-gray-800 bg-gray-900/50 opacity-50' : isSelected ? 'border-white bg-gray-800' : 'border-gray-800 bg-gray-800/50'} px-3 py-2`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isExist || isSelected}
                          disabled={isExist}
                          onChange={e => setSelection({ ...selection, [t.id]: e.target.checked })}
                          className="accent-white"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.libelle}</p>
                          {isExist && <p className="text-xs text-gray-500">déjà configurée</p>}
                          {isVariable && !isExist && (
                            <p className="text-xs text-blue-400">calculé automatiquement</p>
                          )}
                        </div>
                      </div>

                      {isSelected && !isExist && (
                        <div className="mt-2 flex gap-2">
                          {!isVariable && (
                            <input
                              type="number" step="0.01"
                              value={montants[t.id] ?? ''}
                              onChange={e => setMontants({ ...montants, [t.id]: e.target.value })}
                              placeholder={placeholderMontant(t) + '€'}
                              className="flex-1 bg-gray-900 rounded px-2 py-1 text-sm font-mono text-right"
                            />
                          )}
                          <input
                            type="number" min="1" max="28" step="1"
                            value={jours[t.id] ?? ''}
                            onChange={e => setJours({ ...jours, [t.id]: e.target.value })}
                            placeholder={'jour ' + placeholderJour(t)}
                            className="w-20 bg-gray-900 rounded px-2 py-1 text-sm font-mono text-center"
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {errorMsg && (
          <div className="bg-red-950/30 border-t border-red-900/40 px-5 py-2 text-xs text-red-400">
            {errorMsg}
          </div>
        )}

        <div className="px-5 py-3 border-t border-gray-800 flex gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-800 text-gray-300"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={submitting || nbSelected === 0}
            className="flex-1 py-2 rounded-xl text-sm font-semibold bg-white text-gray-950 disabled:opacity-30"
          >
            {submitting ? 'Création...' : nbSelected === 0 ? 'Sélectionne au moins 1 charge' : `Créer ${nbSelected} charge${nbSelected > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
