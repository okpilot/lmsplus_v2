import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const { mockRouterPush, mockSubmitSectionResponse } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockSubmitSectionResponse: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('../../../actions/submit-section-response', () => ({
  submitSectionResponse: (...args: unknown[]) => mockSubmitSectionResponse(...args),
}))

// ---- Subject under test -------------------------------------------------------

import { useSectionSubmit } from './use-section-submit'

// ---- Fixtures -----------------------------------------------------------------

const SESSION_ID = 'sess-1'
const SECTION_NO = 1

function makeAudioFile(): File {
  return new File([new Uint8Array(10)], 'answer.webm', { type: 'audio/webm' })
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Tests ----------------------------------------------------------------------

describe('useSectionSubmit — FormData contents', () => {
  it('builds FormData with the audio file, session id, section number, and duration', async () => {
    mockSubmitSectionResponse.mockResolvedValue({ success: true, responseId: 'resp-1' })
    const { result } = renderHook(() =>
      useSectionSubmit({ sessionId: SESSION_ID, sectionNo: SECTION_NO }),
    )
    const file = makeAudioFile()

    await act(async () => {
      result.current.submit(file, 4200)
    })
    await waitFor(() => expect(mockSubmitSectionResponse).toHaveBeenCalledTimes(1))

    const formData = mockSubmitSectionResponse.mock.calls[0]?.[0] as FormData
    expect(formData.get('audio')).toBe(file)
    expect(formData.get('sessionId')).toBe(SESSION_ID)
    expect(formData.get('sectionNo')).toBe(String(SECTION_NO))
    expect(formData.get('durationMs')).toBe('4200')
  })
})

describe('useSectionSubmit — success path', () => {
  it('navigates to the report page for this session on success', async () => {
    mockSubmitSectionResponse.mockResolvedValue({ success: true, responseId: 'resp-1' })
    const { result } = renderHook(() =>
      useSectionSubmit({ sessionId: SESSION_ID, sectionNo: SECTION_NO }),
    )

    await act(async () => {
      result.current.submit(makeAudioFile(), 1000)
    })

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith(`/app/elp/report/${SESSION_ID}`),
    )
    expect(result.current.error).toBeNull()
  })
})

describe('useSectionSubmit — failure path', () => {
  it('surfaces the returned error and does not navigate when the action reports failure', async () => {
    mockSubmitSectionResponse.mockResolvedValue({
      success: false,
      error: 'This section was already submitted.',
    })
    const { result } = renderHook(() =>
      useSectionSubmit({ sessionId: SESSION_ID, sectionNo: SECTION_NO }),
    )

    await act(async () => {
      result.current.submit(makeAudioFile(), 1000)
    })

    await waitFor(() => expect(result.current.error).toBe('This section was already submitted.'))
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('surfaces a generic error and does not navigate when the action throws', async () => {
    mockSubmitSectionResponse.mockRejectedValue(new Error('network failure'))
    const { result } = renderHook(() =>
      useSectionSubmit({ sessionId: SESSION_ID, sectionNo: SECTION_NO }),
    )

    await act(async () => {
      result.current.submit(makeAudioFile(), 1000)
    })

    await waitFor(() =>
      expect(result.current.error).toBe('Something went wrong. Please try again.'),
    )
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('allows a retry after a failed submit resets the re-entry lock', async () => {
    mockSubmitSectionResponse
      .mockResolvedValueOnce({ success: false, error: 'Failed to submit section.' })
      .mockResolvedValueOnce({ success: true, responseId: 'resp-2' })
    const { result } = renderHook(() =>
      useSectionSubmit({ sessionId: SESSION_ID, sectionNo: SECTION_NO }),
    )

    await act(async () => {
      result.current.submit(makeAudioFile(), 1000)
    })
    await waitFor(() => expect(mockSubmitSectionResponse).toHaveBeenCalledTimes(1))

    await act(async () => {
      result.current.submit(makeAudioFile(), 1000)
    })
    await waitFor(() => expect(mockSubmitSectionResponse).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith(`/app/elp/report/${SESSION_ID}`),
    )
  })
})

describe('useSectionSubmit — re-entry guard', () => {
  it('submits once when called twice before the first response settles', async () => {
    let resolveSubmit!: (v: { success: true; responseId: string }) => void
    mockSubmitSectionResponse.mockReturnValue(
      new Promise<{ success: true; responseId: string }>((res) => {
        resolveSubmit = res
      }),
    )
    const { result } = renderHook(() =>
      useSectionSubmit({ sessionId: SESSION_ID, sectionNo: SECTION_NO }),
    )

    await act(async () => {
      result.current.submit(makeAudioFile(), 1000)
      result.current.submit(makeAudioFile(), 1000)
    })

    expect(mockSubmitSectionResponse).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveSubmit({ success: true, responseId: 'resp-3' })
    })
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith(`/app/elp/report/${SESSION_ID}`),
    )
  })
})
