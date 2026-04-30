import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock du client Supabase : on espionne juste l'insert dans ia_usage.
const mocks = vi.hoisted(() => ({
  insertSpy: vi.fn(() => Promise.resolve({ data: null, error: null }))
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ insert: mocks.insertSpy }))
  }
}))

// Import APRÈS le mock pour que le module utilise notre mock.
const { callClaude, _internal } = await import('./ai.js')

const KROUSTY_ID = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'

const ORIG_API_KEY = process.env.ANTHROPIC_API_KEY

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  global.fetch = vi.fn()
  mocks.insertSpy.mockClear()
})

afterEach(() => {
  process.env.ANTHROPIC_API_KEY = ORIG_API_KEY
})

function makeAnthropicResponse({ text = 'Bonjour.', tokensIn = 100, tokensOut = 50 } = {}) {
  return {
    ok: true,
    text: async () => '',
    json: async () => ({
      content: [{ type: 'text', text }],
      usage: { input_tokens: tokensIn, output_tokens: tokensOut },
      stop_reason: 'end_turn'
    })
  }
}

describe('callClaude — succès et structure de retour', () => {
  it('succès simple : retourne content + tokens + cout_eur', async () => {
    global.fetch.mockResolvedValueOnce(makeAnthropicResponse({
      text: 'OK', tokensIn: 200, tokensOut: 30
    }))

    const r = await callClaude({
      model: 'claude-haiku-4-5-20251001',
      system: 'system',
      messages: [{ role: 'user', content: 'ping' }],
      parametre_id: KROUSTY_ID,
      feature: 'test'
    })

    expect(r.error).toBeUndefined()
    expect(r.content).toBe('OK')
    expect(r.tokens_input).toBe(200)
    expect(r.tokens_output).toBe(30)
    expect(r.cout_eur).toBeGreaterThan(0)
    expect(r.model).toBe('claude-haiku-4-5-20251001')
    expect(r.raw).toBeDefined()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('inclut system et messages dans le body POST', async () => {
    global.fetch.mockResolvedValueOnce(makeAnthropicResponse())

    await callClaude({
      model: 'claude-haiku-4-5-20251001',
      system: 'mon system',
      messages: [{ role: 'user', content: 'mon message' }],
      parametre_id: KROUSTY_ID,
      feature: 'test'
    })

    const call = global.fetch.mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.system).toBe('mon system')
    expect(body.messages).toEqual([{ role: 'user', content: 'mon message' }])
    expect(call[1].headers['x-api-key']).toBe('test-key')
    expect(call[1].headers['anthropic-version']).toBe('2023-06-01')
  })
})

describe('callClaude — retries et fallback', () => {
  it('retries 2× puis succès au 3e essai', async () => {
    global.fetch
      .mockRejectedValueOnce(new Error('network error 1'))
      .mockRejectedValueOnce(new Error('network error 2'))
      .mockResolvedValueOnce(makeAnthropicResponse({ text: 'recovered' }))

    const r = await callClaude({
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'user', content: 'ping' }],
      parametre_id: KROUSTY_ID,
      feature: 'test'
    })

    expect(r.content).toBe('recovered')
    expect(r.error).toBeUndefined()
    expect(global.fetch).toHaveBeenCalledTimes(3)
  }, 10000)

  it('échec après 3 retries → { error, fallback_used: true }', async () => {
    global.fetch.mockRejectedValue(new Error('Anthropic down'))

    const r = await callClaude({
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'user', content: 'ping' }],
      parametre_id: KROUSTY_ID,
      feature: 'test'
    })

    expect(r.fallback_used).toBe(true)
    expect(r.error).toContain('Anthropic down')
    expect(global.fetch).toHaveBeenCalledTimes(3)
  }, 10000)

  it('échec si ANTHROPIC_API_KEY manquante (pas d\'appel HTTP)', async () => {
    delete process.env.ANTHROPIC_API_KEY

    const r = await callClaude({
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'user', content: 'ping' }],
      parametre_id: KROUSTY_ID,
      feature: 'test'
    })

    expect(r.fallback_used).toBe(true)
    expect(r.error).toContain('ANTHROPIC_API_KEY')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('réponse 401 → fallback (3 retries puis échec)', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":"invalid api key"}'
    })

    const r = await callClaude({
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'user', content: 'ping' }],
      parametre_id: KROUSTY_ID,
      feature: 'test'
    })

    expect(r.fallback_used).toBe(true)
    expect(r.error).toContain('401')
  }, 10000)
})

describe('callClaude — tracking ia_usage', () => {
  it('insère une ligne ia_usage avec succes=true en cas de succès', async () => {
    global.fetch.mockResolvedValueOnce(makeAnthropicResponse({
      text: 'ok', tokensIn: 100, tokensOut: 50
    }))

    await callClaude({
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'user', content: 'ping' }],
      parametre_id: KROUSTY_ID,
      feature: 'brief'
    })

    expect(mocks.insertSpy).toHaveBeenCalledTimes(1)
    const inserted = mocks.insertSpy.mock.calls[0][0]
    expect(inserted.parametre_id).toBe(KROUSTY_ID)
    expect(inserted.feature).toBe('brief')
    expect(inserted.modele).toBe('claude-haiku-4-5-20251001')
    expect(inserted.tokens_input).toBe(100)
    expect(inserted.tokens_output).toBe(50)
    expect(inserted.cout_estime_eur).toBeGreaterThan(0)
    expect(inserted.succes).toBe(true)
    expect(inserted.erreur).toBeNull()
  })

  it('insère une ligne ia_usage avec succes=false en cas d\'échec', async () => {
    global.fetch.mockRejectedValue(new Error('boom'))

    await callClaude({
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'user', content: 'ping' }],
      parametre_id: KROUSTY_ID,
      feature: 'anomalie'
    })

    expect(mocks.insertSpy).toHaveBeenCalledTimes(1)
    const inserted = mocks.insertSpy.mock.calls[0][0]
    expect(inserted.feature).toBe('anomalie')
    expect(inserted.succes).toBe(false)
    expect(inserted.erreur).toContain('boom')
    expect(inserted.tokens_input).toBe(0)
  }, 10000)

  it('ne plante pas si Supabase insert échoue (best-effort)', async () => {
    mocks.insertSpy.mockRejectedValueOnce(new Error('db down'))
    global.fetch.mockResolvedValueOnce(makeAnthropicResponse())

    const r = await callClaude({
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'user', content: 'ping' }],
      parametre_id: KROUSTY_ID,
      feature: 'test'
    })

    expect(r.error).toBeUndefined()
    expect(r.content).toBeTruthy()
  })
})

describe('calcul coût (calculerCoutEur)', () => {
  it('Haiku 4.5 : 1000 input + 500 output → coût attendu', () => {
    // Pricing : input 1$/M, output 5$/M, USD→EUR 0.92
    // (1000 * 1 / 1e6) + (500 * 5 / 1e6) = 0.001 + 0.0025 = 0.0035 USD
    // 0.0035 * 0.92 = 0.00322 EUR
    const cout = _internal.calculerCoutEur('claude-haiku-4-5-20251001', 1000, 500)
    expect(cout).toBeCloseTo(0.00322, 5)
  })

  it('Sonnet 4.6 : 1000 input + 500 output → coût attendu', () => {
    // (1000 * 3 / 1e6) + (500 * 15 / 1e6) = 0.003 + 0.0075 = 0.0105 USD
    // 0.0105 * 0.92 = 0.00966 EUR
    const cout = _internal.calculerCoutEur('claude-sonnet-4-6-20251022', 1000, 500)
    expect(cout).toBeCloseTo(0.00966, 5)
  })

  it('Sonnet est ~3× plus cher que Haiku à tokens égaux', () => {
    const haiku = _internal.calculerCoutEur('claude-haiku-4-5-20251001', 1000, 500)
    const sonnet = _internal.calculerCoutEur('claude-sonnet-4-6-20251022', 1000, 500)
    expect(sonnet / haiku).toBeCloseTo(3, 0)
  })

  it('modèle inconnu → fallback pricing par défaut', () => {
    const cout = _internal.calculerCoutEur('inconnu', 1000, 500)
    expect(cout).toBeGreaterThan(0)
  })
})

describe('callClaude — timeout', () => {
  it('timeout déclenche AbortController et fait échouer (avec fallback)', async () => {
    // fetch qui ne résout jamais sauf si signal abort
    global.fetch.mockImplementation((url, options) =>
      new Promise((resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    )

    const r = await callClaude({
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'user', content: 'ping' }],
      parametre_id: KROUSTY_ID,
      feature: 'test',
      opts: { timeout_ms: 50 }
    })

    expect(r.fallback_used).toBe(true)
    expect(global.fetch).toHaveBeenCalledTimes(3) // 3 tentatives toutes timeout
  }, 10000)
})
