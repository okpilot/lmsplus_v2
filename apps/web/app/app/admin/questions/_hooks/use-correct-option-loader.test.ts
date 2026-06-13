import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCorrectOptionLoader } from './use-correct-option-loader'

// ---- Mocks ----------------------------------------------------------------

const mockGetCorrectOption = vi.hoisted(() => vi.fn())
const mockToastError = vi.hoisted(() => vi.fn())

vi.mock('../actions/get-correct-option', () => ({
  getCorrectOption: mockGetCorrectOption,
}))

vi.mock('sonner', () => ({
  toast: { error: mockToastError },
}))

// ---- Helpers --------------------------------------------------------------

const QUESTION_ID = '00000000-0000-4000-a000-000000000001'

function setup(args: { questionId: string | undefined; isEdit: boolean }) {
  const setCorrectOptionId = vi.fn()
  const view = renderHook(() =>
    useCorrectOptionLoader({
      questionId: args.questionId,
      isEdit: args.isEdit,
      getSetCorrectOptionId: () => setCorrectOptionId,
    }),
  )
  return { ...view, setCorrectOptionId }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useCorrectOptionLoader', () => {
  it('opens a new question without fetching the saved answer key', async () => {
    const { result, setCorrectOptionId } = setup({ questionId: undefined, isEdit: false })

    await act(async () => {
      result.current.handleOpenChange(true)
    })

    expect(result.current.open).toBe(true)
    expect(mockGetCorrectOption).not.toHaveBeenCalled()
    expect(setCorrectOptionId).not.toHaveBeenCalled()
  })

  it('fetches and seeds the saved answer key before opening in edit mode', async () => {
    mockGetCorrectOption.mockResolvedValue({ correctOptionId: 'c' })
    const { result, setCorrectOptionId } = setup({ questionId: QUESTION_ID, isEdit: true })

    await act(async () => {
      result.current.handleOpenChange(true)
    })

    expect(mockGetCorrectOption).toHaveBeenCalledWith(QUESTION_ID)
    expect(setCorrectOptionId).toHaveBeenCalledWith('c')
    expect(result.current.open).toBe(true)
  })

  it('coerces an unexpected answer-key value to empty before seeding', async () => {
    mockGetCorrectOption.mockResolvedValue({ correctOptionId: null })
    const { result, setCorrectOptionId } = setup({ questionId: QUESTION_ID, isEdit: true })

    await act(async () => {
      result.current.handleOpenChange(true)
    })

    expect(setCorrectOptionId).toHaveBeenCalledWith('')
    expect(result.current.open).toBe(true)
  })

  it('opens in a degraded state when the fetch rejects: logs, toasts, seeds empty', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetCorrectOption.mockRejectedValue(new Error('network down'))
    const { result, setCorrectOptionId } = setup({ questionId: QUESTION_ID, isEdit: true })

    await act(async () => {
      result.current.handleOpenChange(true)
    })

    expect(errorSpy).toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalledWith(
      'Could not load the saved correct answer — please re-select it.',
    )
    expect(setCorrectOptionId).toHaveBeenCalledWith('')
    expect(result.current.open).toBe(true)
    errorSpy.mockRestore()
  })

  it('closes the dialog without fetching when opening is requested off', async () => {
    mockGetCorrectOption.mockResolvedValue({ correctOptionId: 'a' })
    const { result } = setup({ questionId: QUESTION_ID, isEdit: true })

    // Open first.
    await act(async () => {
      result.current.handleOpenChange(true)
    })
    expect(result.current.open).toBe(true)
    mockGetCorrectOption.mockClear()

    // Then close.
    act(() => {
      result.current.handleOpenChange(false)
    })

    expect(result.current.open).toBe(false)
    expect(mockGetCorrectOption).not.toHaveBeenCalled()
  })

  it('ignores open requests while a fetch transition is pending', async () => {
    // A never-resolving fetch keeps isPending true after the first open call.
    mockGetCorrectOption.mockReturnValue(new Promise(() => {}))
    const { result, setCorrectOptionId } = setup({ questionId: QUESTION_ID, isEdit: true })

    act(() => {
      result.current.handleOpenChange(true)
    })
    expect(result.current.isPending).toBe(true)
    expect(mockGetCorrectOption).toHaveBeenCalledTimes(1)

    // A second invocation while pending is a no-op (no extra fetch, no seed).
    act(() => {
      result.current.handleOpenChange(false)
    })

    expect(mockGetCorrectOption).toHaveBeenCalledTimes(1)
    expect(setCorrectOptionId).not.toHaveBeenCalled()
  })
})
