import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAnswerFile,
  buildCaptureHandlers,
  isRecordingSupported,
  pickAudioMimeType,
  type RecorderRefs,
  releaseMediaStream,
  revokeObjectUrl,
  startRecorderSession,
  teardownCapture,
} from './audio-recorder-core'

beforeEach(() => {
  vi.resetAllMocks()
})

// Restore stubbed globals even if a test throws before its own cleanup line.
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isRecordingSupported', () => {
  it('reports supported when getUserMedia and MediaRecorder are both available', () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } })
    vi.stubGlobal('MediaRecorder', class {})
    expect(isRecordingSupported()).toBe(true)
  })

  it('reports unsupported when getUserMedia is missing', () => {
    vi.stubGlobal('navigator', { mediaDevices: {} })
    vi.stubGlobal('MediaRecorder', class {})
    expect(isRecordingSupported()).toBe(false)
  })

  it('reports unsupported when MediaRecorder is missing', () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } })
    vi.stubGlobal('MediaRecorder', undefined)
    expect(isRecordingSupported()).toBe(false)
  })
})

describe('pickAudioMimeType', () => {
  it('returns the first supported type from the preference list', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (type: string) => type === 'audio/webm',
    })
    expect(pickAudioMimeType()).toBe('audio/webm')
  })

  it('returns undefined when isTypeSupported is not a function', () => {
    vi.stubGlobal('MediaRecorder', {})
    expect(pickAudioMimeType()).toBeUndefined()
  })
})

describe('buildAnswerFile', () => {
  it('preserves a recorded mp4 container as answer.m4a / audio/mp4 (Safari recordings)', () => {
    const file = buildAnswerFile([new Blob(['x'])], 'audio/mp4')
    expect(file.name).toBe('answer.m4a')
    expect(file.type).toBe('audio/mp4')
  })

  it('strips codec params from a webm recording to answer.webm / audio/webm', () => {
    const file = buildAnswerFile([new Blob(['x'])], 'audio/webm;codecs=opus')
    expect(file.name).toBe('answer.webm')
    expect(file.type).toBe('audio/webm')
  })

  it('falls back to answer.webm / audio/webm for an unrecognized container', () => {
    const file = buildAnswerFile([new Blob(['x'])], 'audio/3gpp')
    expect(file.name).toBe('answer.webm')
    expect(file.type).toBe('audio/webm')
  })
})

describe('releaseMediaStream', () => {
  it('stops every track on the held stream and clears the ref', () => {
    const stopA = vi.fn()
    const stopB = vi.fn()
    const streamRef = {
      current: { getTracks: () => [{ stop: stopA }, { stop: stopB }] } as unknown as MediaStream,
    }
    releaseMediaStream(streamRef)
    expect(stopA).toHaveBeenCalledTimes(1)
    expect(stopB).toHaveBeenCalledTimes(1)
    expect(streamRef.current).toBeNull()
  })

  it('is a no-op when no stream is held', () => {
    const streamRef = { current: null }
    expect(() => releaseMediaStream(streamRef)).not.toThrow()
    expect(streamRef.current).toBeNull()
  })
})

describe('revokeObjectUrl', () => {
  it('revokes the held URL and clears the ref', () => {
    vi.stubGlobal('URL', { revokeObjectURL: vi.fn(), createObjectURL: vi.fn() })
    const urlRef = { current: 'blob:mock-url' }
    revokeObjectUrl(urlRef)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    expect(urlRef.current).toBeNull()
  })

  it('does not call revokeObjectURL when no URL is held', () => {
    vi.stubGlobal('URL', { revokeObjectURL: vi.fn(), createObjectURL: vi.fn() })
    const urlRef = { current: null }
    revokeObjectUrl(urlRef)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })
})

describe('teardownCapture', () => {
  it('nulls onstop before stopping an active recorder so the in-flight File is dropped', () => {
    // The invariant: onstop must be null AT THE MOMENT stop() fires. If stop() is
    // called before onstop is nulled, the pending File lands after reset() and the
    // hook's setState(INITIAL) call would mask it — but the mic stays live and the
    // state briefly becomes 'recorded' (a race). The ordering below prevents this.
    let onstopAtStopTime: (() => void) | null | undefined
    const recObj: { state: string; onstop: (() => void) | null; stop: ReturnType<typeof vi.fn> } = {
      state: 'recording',
      onstop: vi.fn(),
      stop: vi.fn(() => {
        onstopAtStopTime = recObj.onstop
      }),
    }
    const recorderRef = { current: recObj as unknown as MediaRecorder }
    const streamRef = { current: null as MediaStream | null }
    const urlRef = { current: null as string | null }

    teardownCapture(recorderRef, streamRef, urlRef)

    expect(recObj.stop).toHaveBeenCalledOnce()
    expect(onstopAtStopTime).toBeNull() // onstop nulled BEFORE stop() fired
    expect(recorderRef.current).toBeNull()
  })

  it('skips stop when the recorder is already inactive', () => {
    const recObj = {
      state: 'inactive',
      onstop: vi.fn() as (() => void) | null,
      stop: vi.fn(),
    }
    const recorderRef = { current: recObj as unknown as MediaRecorder }
    const streamRef = { current: null as MediaStream | null }
    const urlRef = { current: null as string | null }

    teardownCapture(recorderRef, streamRef, urlRef)

    expect(recObj.stop).not.toHaveBeenCalled()
    // onstop is nulled even on the already-inactive path — a pending async 'stop'
    // event must not deliver a File after teardown.
    expect(recObj.onstop).toBeNull()
    expect(recorderRef.current).toBeNull()
  })

  it('releases the stream and revokes the URL even when no recorder is held', () => {
    vi.stubGlobal('URL', { revokeObjectURL: vi.fn(), createObjectURL: vi.fn() })
    const stopTrack = vi.fn()
    const recorderRef = { current: null as MediaRecorder | null }
    const streamRef = {
      current: { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream,
    }
    const urlRef = { current: 'blob:some-url' as string | null }

    teardownCapture(recorderRef, streamRef, urlRef)

    expect(stopTrack).toHaveBeenCalledOnce()
    expect(streamRef.current).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:some-url')
    expect(urlRef.current).toBeNull()
  })
})

describe('startRecorderSession', () => {
  it('falls back to audio/webm when no MIME type is supported by the environment', () => {
    // When pickAudioMimeType() returns undefined (all types unsupported), the
    // buildAnswerFile call must use the 'audio/webm' fallback via `mimeType ?? 'audio/webm'`.
    class NoMimeRecorder {
      ondataavailable: ((e: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      static isTypeSupported = (_type: string) => false
      start() {}
      stop() {
        // fire chunk then onstop synchronously, mirroring FakeMediaRecorder
        this.ondataavailable?.({ data: new Blob(['chunk'], { type: 'audio/ogg' }) })
        this.onstop?.()
      }
    }
    vi.stubGlobal('MediaRecorder', NoMimeRecorder)

    const onStop = vi.fn()
    const stream = { getTracks: () => [] } as unknown as MediaStream
    const recorder = startRecorderSession(stream, onStop)

    recorder.stop()

    expect(onStop).toHaveBeenCalledOnce()
    // cast-guarded per code-style §5: narrowing before treating as typed shape
    const firstCall = onStop.mock.calls[0]
    if (!firstCall) throw new Error('onStop was not called')
    const file = firstCall[0] as File
    expect(file.name).toBe('answer.webm')
    expect(file.type).toBe('audio/webm')
  })

  it('sources the container from the recorder actual mimeType, not the requested pick (Safari default-mp4 path)', () => {
    // Mirrors old Safari: pickAudioMimeType() returns undefined (no isTypeSupported),
    // so MediaRecorder is constructed with no mimeType option and falls back to the
    // browser default — which recorder.mimeType reports as 'audio/mp4' post-start.
    class SafariDefaultRecorder {
      ondataavailable: ((e: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      mimeType = 'audio/mp4'
      static isTypeSupported = (_type: string) => false
      start() {}
      stop() {
        this.ondataavailable?.({ data: new Blob(['chunk'], { type: 'audio/mp4' }) })
        this.onstop?.()
      }
    }
    vi.stubGlobal('MediaRecorder', SafariDefaultRecorder)

    const onStop = vi.fn()
    const stream = { getTracks: () => [] } as unknown as MediaStream
    const recorder = startRecorderSession(stream, onStop)

    recorder.stop()

    expect(onStop).toHaveBeenCalledOnce()
    const firstCall = onStop.mock.calls[0]
    if (!firstCall) throw new Error('onStop was not called')
    const file = firstCall[0] as File
    expect(file.name).toBe('answer.m4a')
    expect(file.type).toBe('audio/mp4')
  })
})

describe('buildCaptureHandlers — onDenied', () => {
  function buildRefs(startingCurrent: boolean): RecorderRefs {
    return {
      recorderRef: { current: null },
      streamRef: { current: null },
      startedAtRef: { current: 0 },
      urlRef: { current: null },
      startingRef: { current: startingCurrent },
    }
  }

  it('sets status to denied when the capture was not cancelled', () => {
    const refs = buildRefs(true)
    const setState = vi.fn()
    const handlers = buildCaptureHandlers(refs, setState)

    handlers.onDenied()

    expect(setState).toHaveBeenCalledTimes(1)
    const updater = setState.mock.calls[0]?.[0] as (s: {
      status: string
      error: string | null
    }) => { status: string; error: string | null }
    const next = updater({ status: 'idle', error: null })
    expect(next.status).toBe('denied')
    expect(next.error).toBe('Microphone access was denied.')
  })

  it('does not touch state when reset()/unmount already cancelled the pending capture', () => {
    const refs = buildRefs(false)
    const setState = vi.fn()
    const handlers = buildCaptureHandlers(refs, setState)

    handlers.onDenied()

    expect(setState).not.toHaveBeenCalled()
  })
})
