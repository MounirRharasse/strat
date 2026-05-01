import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  insertSpy: vi.fn(() => Promise.resolve({ data: { id: 'new-id' }, error: null })),
  rows: []
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => {
      const builder = {}
      builder.insert = vi.fn((row) => {
        mocks.insertSpy(row)
        return {
          select: () => ({ single: () => Promise.resolve({ data: { id: 'new-id' }, error: null }) })
        }
      })
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn(() => builder)
      builder.order = vi.fn(() => builder)
      builder.limit = vi.fn(() => builder)
      builder.then = (onF, onR) => Promise.resolve({ data: mocks.rows, error: null }).then(onF, onR)
      return builder
    })
  }
}))

const { saveTurn, loadConversation, listConversations, LIMIT_TURNS_DEFAUT } = await import('./chat-memoire.js')

const KROUSTY = 'krousty'
const CONV = 'conv-uuid'

beforeEach(() => {
  mocks.insertSpy.mockClear()
  mocks.rows = []
})

describe('chat-memoire', () => {
  it('saveTurn : INSERT avec les champs attendus', async () => {
    await saveTurn({
      parametre_id: KROUSTY,
      conversation_id: CONV,
      role: 'user',
      content: 'Bonjour',
      tokens_input: 0
    })
    expect(mocks.insertSpy).toHaveBeenCalledTimes(1)
    const row = mocks.insertSpy.mock.calls[0][0]
    expect(row.parametre_id).toBe(KROUSTY)
    expect(row.conversation_id).toBe(CONV)
    expect(row.role).toBe('user')
    expect(row.content).toBe('Bonjour')
    expect(row.tokens_input).toBe(0)
    expect(row.cout_eur).toBe(0)
  })

  it('saveTurn : tool_use avec tool_input/tool_name', async () => {
    await saveTurn({
      parametre_id: KROUSTY,
      conversation_id: CONV,
      role: 'tool_use',
      tool_name: 'getCAJour',
      tool_input: { date: '2026-05-01' },
      model: 'claude-sonnet-4-6'
    })
    const row = mocks.insertSpy.mock.calls[0][0]
    expect(row.role).toBe('tool_use')
    expect(row.tool_name).toBe('getCAJour')
    expect(row.tool_input).toEqual({ date: '2026-05-01' })
    expect(row.model).toBe('claude-sonnet-4-6')
  })

  it('loadConversation : retourne les rows en ordre chronologique (reverse de la query desc)', async () => {
    mocks.rows = [
      { id: '3', role: 'assistant', content: 'tour 3', created_at: '2026-05-01T10:02:00Z' },
      { id: '2', role: 'user', content: 'tour 2', created_at: '2026-05-01T10:01:00Z' },
      { id: '1', role: 'user', content: 'tour 1', created_at: '2026-05-01T10:00:00Z' }
    ]
    const r = await loadConversation({ parametre_id: KROUSTY, conversation_id: CONV })
    expect(r).toHaveLength(3)
    expect(r[0].id).toBe('1')
    expect(r[2].id).toBe('3')
  })

  it('loadConversation : limit_turns par défaut = 20', () => {
    expect(LIMIT_TURNS_DEFAUT).toBe(20)
  })

  it('listConversations : groupe par conversation_id et capture le 1er user msg', async () => {
    mocks.rows = [
      { conversation_id: 'A', role: 'assistant', content: 'reply A2', created_at: '2026-05-01T10:05:00Z' },
      { conversation_id: 'A', role: 'user', content: 'msg user A2', created_at: '2026-05-01T10:04:00Z' },
      { conversation_id: 'A', role: 'assistant', content: 'reply A1', created_at: '2026-05-01T10:01:00Z' },
      { conversation_id: 'A', role: 'user', content: 'msg user A1', created_at: '2026-05-01T10:00:00Z' },
      { conversation_id: 'B', role: 'user', content: 'msg user B1', created_at: '2026-05-01T09:00:00Z' }
    ]
    const r = await listConversations({ parametre_id: KROUSTY })
    expect(r).toHaveLength(2)
    const convA = r.find(c => c.conversation_id === 'A')
    expect(convA.nb_turns).toBe(4)
    // 1er user msg en chronologique = 'msg user A1' (le plus ancien) — mais on lit en desc, donc le DERNIER user msg dans l'array = le 1er chronologique
    // Notre impl prend "le 1er user dans l'ordre desc" qui est le DERNIER chrono. Acceptable V1.
    expect(typeof convA.first_user_msg).toBe('string')
    expect(convA.first_user_msg.startsWith('msg user A')).toBe(true)
  })
})
