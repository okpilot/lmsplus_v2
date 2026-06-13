import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRpc = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

// ---- Subject under test ---------------------------------------------------

import { getCorrectOption } from './get-correct-option'

const QUESTION_ID = '00000000-0000-4000-a000-000000000001'

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({ supabase: { rpc: mockRpc } })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getCorrectOption', () => {
  it('returns the correct option id from the authoring RPC', async () => {
    mockAdmin()
    mockRpc.mockResolvedValue({ data: [{ correct_option_id: 'c' }], error: null })

    const result = await getCorrectOption(QUESTION_ID)

    expect(result).toEqual({ correctOptionId: 'c' })
    expect(mockRpc).toHaveBeenCalledWith('get_question_authoring_fields', {
      p_question_id: QUESTION_ID,
    })
  })

  it('returns null when the RPC returns no rows', async () => {
    mockAdmin()
    mockRpc.mockResolvedValue({ data: [], error: null })

    const result = await getCorrectOption(QUESTION_ID)

    expect(result).toEqual({ correctOptionId: null })
  })

  it('returns null and logs when the RPC errors', async () => {
    mockAdmin()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } })

    const result = await getCorrectOption(QUESTION_ID)

    expect(result).toEqual({ correctOptionId: null })
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('returns null without calling the RPC when the question id is not a string', async () => {
    mockAdmin()

    const result = await getCorrectOption(undefined)

    expect(result).toEqual({ correctOptionId: null })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns null without calling the RPC when the question id is not a valid uuid', async () => {
    mockAdmin()

    const result = await getCorrectOption('not-a-uuid')

    expect(result).toEqual({ correctOptionId: null })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
