'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await signIn('credentials', {
      username,
      password,
      redirect: false
    })

    if (res?.ok) {
      router.push('/dashboard')
    } else {
      setError('Identifiant ou mot de passe incorrect')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Strat.</h1>
          <p className="text-gray-400 mt-2 text-sm">Ton cockpit business</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <div className="mb-4">
            <label className="text-sm text-gray-400 block mb-2">Identifiant</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="mounir"
              required
            />
          </div>

          <div className="mb-6">
            <label className="text-sm text-gray-400 block mb-2">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="bg-red-950 border border-red-800 text-red-400 text-sm rounded-xl px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-gray-950 font-semibold rounded-xl py-3 hover:bg-gray-100 transition disabled:opacity-50"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}