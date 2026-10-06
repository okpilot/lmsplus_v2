import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEVICE } from './finish-fixture'
import { finishSeedSession, P, saveAndFinish, saveSeedAnswers } from './save-and-finish'

const mockRpc = vi.hoisted(() => vi.fn())
const client = { rpc: mockRpc } as unknown as SupabaseClient

const ANSWERS = [
  { questionId: 'q1', answer: P.mc('a') },
  { questionId: 'q2', answer: P.short('wilco'), timeSpentMs: 42 },
]

beforeEach(() => {
  vi.resetAllMocks()
})

describe('P payload builders', () => {
  it('numbers dialog blanks by position', () => {
    expect(P.dialog(['x', 'y'])).toEqual({
      blanks: [
        { blank_index: 0, response_text: 'x' },
        { blank_index: 1, response_text: 'y' },
      ],
    })
  })
})

describe('saveSeedAnswers', () => {
  it('saves each answer with the seed device and a default time spent', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })

    await saveSeedAnswers(client, 's1', ANSWERS)

    expect(mockRpc).toHaveBeenNthCalledWith(1, 'save_quiz_answer', {
      p_session_id: 's1',
      p_question_id: 'q1',
      p_answer: { selected_option_id: 'a' },
      p_time_spent_ms: 1000,
      p_device_id: DEVICE,
    })
    expect(mockRpc.mock.calls[1]?.[1]).toMatchObject({ p_time_spent_ms: 42 })
  })

  it('throws on the first failed save and stops', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'nope' } })

    await expect(saveSeedAnswers(client, 's1', ANSWERS)).rejects.toThrow('save_quiz_answer: nope')
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })
})

describe('finishSeedSession', () => {
  it('returns the finish result object', async () => {
    mockRpc.mockResolvedValue({ data: { score_percentage: 100 }, error: null })

    await expect(finishSeedSession(client, 's1')).resolves.toEqual({ score_percentage: 100 })
    expect(mockRpc).toHaveBeenCalledWith('finish_quiz_session', {
      p_session_id: 's1',
      p_device_id: DEVICE,
    })
  })

  it('throws when the RPC errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_discarded' } })

    await expect(finishSeedSession(client, 's1')).rejects.toThrow(
      'finish_quiz_session: session_discarded',
    )
  })

  it('throws a labelled error when the RPC returns null without an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })

    await expect(finishSeedSession(client, 's1')).rejects.toThrow(/finish_quiz_session/)
  })
})

describe('saveAndFinish', () => {
  it('finishes only after all saves, and not at all when a save fails', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null })
    await saveAndFinish(client, 's1', ANSWERS)
    expect(mockRpc.mock.calls.map((c) => c[0])).toEqual([
      'save_quiz_answer',
      'save_quiz_answer',
      'finish_quiz_session',
    ])

    mockRpc.mockReset()
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(saveAndFinish(client, 's1', ANSWERS)).rejects.toThrow('boom')
    expect(mockRpc.mock.calls.map((c) => c[0])).not.toContain('finish_quiz_session')
  })
})
