'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function login() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    if (res.ok) {
      router.push('/admin')
    } else {
      setError('Mot de passe incorrect')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm">
        <div className="mb-6">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Strat</p>
          <h1 className="text-2xl font-bold text-white">Backoffice</h1>
          <p className="text-gray-400 text-sm mt-1">Accès administrateur</p>
        </div>
        <div className="mb-4">
          <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            placeholder="••••••••"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-gray-500"
            autoFocus
          />
        </div>
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
        <button onClick={login} disabled={loading || !password}
          className="w-full py-2.5 rounded-xl bg-white text-gray-950 font-semibold text-sm hover:bg-gray-100 transition disabled:opacity-40">
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </div>
    </div>
  )
}