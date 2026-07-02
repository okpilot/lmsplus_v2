import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Fakes ------------------------------------------------------------------

type DataAvailableHandler = ((event: { data: Blob }) => void) | null

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true)
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: DataAvailableHandler = null
  onstop: (() => void) | null = null

  constructor(public stream: MediaStream) {}

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio-chunk'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}

function createFakeStream(): MediaStream {
  const stop = vi.fn()
  return { getTracks: () => [{ stop }] } as unknown as MediaStream
}

const mockGetUserMedia = vi.fn()
const mockRevokeObjectUrl = vi.fn()
const mockCreateObjectUrl = vi.fn(() => 'blob:mock-url')

// ---- Subject under test ------------------------------------------------------

import { useAudioRecorder } from './use-audio-recorder'

// ---- Setup --------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  FakeMediaRecorder.isTypeSupported = vi.fn(() => true)
  mockGetUserMedia.mockResolvedValue(createFakeStream())
  mockCreateObjectUrl.mockReturnValue('blob:mock-url')
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: mockGetUserMedia } })
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal('URL', {
    createObjectURL: mockCreateObjectUrl,
    revokeObjectURL: mockRevokeObjectUrl,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---- Tests --------------------------------------------------------------------

describe('useAudioRecorder', () => {
  it('transitions from idle to recording once the microphone is granted', async () => {
    const { result } = renderHook(() => useAudioRecorder())
    expect(result.current.status).toBe('idle')

    act(() => {
      result.current.start()
    })

    await waitFor(() => expect(result.current.status).toBe('recording'))
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true })
  })

  it('produces a webm answer File when stop is called while recording', async () => {
    const { result } = renderHook(() => useAudioRecorder())
    act(() => {
      result.current.start()
    })
    await waitFor(() => expect(result.current.status).toBe('recording'))

    act(() => {
      result.current.stop()
    })

    expect(result.current.status).toBe('recorded')
    expect(result.current.file).toBeInstanceOf(File)
    expect(result.current.file?.name).toBe('answer.webm')
    expect(result.current.file?.type).toBe('audio/webm')
    expect(result.current.audioUrl).toBe('blob:mock-url')
  })

  it('sets status to denied when microphone permission is refused', async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error('Permission denied'))
    const { result } = renderHook(() => useAudioRecorder())

    act(() => {
      result.current.start()
    })

    await waitFor(() => expect(result.current.status).toBe('denied'))
    expect(result.current.error).toBeTruthy()
  })

  it('sets status to unsupported when the environment has no MediaRecorder', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    const { result } = renderHook(() => useAudioRecorder())

    act(() => {
      result.current.start()
    })

    expect(result.current.status).toBe('unsupported')
    expect(mockGetUserMedia).not.toHaveBeenCalled()
  })

  it('returns to idle and revokes the object URL on reset', async () => {
    const { result } = renderHook(() => useAudioRecorder())
    act(() => {
      result.current.start()
    })
    await waitFor(() => expect(result.current.status).toBe('recording'))
    act(() => {
      result.current.stop()
    })
    expect(result.current.status).toBe('recorded')

    act(() => {
      result.current.reset()
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.file).toBeNull()
    expect(result.current.audioUrl).toBeNull()
    expect(mockRevokeObjectUrl).toHaveBeenCalledWith('blob:mock-url')
  })

  it('records a non-negative duration bounded well below Date.now() after a completed recording', async () => {
    // Regression guard: if startedAtRef.current is never set (stays 0),
    // durationMs = Date.now() - 0 ≈ 1.75 × 10¹² — wrong but previously undetected.
    const { result } = renderHook(() => useAudioRecorder())
    act(() => {
      result.current.start()
    })
    await waitFor(() => expect(result.current.status).toBe('recording'))

    act(() => {
      result.current.stop()
    })

    expect(result.current.status).toBe('recorded')
    expect(result.current.durationMs).toBeGreaterThanOrEqual(0)
    // Upper bound: a test-suite round-trip is never more than 5 s; a never-set
    // startedAt gives ~5.6 × 10¹³ ms, so 10_000 is a tight but safe ceiling.
    expect(result.current.durationMs).toBeLessThan(10_000)
  })

  it('discards the in-flight recording and stays idle when reset while still recording', async () => {
    const { result } = renderHook(() => useAudioRecorder())
    act(() => {
      result.current.start()
    })
    await waitFor(() => expect(result.current.status).toBe('recording'))

    // Reset WITHOUT stop(): teardown must null the recorder's onstop so its pending
    // File is dropped, not delivered — otherwise a late 'recorded' overwrites idle.
    act(() => {
      result.current.reset()
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.file).toBeNull()
  })

  it('cancels a pending capture and releases the mic when reset before permission is granted', async () => {
    let grant: (stream: MediaStream) => void = () => {}
    mockGetUserMedia.mockImplementationOnce(
      () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve
        }),
    )
    const { result } = renderHook(() => useAudioRecorder())

    // start() launches getUserMedia but the prompt is still pending — status stays idle.
    act(() => {
      result.current.start()
    })
    // Cancel while the permission prompt is up.
    act(() => {
      result.current.reset()
    })

    // The grant resolves AFTER reset: onRecording must cancel + stop the stream, not record.
    const trackStop = vi.fn()
    const lateStream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream
    await act(async () => {
      grant(lateStream)
    })

    expect(result.current.status).toBe('idle')
    expect(trackStop).toHaveBeenCalled()
  })

  it('releases the mic when the component unmounts while a permission grant is still pending', async () => {
    let grant: (stream: MediaStream) => void = () => {}
    mockGetUserMedia.mockImplementationOnce(
      () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve
        }),
    )
    const { result, unmount } = renderHook(() => useAudioRecorder())

    // start() launches getUserMedia but the prompt is still pending — status stays idle.
    act(() => {
      result.current.start()
    })
    // Unmount while the permission prompt is up.
    unmount()

    // The grant resolves AFTER unmount: onRecording must cancel + stop the stream.
    const trackStop = vi.fn()
    const lateStream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream
    await act(async () => {
      grant(lateStream)
    })

    expect(trackStop).toHaveBeenCalled()
  })
})
