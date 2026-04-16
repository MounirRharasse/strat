'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NouveauClient() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    nom_restaurant: '',
    type_restaurant: 'restaurant',
    connecteur: 'manuel',
    popina_location_id: '',
    objectif_ca: 45000,
    objectif_food_cost: 30,
    objectif_staff_cost: 30,
    objectif_marge: 15,
    taux_commission_cb: 1.5,
    taux_commission_tr: 4.0,
    taux_commission_uber: 15.0,
    taux_commission_foxorder: 0,
    taux_urssaf: 42,
    regime_tva: 'mensuel',
    plan: 'starter',
    actif: true,
  })

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  async function sauvegarder() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (res.ok) router.push('/admin/clients')
    } catch (e) {
      console.error(e)
    }
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

  const Input = ({ value, onChange, type = 'text', placeholder }) => (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-gray-500" />
  )

  const Select = ({ value, onChange, options }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Nouveau client</h1>
          <p className="text-gray-400 mt-1">Créer un nouveau compte restaurant</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => router.back()} className="px-4 py-2 rounded-xl border border-gray-700 text-sm text-gray-400 hover:text-white transition">
            Annuler
          </button>
          <button onClick={sauvegarder} disabled={loading}
            className="px-4 py-2 rounded-xl bg-white text-gray-950 text-sm font-semibold hover:bg-gray-100 transition disabled:opacity-50">
            {loading ? 'Sauvegarde...' : 'Créer le client'}
          </button>
        </div>
      </div>

      <Section title="Informations générales">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom du restaurant">
            <Input value={form.nom_restaurant} onChange={v => set('nom_restaurant', v)} placeholder="Ex: Krousty Montpellier" />
          </Field>
          <Field label="Type">
            <Select value={form.type_restaurant} onChange={v => set('type_restaurant', v)} options={[
              { value: 'restaurant', label: 'Restaurant' },
              { value: 'fast-food', label: 'Fast-food' },
              { value: 'franchise', label: 'Franchise' },
              { value: 'brasserie', label: 'Brasserie' },
              { value: 'retail', label: 'Retail' },
              { value: 'autre', label: 'Autre' },
            ]} />
          </Field>
          <Field label="Plan">
            <Select value={form.plan} onChange={v => set('plan', v)} options={[
              { value: 'starter', label: 'Starter' },
              { value: 'pro', label: 'Pro' },
              { value: 'enterprise', label: 'Enterprise' },
            ]} />
          </Field>
          <Field label="Statut">
            <Select value={form.actif ? 'true' : 'false'} onChange={v => set('actif', v === 'true')} options={[
              { value: 'true', label: 'Actif' },
              { value: 'false', label: 'Inactif' },
            ]} />
          </Field>
        </div>
      </Section>

      <Section title="Connecteur">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Source de données">
            <Select value={form.connecteur} onChange={v => set('connecteur', v)} options={[
              { value: 'manuel', label: 'Saisie manuelle' },
              { value: 'popina', label: 'Popina' },
              { value: 'lightspeed', label: 'Lightspeed' },
              { value: 'shopify', label: 'Shopify' },
            ]} />
          </Field>
          {form.connecteur === 'popina' && (
            <Field label="Popina Location ID">
              <Input value={form.popina_location_id} onChange={v => set('popina_location_id', v)} placeholder="uuid..." />
            </Field>
          )}
        </div>
      </Section>

      <Section title="Objectifs">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Objectif CA mensuel (€)">
            <Input type="number" value={form.objectif_ca} onChange={v => set('objectif_ca', parseFloat(v))} />
          </Field>
          <Field label="Objectif food cost (%)">
            <Input type="number" value={form.objectif_food_cost} onChange={v => set('objectif_food_cost', parseFloat(v))} />
          </Field>
          <Field label="Objectif staff cost (%)">
            <Input type="number" value={form.objectif_staff_cost} onChange={v => set('objectif_staff_cost', parseFloat(v))} />
          </Field>
          <Field label="Objectif marge (%)">
            <Input type="number" value={form.objectif_marge} onChange={v => set('objectif_marge', parseFloat(v))} />
          </Field>
        </div>
      </Section>

      <Section title="Taux et commissions">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Commission CB (%)">
            <Input type="number" value={form.taux_commission_cb} onChange={v => set('taux_commission_cb', parseFloat(v))} />
          </Field>
          <Field label="Commission Titres-restaurant (%)">
            <Input type="number" value={form.taux_commission_tr} onChange={v => set('taux_commission_tr', parseFloat(v))} />
          </Field>
          <Field label="Commission Uber Eats (%)">
            <Input type="number" value={form.taux_commission_uber} onChange={v => set('taux_commission_uber', parseFloat(v))} />
          </Field>
          <Field label="Commission Foxorder (%)">
            <Input type="number" value={form.taux_commission_foxorder} onChange={v => set('taux_commission_foxorder', parseFloat(v))} />
          </Field>
          <Field label="Taux URSSAF (%)">
            <Input type="number" value={form.taux_urssaf} onChange={v => set('taux_urssaf', parseFloat(v))} />
          </Field>
          <Field label="Régime TVA">
            <Select value={form.regime_tva} onChange={v => set('regime_tva', v)} options={[
              { value: 'mensuel', label: 'Mensuel' },
              { value: 'trimestriel', label: 'Trimestriel' },
              { value: 'annuel', label: 'Annuel' },
            ]} />
          </Field>
        </div>
      </Section>
    </div>
  )
}