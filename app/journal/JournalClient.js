'use client'

import { useState } from 'react'
import Link from 'next/link'
import PeriodFilter from '@/components/PeriodFilter'
import CalendrierHeatMap from '@/components/CalendrierHeatMap'
import PanneauDetailJour from '@/components/PanneauDetailJour'

const CATEGORIE_LABELS = {
  consommations: 'Consommations',
  frais_personnel: 'Frais personnel',
  autres_charges_personnel: 'Autres charges personnel',
  frais_deplacement: 'Frais deplacement',
  entretiens_reparations: 'Entretiens et Reparations',
  energie: 'Energie',
  autres_frais_influencables: 'Autres frais',
  loyers_charges: 'Loyers et Charges',
  honoraires: 'Honoraires',
  redevance_marque: 'Redevance de Marque',
  prestations_operationnelles: 'Prestations',
  frais_divers: 'Frais Divers',
  autres_charges: 'Autres charges',
  impots_benefices: 'Impots sur les benefices'
}

const CATEGORIE_COLORS = {
  consommations: 'text-orange-400',
  frais_personnel: 'text-blue-400',
  autres_charges_personnel: 'text-blue-300',
  energie: 'text-green-400',
  loyers_charges: 'text-purple-400',
  prestations_operationnelles: 'text-red-400',
  honoraires: 'text-purple-300',
  redevance_marque: 'text-pink-400'
}

const getIcon = (cat) => {
  const icons = {
    consommations: '🛒', energie: '⚡', loyers_charges: '🏪',
    prestations_operationnelles: '📱', honoraires: '📋',
    redevance_marque: '™️', entretiens_reparations: '🔧',
    frais_deplacement: '🚗'
  }
  if (cat?.includes('personnel')) return '👥'
  return icons[cat] || '💸'
}

const SOURCE_LABELS = {
  uber_eats: 'Uber Eats', deliveroo: 'Deliveroo', just_eat: 'Just Eat',
  autre_livraison: 'Autre livraison', autre_entree: 'Autre entree'
}
const SOURCE_ICONS = {
  uber_eats: '🛵', deliveroo: '🦘', just_eat: '🍔',
  autre_livraison: '📦', autre_entree: '💰'
}

function BandauStatut({ nbCritiques, nbAttention }) {
  if (nbCritiques > 0) {
    return (
      <div className="bg-red-950/50 border border-red-900 rounded-2xl px-4 py-3 mb-3">
        <p className="text-sm font-semibold text-red-400">
          🔴 {nbCritiques} manque{nbCritiques > 1 ? 's' : ''} critique{nbCritiques > 1 ? 's' : ''}
        </p>
        {nbAttention > 0 && (
          <p className="text-xs text-gray-400 mt-1">
            + {nbAttention} point{nbAttention > 1 ? 's' : ''} d'attention
          </p>
        )}
      </div>
    )
  }
  if (nbAttention > 0) {
    return (
      <div className="bg-yellow-950/50 border border-yellow-900 rounded-2xl px-4 py-3 mb-3">
        <p className="text-sm font-semibold text-yellow-400">
          ⚠️ {nbAttention} point{nbAttention > 1 ? 's' : ''} d'attention
        </p>
      </div>
    )
  }
  return (
    <div className="bg-green-950/50 border border-green-900 rounded-2xl px-4 py-3 mb-3">
      <p className="text-sm font-semibold text-green-400">✓ Tout est saisi</p>
    </div>
  )
}

function ctaHrefDe(alerte) {
  // Commit 3 : deep-links FAB pré-remplis selon alerte.cta.
  // Pour mode='view_transaction' (anomalies montant) : pas de CTA Saisir,
  // l'utilisateur consulte la transaction dans la liste.
  if (!alerte?.cta || alerte.cta.mode === 'view_transaction') return null

  const params = new URLSearchParams()
  if (alerte.cta.mode === 'entree') params.set('openFab', 'entree')
  else params.set('openFab', 'depense')

  if (alerte.cta.date) params.set('date', alerte.cta.date)
  if (alerte.cta.source) params.set('source', alerte.cta.source)
  if (alerte.cta.categorie) params.set('categorie', alerte.cta.categorie)
  if (alerte.cta.sous_categorie) params.set('sous_categorie', alerte.cta.sous_categorie)

  return '/journal?' + params.toString()
}

function AlerteCard({ alerte, onIgnore }) {
  const cls = alerte.criticite === 'rouge'
    ? 'bg-red-950/40 border-red-900'
    : 'bg-yellow-950/40 border-yellow-900'
  const couleurTitre = alerte.criticite === 'rouge' ? 'text-red-300' : 'text-yellow-300'
  const href = ctaHrefDe(alerte)

  // Commit 4 IA — bouton "Comprendre" pour les anomalies montant
  const [explication, setExplication] = useState({ open: false, loading: false, contenu: null, error: null })
  const isAnomalie = alerte.type === 'anomalie_montant' && alerte.transaction_id

  async function handleComprendre() {
    if (explication.contenu) {
      setExplication(s => ({ ...s, open: !s.open }))
      return
    }
    setExplication(s => ({ ...s, loading: true, error: null, open: true }))
    try {
      const res = await fetch('/api/ia/anomalie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: alerte.transaction_id })
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setExplication({ open: true, loading: false, contenu: null, error: data.error || 'erreur' })
      } else {
        setExplication({ open: true, loading: false, contenu: data.contenu, error: null })
      }
    } catch {
      setExplication({ open: true, loading: false, contenu: null, error: 'reseau' })
    }
  }

  const labelBouton = explication.loading
    ? 'Analyse en cours…'
    : explication.contenu
      ? (explication.open ? '🔼 Masquer l\'explication' : '🔍 Comprendre ce montant')
      : '🔍 Comprendre ce montant'

  return (
    <div className={'border rounded-xl px-4 py-3 ' + cls}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={'text-sm font-semibold ' + couleurTitre}>{alerte.titre}</p>
          {alerte.sousTexte && (
            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{alerte.sousTexte}</p>
          )}
        </div>
        <button
          onClick={() => onIgnore(alerte)}
          aria-label="Ignorer cette alerte"
          className="text-gray-500 hover:text-gray-300 text-lg leading-none flex-shrink-0"
        >
          ✕
        </button>
      </div>
      {href && (
        <Link
          href={href}
          className="inline-block mt-2 text-xs bg-white text-gray-950 px-3 py-1.5 rounded-lg font-semibold"
        >
          Saisir
        </Link>
      )}
      {isAnomalie && (
        <>
          <button
            onClick={handleComprendre}
            disabled={explication.loading}
            className="inline-block mt-2 text-xs text-blue-300 hover:text-blue-200 disabled:opacity-50"
          >
            {labelBouton}
          </button>
          {explication.open && explication.contenu && (
            <div className="mt-3 border-l-2 border-blue-500 bg-blue-950/20 rounded-r-lg px-3 py-2">
              <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{explication.contenu}</p>
            </div>
          )}
          {explication.open && explication.error && (
            <p className="mt-2 text-xs text-gray-500">
              Explication indisponible pour le moment. Réessaie plus tard.
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default function JournalClient({
  transactions, entrees, historique, kpis, today, yesterday,
  periode, type, audit, calendrier30j, joursFermesConfigures
}) {
  const [localEntrees, setLocalEntrees] = useState(entrees)
  const [deletingId, setDeletingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editMontant, setEditMontant] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editNbCommandes, setEditNbCommandes] = useState('')
  const [alertesIgnoresLocales, setAlertesIgnoresLocales] = useState(new Set())
  // Focus sur un jour précis depuis le calendrier 30j (V1.1 : naviguer aussi via URL)
  const [selectedJour, setSelectedJour] = useState(null)

  const fmt = (n) => new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 2
  }).format(n || 0)

  // Filtrer alertes selon ignores locaux (en plus du filtre serveur via audits_ignores)
  const alertesAffichees = (audit?.alertes || []).filter(
    a => !alertesIgnoresLocales.has(a.type + '|' + a.cle)
  )
  const nbCritiques = alertesAffichees.filter(a => a.criticite === 'rouge').length
  const nbAttention = alertesAffichees.filter(a => a.criticite === 'orange').length

  async function ignorerAlerte(alerte) {
    const cle = alerte.type + '|' + alerte.cle
    // Optimistic : retire de l'UI immédiatement
    setAlertesIgnoresLocales(prev => new Set([...prev, cle]))
    try {
      await fetch('/api/audits-ignores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: alerte.type, cle: alerte.cle })
      })
    } catch {
      // Restauration en cas d'échec
      setAlertesIgnoresLocales(prev => {
        const next = new Set(prev)
        next.delete(cle)
        return next
      })
    }
  }

  async function supprimerEntree(id) {
    if (!confirm('Supprimer cette entree ?')) return
    setDeletingId(id)
    const res = await fetch('/api/entrees?id=' + id, { method: 'DELETE' })
    if (res.ok) setLocalEntrees(prev => prev.filter(e => e.id !== id))
    setDeletingId(null)
  }

  async function modifierEntree(e) {
    const res = await fetch('/api/entrees?id=' + e.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        montant_ttc: parseFloat(editMontant),
        taux_tva: e.taux_tva,
        note: editNote,
        nb_commandes: parseInt(editNbCommandes) || 0
      })
    })
    if (res.ok) {
      const updated = await res.json()
      setLocalEntrees(prev => prev.map(x => x.id === e.id ? updated : x))
      setEditingId(null)
    }
  }

  function ouvrirEdition(e) {
    setEditingId(e.id)
    setEditMontant(e.montant_ttc)
    setEditNote(e.note || '')
    setEditNbCommandes(e.nb_commandes || '')
  }

  const totalDepenses = transactions.reduce((s, t) => s + t.montant_ttc, 0)
  const depensesAujourdhui = transactions.filter(t => t.date === today).reduce((s, t) => s + t.montant_ttc, 0)
  const entreesUberAujourdhui = localEntrees
    .filter(e => e.date === today || e.date === yesterday)
    .reduce((s, e) => s + e.montant_ttc, 0)

  const byDate = {}
  for (const t of transactions) {
    if (!byDate[t.date]) byDate[t.date] = []
    byDate[t.date].push(t)
  }

  const showEntrees = type === 'all' || type === 'entrees'
  const showDepenses = type === 'all' || type === 'depenses'

  const EntreeRow = ({ e }) => (
    <div className="border-b border-gray-800 last:border-0">
      {editingId === e.id ? (
        <div className="px-4 py-3">
          <p className="text-xs text-gray-400 mb-2">{SOURCE_LABELS[e.source]}</p>
          <div className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2 mb-2">
            <span className="text-gray-400">€</span>
            <input type="number" value={editMontant} onChange={ev => setEditMontant(ev.target.value)}
              className="flex-1 bg-transparent text-white font-mono focus:outline-none" autoFocus />
          </div>
          {e.source === 'uber_eats' && (
            <div className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2 mb-2">
              <span className="text-gray-400 text-sm">Nb commandes</span>
              <input type="number" defaultValue={editNbCommandes}
                onBlur={ev => setEditNbCommandes(ev.target.value)}
                className="flex-1 bg-transparent text-white font-mono text-right focus:outline-none" placeholder="0" />
            </div>
          )}
          <input type="text" value={editNote} onChange={ev => setEditNote(ev.target.value)}
            placeholder="Note (optionnel)"
            className="w-full bg-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none mb-2" />
          <div className="flex gap-2">
            <button onClick={() => modifierEntree(e)} className="flex-1 bg-white text-gray-950 text-xs font-semibold rounded-xl py-2">Enregistrer</button>
            <button onClick={() => setEditingId(null)} className="flex-1 bg-gray-800 text-gray-400 text-xs rounded-xl py-2">Annuler</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-green-950 border border-green-900 flex items-center justify-center">
            {SOURCE_ICONS[e.source] || '💰'}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{SOURCE_LABELS[e.source] || e.source}</p>
            <p className="text-xs text-green-400">Entree manuelle · {e.date}</p>
            {e.nb_commandes > 0 && <p className="text-xs text-gray-500">{e.nb_commandes} commandes</p>}
            {e.note && <p className="text-xs text-gray-500">{e.note}</p>}
          </div>
          <div className="text-right">
            <p className="text-sm font-mono font-semibold text-green-400">+{fmt(e.montant_ttc)}</p>
            <div className="flex gap-2 mt-1 justify-end">
              <button onClick={() => ouvrirEdition(e)} className="text-xs text-blue-400">Modifier</button>
              <button onClick={() => supprimerEntree(e.id)} disabled={deletingId === e.id}
                className="text-xs text-red-500">{deletingId === e.id ? '...' : 'Suppr.'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto pb-24">

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/dashboard" className="w-9 h-9 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <polyline points="10,3 5,8 10,13"/>
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Journal</h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Depenses</p>
          <p className="text-base font-mono font-bold text-red-400">-{fmt(totalDepenses)}</p>
        </div>
      </div>

      {/* PeriodFilter */}
      <div className="mb-3">
        <PeriodFilter profil="journal" basePath="/journal" filtreActif={periode} />
      </div>

      {/* Bandeau statut global */}
      <BandauStatut nbCritiques={nbCritiques} nbAttention={nbAttention} />

      {/* Empty state si jours_fermes non configurés */}
      {!joursFermesConfigures && (
        <div className="bg-blue-950/30 border border-blue-900/30 border-l-4 border-l-blue-500 rounded-xl px-4 py-3 mb-3">
          <p className="text-sm text-blue-400 font-medium mb-1">Configure tes jours d'ouverture</p>
          <p className="text-xs text-gray-300 leading-relaxed mb-2">
            Pour activer la détection des trous de jours, indique tes jours d'ouverture habituels dans Paramètres.
          </p>
          <Link href="/parametres" className="inline-block text-xs text-blue-400 hover:text-blue-300">
            Aller aux Paramètres ›
          </Link>
        </div>
      )}

      {/* Section À vérifier */}
      {alertesAffichees.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">À vérifier</p>
          <div className="space-y-2">
            {alertesAffichees.map(a => (
              <AlerteCard
                key={a.type + '|' + a.cle}
                alerte={a}
                onIgnore={ignorerAlerte}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tabs (filtre type pour la section Saisies) */}
      <div className="flex gap-2 mb-4">
        <Link href={'/journal?periode=' + periode + '&type=all'} className={'flex-1 text-center text-xs py-2 rounded-xl border ' + (type === 'all' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>Tout</Link>
        <Link href={'/journal?periode=' + periode + '&type=entrees'} className={'flex-1 text-center text-xs py-2 rounded-xl border ' + (type === 'entrees' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>Entrées</Link>
        <Link href={'/journal?periode=' + periode + '&type=depenses'} className={'flex-1 text-center text-xs py-2 rounded-xl border ' + (type === 'depenses' ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-900 text-gray-400 border-gray-800')}>Dépenses</Link>
      </div>

      {/* AUJOURD'HUI */}
      {periode === 'aujourdhui' && (
        <div className="mb-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">

            {showEntrees && kpis.hasData && (
              <>
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
                  <div className="w-9 h-9 rounded-xl bg-green-950 border border-green-900 flex items-center justify-center">💰</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Ventes caisse</p>
                    <p className="text-xs text-green-400">{kpis.frequentation.nbCommandes} commandes</p>
                  </div>
                  <p className="text-sm font-mono font-semibold text-green-400">+{fmt(kpis.canaux.caisse)}</p>
                </div>
                {kpis.canaux.online > 0 && (
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
                    <div className="w-9 h-9 rounded-xl bg-orange-950 border border-orange-900 flex items-center justify-center">📱</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Borne</p>
                      <p className="text-xs text-orange-400">Commandes en borne</p>
                    </div>
                    <p className="text-sm font-mono font-semibold text-orange-400">+{fmt(kpis.canaux.online)}</p>
                  </div>
                )}
              </>
            )}

            {showEntrees && localEntrees.filter(e => e.date === today || e.date === yesterday).map((e) => (
              <EntreeRow key={e.id} e={e} />
            ))}

            {showDepenses && (byDate[today] || []).map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0">
                <div className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center">{getIcon(t.categorie_pl)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.fournisseur_nom}</p>
                  <p className={'text-xs mt-0.5 ' + (CATEGORIE_COLORS[t.categorie_pl] || 'text-gray-400')}>{CATEGORIE_LABELS[t.categorie_pl] || t.categorie_pl}</p>
                  {t.note && <p className="text-xs text-gray-500">{t.note}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono font-semibold text-red-400">-{fmt(t.montant_ttc)}</p>
                  <p className="text-xs text-gray-500">HT {fmt(t.montant_ht)}</p>
                </div>
              </div>
            ))}

            {type === 'all' && kpis.hasData && (
              <div className="flex justify-between items-center px-4 py-3 bg-gray-800/50 border-t border-gray-700">
                <span className="text-xs text-gray-400 font-medium">Resultat du jour</span>
                <span className={'text-sm font-mono font-bold ' + (kpis.ca.brut + entreesUberAujourdhui - depensesAujourdhui > 0 ? 'text-green-400' : 'text-red-400')}>
                  {fmt(kpis.ca.brut + entreesUberAujourdhui - depensesAujourdhui)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* JOURS PRECEDENTS */}
      {periode !== 'aujourdhui' && (
        <div>
          {showEntrees && (historique || []).filter(h => h.uber > 0).length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">CA Uber Eats</p>
              <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                {(historique || []).filter(h => h.uber > 0).map(h => (
                  <div key={'uber-' + h.date} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0">
                    <div className="w-9 h-9 rounded-xl bg-green-950 border border-green-900 flex items-center justify-center">🛵</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Uber Eats</p>
                      <p className="text-xs text-gray-500 capitalize">{new Date(h.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                      {h.nb_commandes_uber > 0 && <p className="text-xs text-green-400">{h.nb_commandes_uber} commandes</p>}
                    </div>
                    <p className="text-sm font-mono font-semibold text-green-400">+{fmt(h.uber)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showEntrees && localEntrees.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Entrees manuelles</p>
              <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                {localEntrees.map((e) => <EntreeRow key={e.id} e={e} />)}
              </div>
            </div>
          )}

          {showDepenses && Object.entries(byDate).map(([date, txs]) => {
            const totalJour = txs.reduce((s, t) => s + t.montant_ttc, 0)
            const dateObj = new Date(date + 'T00:00:00')
            const labelDate = date === today ? "Aujourd'hui" : dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
            return (
              <div key={date} className="mb-4">
                <div className="flex justify-between items-center mb-2 px-1">
                  <span className="text-sm font-medium text-gray-300 capitalize">{labelDate}</span>
                  <span className="text-sm font-mono font-semibold text-red-400">-{fmt(totalJour)}</span>
                </div>
                <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                  {txs.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 last:border-0">
                      <div className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center">{getIcon(t.categorie_pl)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.fournisseur_nom}</p>
                        <p className={'text-xs mt-0.5 ' + (CATEGORIE_COLORS[t.categorie_pl] || 'text-gray-400')}>{CATEGORIE_LABELS[t.categorie_pl] || t.categorie_pl}</p>
                        {t.note && <p className="text-xs text-gray-500 truncate">{t.note}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-semibold text-red-400">-{fmt(t.montant_ttc)}</p>
                        <p className="text-xs text-gray-500">HT {fmt(t.montant_ht)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Calendrier 30 jours */}
      <div className="mt-6">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">30 derniers jours</p>
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <CalendrierHeatMap
            data={calendrier30j}
            selectedDate={selectedJour}
            onSelect={setSelectedJour}
          />
        </div>
      </div>

      {/* Panneau détail jour (modal bottom-sheet, pattern DrillDown) */}
      {selectedJour && (
        <PanneauDetailJour
          date={selectedJour}
          evaluation={(calendrier30j || []).find(c => c.date === selectedJour)}
          onClose={() => setSelectedJour(null)}
        />
      )}
    </div>
  )
}
