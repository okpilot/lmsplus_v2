import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

import type { ResumeContext } from './resume-helpers'
import { discardMintedSession, finishResume, seedSessionFromDraft } from './resume-seed'

type Client = Parameters<typeof seedSessionFromDraft>[0]

const SESSION = '00000000-0000-4000-a000-000000000002'
const DRAFT = '00000000-0000-4000-a000-000000000050'
const USER = '00000000-0000-4000-a000-000000000001'
const Q1 = '00000000-0000-4000-a000-000000000011'
const Q2 = '00000000-0000-4000-a000-000000000012'
const Q3 = '00000000-0000-4000-a000-000000000013'

/** Chain whose named terminal resolves to `result`; every other call returns the chain. */
function chain(result: unknown, terminal: string) {
  const proxy: object = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return undefined
        if (prop === terminal) return () => result
        return () => proxy
      },
    },
  )
  return proxy
}

function clientFor(tables: Record<string, unknown>): Client {
  return { from: vi.fn((table: string) => tables[table]) } as unknown as Client
}

function ctx(over: Partial<ResumeContext> = {}): ResumeContext {
  return {
    oldSessionId: 'old',
    questionIds: [Q1, Q2, Q3],
    mode: 'quick_quiz',
    subjectId: null,
    topicId: null,
    answers: {},
    currentIndex: 0,
    ...over,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  mockRpc.mockResolvedValue({ data: null, error: null })
})

function rpcCalls(name: string) {
  return mockRpc.mock.calls.filter((c) => c[1] === name).map((c) => c[2] as Record<string, unknown>)
}

describe('seedSessionFromDraft', () => {
  it('saves each draft answer in the shape the progress RPC accepts', async () => {
    const answers = {
      [Q1]: { selectedOptionId: 'c', responseTimeMs: 1200 },
      [Q2]: { responseText: 'QNH', responseTimeMs: 800 },
      [Q3]: { blankAnswers: [{ index: 0, text: 'ab' }], responseTimeMs: 50 },
    }
    expect(await seedSessionFromDraft({} as Client, SESSION, ctx({ answers }))).toBe(true)

    const saved = rpcCalls('save_quiz_answer')
    expect(saved).toHaveLength(3)
    expect(saved[0]).toMatchObject({
      p_session_id: SESSION,
      p_question_id: Q1,
      p_answer: { selected_option_id: 'c' },
      p_time_spent_ms: 1200,
    })
    expect(saved[1]).toMatchObject({ p_answer: { response_text: 'QNH' }, p_time_spent_ms: 800 })
    expect(saved[2]).toMatchObject({
      p_answer: { blanks: [{ blank_index: 0, response_text: 'ab' }] },
    })
  })

  it('converts ordering and diagram answers to their RPC shapes', async () => {
    const answers = {
      [Q1]: { order: ['x', 'y'], responseTimeMs: 1 },
      [Q2]: { mapping: [{ zoneId: 'z1', labelId: 'l1' }], responseTimeMs: 2 },
    }
    expect(await seedSessionFromDraft({} as Client, SESSION, ctx({ answers }))).toBe(true)
    const saved = rpcCalls('save_quiz_answer')
    expect(saved[0]?.p_answer).toEqual({ order: ['x', 'y'] })
    expect(saved[1]?.p_answer).toEqual({ mapping: [{ zone_id: 'z1', label_id: 'l1' }] })
  })

  it('uses one fresh device id for every seeded write', async () => {
    const answers = { [Q1]: { selectedOptionId: 'a', responseTimeMs: 1 } }
    await seedSessionFromDraft({} as Client, SESSION, ctx({ answers }))
    const [answer] = rpcCalls('save_quiz_answer')
    const [position] = rpcCalls('save_quiz_position')
    expect(answer?.p_device_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(position?.p_device_id).toBe(answer?.p_device_id)
  })

  it('saves the draft position with no pins after the answers', async () => {
    const answers = { [Q1]: { selectedOptionId: 'a', responseTimeMs: 1 } }
    await seedSessionFromDraft({} as Client, SESSION, ctx({ answers, currentIndex: 2 }))
    expect(mockRpc.mock.calls.map((c) => c[1])).toEqual(['save_quiz_answer', 'save_quiz_position'])
    expect(rpcCalls('save_quiz_position')[0]).toMatchObject({
      p_session_id: SESSION,
      p_current_index: 2,
      p_pinned_question_ids: [],
    })
  })

  it('clamps a position past the last question to the last question', async () => {
    await seedSessionFromDraft({} as Client, SESSION, ctx({ currentIndex: 99 }))
    expect(rpcCalls('save_quiz_position')[0]?.p_current_index).toBe(2)
  })

  it('seeds position 0 when the draft holds a negative position', async () => {
    await seedSessionFromDraft({} as Client, SESSION, ctx({ currentIndex: -3 }))
    expect(rpcCalls('save_quiz_position')[0]?.p_current_index).toBe(0)
  })

  it('seeds the position of a draft with no answers', async () => {
    expect(await seedSessionFromDraft({} as Client, SESSION, ctx({ answers: null }))).toBe(true)
    expect(rpcCalls('save_quiz_answer')).toHaveLength(0)
    expect(rpcCalls('save_quiz_position')).toHaveLength(1)
  })

  it('stops and reports failure when an answer save fails on a taken-over session', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_taken_over' } })
    const answers = {
      [Q1]: { selectedOptionId: 'a', responseTimeMs: 1 },
      [Q2]: { selectedOptionId: 'b', responseTimeMs: 1 },
    }
    expect(await seedSessionFromDraft({} as Client, SESSION, ctx({ answers }))).toBe(false)
    expect(rpcCalls('save_quiz_answer')).toHaveLength(1)
    expect(rpcCalls('save_quiz_position')).toHaveLength(0)
  })

  it('reports failure when the position save fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'invalid_position' } })
    expect(await seedSessionFromDraft({} as Client, SESSION, ctx())).toBe(false)
  })

  it('skips a malformed draft answer, logs it and still seeds the rest', async () => {
    const answers = {
      [Q1]: { selectedOptionId: 'zzz', responseTimeMs: 1 },
      [Q2]: { selectedOptionId: 'b', responseTimeMs: 1 },
    }
    expect(await seedSessionFromDraft({} as Client, SESSION, ctx({ answers }))).toBe(true)
    expect(rpcCalls('save_quiz_answer')).toHaveLength(1)
    expect(rpcCalls('save_quiz_answer')[0]?.p_question_id).toBe(Q2)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('skipped'), Q1)
  })

  it('saves only answers for questions in the session, however many others the draft holds', async () => {
    const foreign = Array.from(
      { length: 5 },
      (_, i) => `00000000-0000-4000-a000-0000000009${String(i).padStart(2, '0')}`,
    )
    const answers = Object.fromEntries([
      [Q1, { selectedOptionId: 'a', responseTimeMs: 1 }],
      ...foreign.map((id) => [id, { selectedOptionId: 'a', responseTimeMs: 1 }]),
    ])
    expect(await seedSessionFromDraft({} as Client, SESSION, ctx({ answers }))).toBe(true)
    expect(rpcCalls('save_quiz_answer').map((a) => a.p_question_id)).toEqual([Q1])
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('dropped'), 5)
  })

  it('skips an answer keyed by a non-uuid question id', async () => {
    const answers = { nope: { selectedOptionId: 'a', responseTimeMs: 1 } }
    expect(
      await seedSessionFromDraft({} as Client, SESSION, ctx({ answers, questionIds: ['nope'] })),
    ).toBe(true)
    expect(rpcCalls('save_quiz_answer')).toHaveLength(0)
  })

  it.each(['invalid_answer', 'invalid_time_spent', 'question_not_in_session'])(
    'skips an answer the progress RPC rejects with %s and keeps seeding',
    async (token) => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: token } })
      const answers = {
        [Q1]: { selectedOptionId: 'a', responseTimeMs: 1 },
        [Q2]: { selectedOptionId: 'b', responseTimeMs: 1 },
      }
      expect(await seedSessionFromDraft({} as Client, SESSION, ctx({ answers }))).toBe(true)
      expect(rpcCalls('save_quiz_answer')).toHaveLength(2)
      expect(rpcCalls('save_quiz_position')).toHaveLength(1)
    },
  )

  it.each(['session_taken_over', 'session_config_malformed', 'connection reset'])(
    'aborts the seed when the progress RPC fails with %s',
    async (token) => {
      mockRpc.mockResolvedValue({ data: null, error: { message: token } })
      const answers = { [Q1]: { selectedOptionId: 'a', responseTimeMs: 1 } }
      expect(await seedSessionFromDraft({} as Client, SESSION, ctx({ answers }))).toBe(false)
    },
  )

  it.each([
    [-5, 0],
    [999_999_999, 86_400_000],
    [12.7, 12],
    [Number.NaN, 0],
    ['slow', 0],
    [undefined, 0],
  ])('sends a draft response time of %s as %s ms', async (given, sent) => {
    const answers = { [Q1]: { selectedOptionId: 'a', responseTimeMs: given } }
    expect(await seedSessionFromDraft({} as Client, SESSION, ctx({ answers }))).toBe(true)
    expect(rpcCalls('save_quiz_answer')[0]?.p_time_spent_ms).toBe(sent)
  })
})

describe('discardMintedSession', () => {
  it('soft-deletes the minted session', async () => {
    const client = clientFor({
      quiz_sessions: chain({ data: [{ id: SESSION }], error: null }, 'select'),
    })
    await discardMintedSession(client, SESSION, USER)
    expect(client.from).toHaveBeenCalledWith('quiz_sessions')
    expect(console.error).not.toHaveBeenCalled()
  })

  it('logs when the rollback fails', async () => {
    const client = clientFor({
      quiz_sessions: chain({ data: null, error: { message: 'boom' } }, 'select'),
    })
    await discardMintedSession(client, SESSION, USER)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('orphan'), SESSION, 'boom')
  })

  it('resolves without throwing when the rollback update rejects', async () => {
    const client = {
      from: vi.fn(() => {
        throw new Error('network down')
      }),
    } as unknown as Client
    await expect(discardMintedSession(client, SESSION, USER)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Rollback threw'),
      expect.any(Error),
    )
  })

  it('logs when the rollback matched no row', async () => {
    const client = clientFor({ quiz_sessions: chain({ data: [], error: null }, 'select') })
    await discardMintedSession(client, SESSION, USER)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('orphan'),
      SESSION,
      undefined,
    )
  })
})

describe('finishResume', () => {
  const ids = { draftId: DRAFT, userId: USER, sessionId: SESSION }

  it('deletes the draft after a clean seed', async () => {
    const client = clientFor({
      quiz_drafts: chain({ data: [{ id: DRAFT }], error: null }, 'select'),
    })
    expect(await finishResume(client, ids, ctx())).toBe(true)
    expect(client.from).toHaveBeenCalledWith('quiz_drafts')
    expect(client.from).not.toHaveBeenCalledWith('quiz_sessions')
  })

  it('keeps the draft and soft-deletes the new session when seeding fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'invalid_position' } })
    const client = clientFor({
      quiz_drafts: chain({ data: [{ id: DRAFT }], error: null }, 'select'),
      quiz_sessions: chain({ data: [{ id: SESSION }], error: null }, 'select'),
    })
    expect(await finishResume(client, ids, ctx())).toBe(false)
    expect(client.from).not.toHaveBeenCalledWith('quiz_drafts')
    expect(client.from).toHaveBeenCalledWith('quiz_sessions')
  })

  it('keeps and opens the seeded session when the draft delete fails', async () => {
    const client = clientFor({
      quiz_drafts: chain({ data: null, error: { message: 'boom' } }, 'select'),
      quiz_sessions: chain({ data: [{ id: SESSION }], error: null }, 'select'),
    })
    expect(await finishResume(client, ids, ctx())).toBe(true)
    expect(client.from).not.toHaveBeenCalledWith('quiz_sessions')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Draft delete'), 'boom')
  })

  it('keeps and opens the seeded session when the draft was already gone', async () => {
    const client = clientFor({
      quiz_drafts: chain({ data: [], error: null }, 'select'),
      quiz_sessions: chain({ data: [{ id: SESSION }], error: null }, 'select'),
    })
    expect(await finishResume(client, ids, ctx())).toBe(true)
    expect(client.from).not.toHaveBeenCalledWith('quiz_sessions')
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Draft already gone'), DRAFT)
  })

  it('discards the new session and rethrows the original error when the seed throws', async () => {
    const boom = new Error('seed transport failure')
    mockRpc.mockRejectedValue(boom)
    const client = clientFor({
      quiz_drafts: chain({ data: [{ id: DRAFT }], error: null }, 'select'),
      quiz_sessions: chain({ data: [{ id: SESSION }], error: null }, 'select'),
    })
    await expect(finishResume(client, ids, ctx())).rejects.toBe(boom)
    expect(client.from).toHaveBeenCalledWith('quiz_sessions')
    expect(client.from).not.toHaveBeenCalledWith('quiz_drafts')
  })

  it('rethrows the original seed error when the discard also fails', async () => {
    const boom = new Error('seed transport failure')
    mockRpc.mockRejectedValue(boom)
    const client = {
      from: vi.fn(() => {
        throw new Error('discard failed')
      }),
    } as unknown as Client
    await expect(finishResume(client, ids, ctx())).rejects.toBe(boom)
  })

  it('keeps and opens the seeded session when the draft delete throws', async () => {
    const boom = new Error('delete transport failure')
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'quiz_drafts') throw boom
        return chain({ data: [{ id: SESSION }], error: null }, 'select')
      }),
    } as unknown as Client
    await expect(finishResume(client, ids, ctx())).resolves.toBe(true)
    expect(client.from).not.toHaveBeenCalledWith('quiz_sessions')
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Draft delete threw'), boom)
  })
})
