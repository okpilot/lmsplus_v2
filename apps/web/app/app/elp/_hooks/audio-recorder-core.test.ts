import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAnswerFile,
  isRecordingSupported,
  pickAudioMimeType,
  releaseMediaStream,
  revokeObjectUrl,
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
  it('normalizes the built file to answer.webm / audio/webm regardless of source MIME type', () => {
    const file = buildAnswerFile([new Blob(['x'])], 'audio/mp4')
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
