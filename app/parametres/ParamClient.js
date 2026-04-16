'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'

export default function ParamClient({ params: initialParams }) {
  const [params, setParams] = useState(initialParams)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(null)

  const fmt = (n) => new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(n || 0)

  async function save(updates) {
    setSaving(true)
    try {
      await fetch('/api/parametres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, ...updates })
      })
      setParams(prev => ({ ...prev, ...updates }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
    }
    setSaving(false)
    setEditing(null)
  }

  const Row = ({ label, value, field, type = 'text', suffix = '', prefix = '' }) => {
    const [val, setVal] = useState(value)
    const isEditing = editing === field

    return (
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 last:border-0">
        <p className="text-sm text-gray-300">{label}</p>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{prefix}</span>
            <input
              type={type === 'number' ? 'number' : 'text'}
              value={val}
              onChange={e => setVal(e.target.value)}
              className="w-24 bg-gray-800 text-white text-sm font-mono px-2 py-1 rounded-lg focus:outline-none text-right"
              autoFocus
            />
            <span className="text-sm text-gray-500">{suffix}</span>
            <button onClick={() => save({ [field]: type === 'number' ? parseFloat(val) : val })}
              className="text-xs bg-white text-gray-950 px-2 py-1 rounded-lg font-semibold">OK</button>
            <button onClick={() => setEditing(null)} className="text-xs text-gray-500">✕</button>
          </div>
        ) : (
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setVal(value); setEditing(field) }}>
            <span className="text-sm font-mono text-gray-400">{prefix}{value}{suffix}</span>
            <span className="text-gray-600 text-xs">›</span>
          </div>
        )}
      </div>
    )
  }

  const SelectRow = ({ label, field, value, options }) => {
    const isEditing = editing === field
    return (
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 last:border-0">
        <p className="text-sm text-gray-300">{label}</p>
        {isEditing ? (
          <div className="flex gap-2">
            {options.map(o => (
              <button key={o.val} onClick={() => save({ [field]: o.val })}
                className={"text-xs px-3 py-1.5 rounded-xl border transition " + (value === o.val ? 'bg-white text-gray-950 border-white font-semibold' : 'bg-gray-800 text-gray-400 border-gray-700')}>
                {o.label}
              </button>
            ))}
            <button onClick={() => setEditing(null)} className="text-xs text-gray-500">✕</button>
          </div>
        ) : (
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setEditing(field)}>
            <span className="text-sm text-gray-400">{options.find(o => o.val === value)?.label || value}</span>
            <span className="text-gray-600 text-xs">›</span>
          </div>
        )}
      </div>
    )
  }

  const SectionHeader = ({ label }) => (
    <div className="px-4 py-2 mt-4">
      <p className="text-xs text-gray-500 uppercase tracking-widest">{label}</p>
    </div>
  )

  const standards = {
    fast_food: { food_cost: 30, staff_cost: 32, marge: 20, alerte_fc: 32 },
    restaurant: { food_cost: 28, staff_cost: 35, marge: 15, alerte_fc: 30 },
    franchise: { food_cost: 30, staff_cost: 32, marge: 20, alerte_fc: 32 }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-md mx-auto pb-24">

      <div className="mb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Parametres</h1>
          <p className="text-gray-400 text-sm mt-0.5">{params.nom_restaurant}</p>
        </div>
        {saved && (
          <span className="text-xs text-green-400 bg-green-950 border border-green-900 px-3 py-1.5 rounded-xl">
            Sauvegarde ✓
          </span>
        )}
      </div>

      <SectionHeader label="Mon restaurant" />
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <Row label="Nom" field="nom_restaurant" value={params.nom_restaurant} />
        <SelectRow label="Type" field="type_restaurant" value={params.type_restaurant}
          options={[
            { val: 'independant', label: 'Independant' },
            { val: 'franchise', label: 'Franchise' }
          ]}
        />
      </div>

      <SectionHeader label="Objectifs" />
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <Row label="CA mensuel cible" field="objectif_ca" value={params.objectif_ca} type="number" suffix="€" />
        <Row label="Food cost cible" field="objectif_food_cost" value={params.objectif_food_cost} type="number" suffix="%" />
        <Row label="Staff cost cible" field="objectif_staff_cost" value={params.objectif_staff_cost} type="number" suffix="%" />
        <Row label="Marge op. cible" field="objectif_marge" value={params.objectif_marge} type="number" suffix="%" />
      </div>

      <div className="mt-2 px-1">
        <p className="text-xs text-gray-600 mb-2">Appliquer les standards secteur :</p>
        <div className="flex gap-2">
          {[
            { val: 'fast_food', label: 'Fast-food' },
            { val: 'restaurant', label: 'Restaurant' },
            { val: 'franchise', label: 'Franchise' }
          ].map(s => (
            <button key={s.val} onClick={() => {
              const std = standards[s.val]
              save({
                objectif_food_cost: std.food_cost,
                objectif_staff_cost: std.staff_cost,
                objectif_marge: std.marge,
                alerte_food_cost_max: std.alerte_fc
              })
            }}
              className="flex-1 text-xs py-2 rounded-xl border bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-600 transition">
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <SectionHeader label="Seuils d'alerte" />
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-300">Food cost max</p>
              <p className="text-xs text-gray-500 mt-0.5">Alerte rouge si depasse</p>
            </div>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setEditing(editing === 'alerte_food_cost_max' ? null : 'alerte_food_cost_max')}>
              <span className="text-sm font-mono text-red-400">{params.alerte_food_cost_max}%</span>
              <span className="text-gray-600 text-xs">›</span>
            </div>
          </div>
          {editing === 'alerte_food_cost_max' && (
            <div className="flex items-center gap-2 mt-3">
              <input type="number" defaultValue={params.alerte_food_cost_max}
                id="fc-max-input"
                className="w-20 bg-gray-800 text-white text-sm font-mono px-2 py-1 rounded-lg focus:outline-none text-right" autoFocus />
              <span className="text-sm text-gray-500">%</span>
              <button onClick={() => save({ alerte_food_cost_max: parseFloat(document.getElementById('fc-max-input').value) })}
                className="text-xs bg-white text-gray-950 px-2 py-1 rounded-lg font-semibold">OK</button>
              <button onClick={() => setEditing(null)} className="text-xs text-gray-500">✕</button>
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-300">Ticket moyen min</p>
              <p className="text-xs text-gray-500 mt-0.5">Alerte si en dessous</p>
            </div>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setEditing(editing === 'alerte_ticket_min' ? null : 'alerte_ticket_min')}>
              <span className="text-sm font-mono text-yellow-400">{params.alerte_ticket_min}€</span>
              <span className="text-gray-600 text-xs">›</span>
            </div>
          </div>
          {editing === 'alerte_ticket_min' && (
            <div className="flex items-center gap-2 mt-3">
              <input type="number" step="0.5" defaultValue={params.alerte_ticket_min}
                id="ticket-min-input"
                className="w-20 bg-gray-800 text-white text-sm font-mono px-2 py-1 rounded-lg focus:outline-none text-right" autoFocus />
              <span className="text-sm text-gray-500">€</span>
              <button onClick={() => save({ alerte_ticket_min: parseFloat(document.getElementById('ticket-min-input').value) })}
                className="text-xs bg-white text-gray-950 px-2 py-1 rounded-lg font-semibold">OK</button>
              <button onClick={() => setEditing(null)} className="text-xs text-gray-500">✕</button>
            </div>
          )}
        </div>
        <SelectRow label="Frequence inventaire" field="frequence_inventaire" value={params.frequence_inventaire}
          options={[
            { val: 'hebdomadaire', label: 'Hebdomadaire' },
            { val: 'mensuel', label: 'Mensuel' }
          ]}
        />
      </div>

      <SectionHeader label="Connexions" />
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-950 border border-green-900 flex items-center justify-center">
              <span className="text-xs">🏪</span>
            </div>
            <div>
              <p className="text-sm font-medium">Popina</p>
              <p className="text-xs text-gray-500 mt-0.5">Caisse enregistreuse</p>
            </div>
          </div>
          <span className="text-xs text-green-400 bg-green-950 border border-green-900 px-2 py-1 rounded-full">Connecte ✓</span>
        </div>
        {[
          { label: 'Inpulse', sub: 'Gestion des stocks' },
          { label: 'Pennylane', sub: 'Comptabilite' },
          { label: 'Plateformes livraison', sub: 'Uber Eats, Deliveroo' },
          { label: 'Banque', sub: 'Synchronisation bancaire' }
        ].map(c => (
          <div key={c.label} className="flex items-center justify-between px-4 py-3 border-b border-gray-800 last:border-0">
            <div>
              <p className="text-sm text-gray-400">{c.label}</p>
              <p className="text-xs text-gray-600 mt-0.5">{c.sub}</p>
            </div>
            <span className="text-xs text-gray-600 bg-gray-800 border border-gray-700 px-2 py-1 rounded-full">Bientot</span>
          </div>
        ))}
      </div>

      <SectionHeader label="Compte" />
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <p className="text-sm text-gray-300">Version</p>
          <p className="text-sm font-mono text-gray-500">v1.0.0</p>
        </div>
        <button onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center justify-between px-4 py-3 text-red-400 hover:bg-red-950/20 transition">
          <p className="text-sm font-medium">Se deconnecter</p>
          <span className="text-gray-600">›</span>
        </button>
      </div>
    </div>
  )
}