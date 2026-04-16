'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ClientDetail({ client }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(client)
  const [saved, setSaved] = useState(false)

  const set = (k, v) => { setForm(prev => ({ ...prev, [k]: v })); setSaved(false) }

  async function sauvegarder() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/clients/' + client.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (res.ok) setSaved(true)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const Section = ({ title, children }) => (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-4">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">{title}</h2>
      {children}
    </div>
  )

  const Field = ({ label, children }) => (
    <div className="mb-4">
      <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">{label}</label>
      {children}
    </div>
  )

  const Input = ({ k, type = 'text', placeholder }) => (
    <input type={type} value={form[k] ?? ''} onChange={e => set(k, type === 'number' ? parseFloat(e.target.value) : e.target.value)}
      placeholder={placeholder}
      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-gray-500" />
  )

  const Select = ({ k, options }) => (
    <select value={form[k] ?? ''} onChange={e => set(k, e.target.value)}
      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <p className="text-gray-500 text-sm mb-1 cursor-pointer hover:text-gray-300" onClick={() => router.push('/admin/clients')}>
            ← Clients
          </p>
          <h1 className="text-3xl font-bold">{client.nom_restaurant || 'Client sans nom'}</h1>
          <p className="text-gray-400 mt-1">{client.type_restaurant} · {client.plan || 'starter'}</p>
        </div>
        <div className="flex gap-3 items-center">
          {saved && <p className="text-xs text-green-400">✓ Sauvegardé</p>}
          <button onClick={sauvegarder} disabled={loading}
            className="px-4 py-2 rounded-xl bg-white text-gray-950 text-sm font-semibold hover:bg-gray-100 transition disabled:opacity-50">
            {loading ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      <Section title="Informations générales">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom du restaurant"><Input k="nom_restaurant" placeholder="Nom du restaurant" /></Field>
          <Field label="Type">
            <Select k="type_restaurant" options={[
              { value: 'restaurant', label: 'Restaurant' },
              { value: 'fast-food', label: 'Fast-food' },
              { value: 'franchise', label: 'Franchise' },
              { value: 'brasserie', label: 'Brasserie' },
              { value: 'retail', label: 'Retail' },
              { value: 'autre', label: 'Autre' },
            ]} />
          </Field>
          <Field label="Plan">
            <Select k="plan" options={[
              { value: 'starter', label: 'Starter' },
              { value: 'pro', label: 'Pro' },
              { value: 'enterprise', label: 'Enterprise' },
            ]} />
          </Field>
          <Field label="Statut">
            <Select k="actif" options={[
              { value: true, label: 'Actif' },
              { value: false, label: 'Inactif' },
            ]} />
          </Field>
        </div>
      </Section>

      <Section title="Connecteur">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Source de données">
            <Select k="connecteur" options={[
              { value: 'manuel', label: 'Saisie manuelle' },
              { value: 'popina', label: 'Popina' },
              { value: 'lightspeed', label: 'Lightspeed' },
              { value: 'shopify', label: 'Shopify' },
            ]} />
          </Field>
          {form.connecteur === 'popina' && (
            <Field label="Popina Location ID">
              <Input k="popina_location_id" placeholder="uuid..." />
            </Field>
          )}
        </div>
      </Section>

      <Section title="Objectifs">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Objectif CA mensuel (€)"><Input k="objectif_ca" type="number" /></Field>
          <Field label="Objectif food cost (%)"><Input k="objectif_food_cost" type="number" /></Field>
          <Field label="Objectif staff cost (%)"><Input k="objectif_staff_cost" type="number" /></Field>
          <Field label="Objectif marge (%)"><Input k="objectif_marge" type="number" /></Field>
        </div>
      </Section>

      <Section title="Taux et commissions">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Commission CB (%)"><Input k="taux_commission_cb" type="number" /></Field>
          <Field label="Commission Titres-restaurant (%)"><Input k="taux_commission_tr" type="number" /></Field>
          <Field label="Commission Uber Eats (%)"><Input k="taux_commission_uber" type="number" /></Field>
          <Field label="Commission Foxorder (%)"><Input k="taux_commission_foxorder" type="number" /></Field>
          <Field label="Taux URSSAF (%)"><Input k="taux_urssaf" type="number" /></Field>
          <Field label="Régime TVA">
            <Select k="regime_tva" options={[
              { value: 'mensuel', label: 'Mensuel' },
              { value: 'trimestriel', label: 'Trimestriel' },
              { value: 'annuel', label: 'Annuel' },
            ]} />
          </Field>
        </div>
      </Section>

      <Section title="Échéances">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Jour loyer"><Input k="jour_loyer" type="number" /></Field>
          <Field label="Jour redevance"><Input k="jour_redevance" type="number" /></Field>
          <Field label="Jour honoraires"><Input k="jour_honoraires" type="number" /></Field>
          <Field label="Jour URSSAF"><Input k="jour_urssaf" type="number" /></Field>
          <Field label="Jour déclaration TVA"><Input k="jour_declaration_tva" type="number" /></Field>
        </div>
      </Section>
    </div>
  )
}