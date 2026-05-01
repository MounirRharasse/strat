'use client'

// Sprint IA Phase 1 commit 10 — UI Chat conversationnel.
//
// Consomme POST /api/ia/chat (SSE) du commit 9.
// État local React, conversationId persisté localStorage,
// streaming progressif, auto-scroll, empty state suggestions.

import { useState, useEffect, useRef, useCallback } from 'react'

const CONVERSATION_KEY = 'strat_chat_conversation_id'

const SUGGESTIONS = [
  "Combien j'ai fait hier ?",
  "C'est qui mon plus gros fournisseur ce mois ?",
  "Mon food cost est élevé ?"
]

const SIGNAL_LABEL = {
  getCAJour: 'CA du jour',
  getCASemaine: 'CA de la semaine',
  getCAMois: 'CA du mois',
  getFoodCost: 'Food cost',
  getSeuilRentabilite: 'Seuil de rentabilité',
  getTopFournisseurs: 'Top fournisseurs',
  getTransactionsFournisseur: 'Transactions fournisseur',
  getMedianeFournisseur: 'Médiane fournisseur',
  getAnomaliesJournal: 'Anomalies journal',
  getTrousSaisie: 'Trous de saisie',
  getInsightsRecents: 'Insights récents',
  getBriefSemaine: 'Brief semaine',
  getParametres: 'Paramètres',
  getStatutSynchro: 'Statut synchro',
  getDateAujourdhui: 'Date du jour'
}

function getOrCreateConversationId() {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(CONVERSATION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(CONVERSATION_KEY, id)
  }
  return id
}

function newConversationId() {
  const id = crypto.randomUUID()
  localStorage.setItem(CONVERSATION_KEY, id)
  return id
}

export default function ChatClient() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [conversationId, setConversationId] = useState('')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // Init conversationId après hydration (évite mismatch SSR/CSR)
  useEffect(() => {
    setConversationId(getOrCreateConversationId())
  }, [])

  // Auto-scroll en bas dès que messages bougent
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isStreaming])

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isStreaming || !conversationId) return
    setError(null)
    setMessages(m => [
      ...m,
      { role: 'user', content: text },
      { role: 'assistant', content: '', tool_uses: [] }
    ])
    setIsStreaming(true)

    try {
      const res = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, message: text })
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        if (res.status === 429) {
          setError('Tu as atteint ta limite de 30 chats par jour. Reviens demain.')
        } else if (res.status === 401) {
          setError('Session expirée. Recharge la page.')
        } else {
          setError(errBody.error || 'Erreur de connexion. Réessaie.')
        }
        // Retire le message assistant vide en attente
        setMessages(m => m.slice(0, -1))
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const evt of events) {
          if (!evt.startsWith('data: ')) continue
          const json = evt.slice(6).trim()
          if (!json) continue
          let chunk
          try { chunk = JSON.parse(json) } catch { continue }
          handleChunk(chunk)
        }
      }
    } catch (e) {
      setError(e.message || 'Erreur réseau')
      setMessages(m => m.slice(0, -1))
    } finally {
      setIsStreaming(false)
    }
  }, [conversationId, isStreaming])

  function handleChunk(chunk) {
    if (chunk.type === 'token' && typeof chunk.data === 'string') {
      setMessages(m => {
        const last = m[m.length - 1]
        if (!last || last.role !== 'assistant') return m
        return [...m.slice(0, -1), { ...last, content: (last.content || '') + chunk.data }]
      })
    } else if (chunk.type === 'tool_use' && chunk.data) {
      setMessages(m => {
        const last = m[m.length - 1]
        if (!last || last.role !== 'assistant') return m
        const tool_uses = [...(last.tool_uses || []), { name: chunk.data.name, status: 'running' }]
        return [...m.slice(0, -1), { ...last, tool_uses }]
      })
    } else if (chunk.type === 'tool_result' && chunk.data) {
      setMessages(m => {
        const last = m[m.length - 1]
        if (!last || last.role !== 'assistant') return m
        const tool_uses = (last.tool_uses || []).map((tu, i, arr) =>
          i === arr.length - 1 ? { ...tu, status: chunk.data.success ? 'done' : 'error' } : tu
        )
        return [...m.slice(0, -1), { ...last, tool_uses }]
      })
    } else if (chunk.type === 'error') {
      const raison = chunk.data?.raison || chunk.data?.message || 'Erreur'
      const userFriendly = (
        raison === 'pattern_injection_detecte' || raison === 'caractere_invisible_detecte' ||
        raison === 'sequence_sql_suspecte' || raison === 'message_trop_long' ||
        raison === 'message_vide'
      )
        ? "Je suis l'assistant Strat. Pose-moi une question concrète sur ton business et je t'aiderai."
        : raison === 'cost_cap_atteint'
          ? "La conversation est devenue trop longue. Démarre une nouvelle conversation pour continuer."
          : raison === 'loop_limit_atteint'
            ? "Je tourne en rond sur cette question. Reformule autrement ?"
            : "Je n'arrive pas à répondre pour le moment. Réessaie dans quelques secondes."
      // Remplace le message assistant vide par le message d'erreur (style assistant)
      setMessages(m => {
        const last = m[m.length - 1]
        if (!last || last.role !== 'assistant') return m
        return [...m.slice(0, -1), { ...last, content: userFriendly, error: true }]
      })
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!input.trim() || isStreaming) return
    const text = input
    setInput('')
    sendMessage(text)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  function handleNewConversation() {
    if (messages.length > 0 && !confirm('Effacer cette conversation et en démarrer une nouvelle ?')) return
    setConversationId(newConversationId())
    setMessages([])
    setError(null)
    setInput('')
    inputRef.current?.focus()
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white max-w-md mx-auto flex flex-col">
      {/* Header sticky */}
      <header className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">💬</span>
          <h1 className="font-semibold tracking-tight">Strat IA</h1>
        </div>
        <button
          onClick={handleNewConversation}
          className="text-xs text-gray-500 hover:text-white transition px-2 py-1 rounded-md border border-gray-800 hover:border-gray-600"
          aria-label="Nouvelle conversation"
        >
          🔄 Nouvelle
        </button>
      </header>

      {/* Body scrollable */}
      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 pt-4 pb-32"
      >
        {messages.length === 0 && !error && (
          <div className="mt-8">
            <p className="text-sm text-gray-400 mb-4 leading-relaxed">
              Pose-moi une question sur ton business — CA, food cost, fournisseurs, anomalies, performances.
            </p>
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Suggestions</p>
            <div className="space-y-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  disabled={isStreaming}
                  className="w-full text-left text-sm bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl px-4 py-3 transition disabled:opacity-50"
                >
                  💡 {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-950/40 border border-red-900 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-red-300">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-400 hover:text-red-200 mt-1"
            >
              Fermer
            </button>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
          {isStreaming && messages[messages.length - 1]?.content === '' && (
            <div className="flex gap-1 mt-1">
              <span className="w-2 h-2 bg-gray-600 rounded-full animate-pulse"></span>
              <span className="w-2 h-2 bg-gray-600 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
              <span className="w-2 h-2 bg-gray-600 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></span>
            </div>
          )}
        </div>
      </main>

      {/* Input fixed bottom (au-dessus de NavBar) */}
      <form
        onSubmit={handleSubmit}
        className="fixed bottom-[64px] left-0 right-0 max-w-md mx-auto bg-gray-950 border-t border-gray-800 px-4 py-3 flex items-end gap-2"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Pose ta question…"
          disabled={isStreaming}
          className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none disabled:opacity-50"
          style={{ maxHeight: '120px' }}
        />
        <button
          type="submit"
          disabled={!input.trim() || isStreaming}
          className="bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl w-10 h-10 flex items-center justify-center disabled:bg-gray-800 disabled:text-gray-600 transition"
          aria-label="Envoyer"
        >
          ➤
        </button>
      </form>
    </div>
  )
}

function MessageBubble({ msg }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-blue-900/30 border border-blue-900/50 rounded-2xl rounded-tr-sm px-3 py-2">
          <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    )
  }
  // assistant
  return (
    <div className="flex justify-start">
      <div className={`max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-2 ${msg.error ? 'bg-red-950/30 border border-red-900/50' : 'bg-gray-900 border border-gray-800'}`}>
        {msg.tool_uses?.length > 0 && (
          <div className="mb-2 space-y-1">
            {msg.tool_uses.map((tu, i) => (
              <p key={i} className="text-xs italic text-gray-500">
                {tu.status === 'done' ? '🔍' : tu.status === 'error' ? '⚠️' : '⏳'} Consulté : {SIGNAL_LABEL[tu.name] || tu.name}
              </p>
            ))}
          </div>
        )}
        {msg.content && (
          <p className={`text-sm leading-relaxed whitespace-pre-wrap ${msg.error ? 'text-red-200' : 'text-gray-200'}`}>{msg.content}</p>
        )}
      </div>
    </div>
  )
}
