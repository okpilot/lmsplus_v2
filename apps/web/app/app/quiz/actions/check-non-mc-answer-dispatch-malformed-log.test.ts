import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))

import {
  checkDiagramLabelAnswer,
  checkDialogFillAnswer,
  checkOrderingAnswer,
  checkShortAnswer,
} from './check-non-mc-answer-dispatch'
import type { SupabaseClient } from './check-non-mc-answer-helpers'

const QUESTION_ID = '00000000-0000-4000-a000-000000000011'
const SESSION_ID = '00000000-0000-4000-a000-000000000099'
const FAKE_SUPABASE = { rpc: mockRpc } as unknown as SupabaseClient
const base = { questionId: QUESTION_ID, sessionId: SESSION_ID }

afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.resetAllMocks()
})

describe('non-MC malformed RPC result', () => {
  it.each([
    ['short_answer', () => checkShortAnswer(FAKE_SUPABASE, { ...base, responseText: 'x' })],
    ['ordering', () => checkOrderingAnswer(FAKE_SUPABASE, { ...base, order: ['a'] })],
    [
      'dialog_fill',
      () =>
        checkDialogFillAnswer(FAKE_SUPABASE, { ...base, blankAnswers: [{ index: 0, text: 'x' }] }),
    ],
    [
      'diagram_label',
      () =>
        checkDiagramLabelAnswer(FAKE_SUPABASE, {
          ...base,
          mapping: [{ zoneId: 'z1', labelId: 'l1' }],
        }),
    ],
  ])(
    'logs "malformed RPC result" instead of undefined for %s when the RPC returns the wrong shape without an error',
    async (type, run) => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockRpc.mockResolvedValue({ data: { unexpected: true }, error: null })
      await expect(run()).resolves.toEqual({ success: false, error: 'Could not check answer' })
      expect(consoleSpy).toHaveBeenCalledWith(
        `[checkNonMcAnswer] ${type} RPC error:`,
        'malformed RPC result',
        { questionId: QUESTION_ID, sessionId: SESSION_ID },
      )
    },
  )
})
