import { describe, expect, it, vi } from 'vitest'
import type { UseAudioRecorderResult } from '../../../_hooks/use-audio-recorder'
import { toRecorderProps, toSubmitProps } from './section-runner-adapters'

function makeRecorder(overrides: Partial<UseAudioRecorderResult> = {}): UseAudioRecorderResult {
  return {
    status: 'idle',
    file: null,
    audioUrl: null,
    durationMs: 0,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  }
}

function makeAudioFile(): File {
  return new File([new Uint8Array(10)], 'answer.webm', { type: 'audio/webm' })
}

describe('toRecorderProps', () => {
  it('maps recorder state and controls onto the layout recorder prop', () => {
    const start = vi.fn()
    const stop = vi.fn()
    const reset = vi.fn()
    const recorder = makeRecorder({
      status: 'recorded',
      audioUrl: 'blob:answer',
      error: 'boom',
      start,
      stop,
      reset,
    })

    const props = toRecorderProps(recorder)

    expect(props.status).toBe('recorded')
    expect(props.audioUrl).toBe('blob:answer')
    expect(props.error).toBe('boom')
    expect(props.onStart).toBe(start)
    expect(props.onStop).toBe(stop)
    expect(props.onReset).toBe(reset)
  })
})

describe('toSubmitProps', () => {
  it('passes through submitting and error, and derives disabled from file and submitting', () => {
    const props = toSubmitProps({
      recorder: makeRecorder({ file: makeAudioFile() }),
      submit: vi.fn(),
      submitting: false,
      error: 'nope',
    })

    expect(props.submitting).toBe(false)
    expect(props.error).toBe('nope')
    expect(props.disabled).toBe(false)
  })

  it('disables when there is no recorded file', () => {
    const props = toSubmitProps({
      recorder: makeRecorder({ file: null }),
      submit: vi.fn(),
      submitting: false,
      error: null,
    })

    expect(props.disabled).toBe(true)
  })

  it('disables while submitting even with a recorded file', () => {
    const props = toSubmitProps({
      recorder: makeRecorder({ file: makeAudioFile() }),
      submit: vi.fn(),
      submitting: true,
      error: null,
    })

    expect(props.disabled).toBe(true)
  })

  it('does not call submit when onSubmit fires without a recorded file', () => {
    const submit = vi.fn()
    const props = toSubmitProps({
      recorder: makeRecorder({ file: null }),
      submit,
      submitting: false,
      error: null,
    })

    props.onSubmit()

    expect(submit).not.toHaveBeenCalled()
  })

  it('calls submit with the recorded file and duration when onSubmit fires', () => {
    const submit = vi.fn()
    const file = makeAudioFile()
    const props = toSubmitProps({
      recorder: makeRecorder({ file, durationMs: 4200 }),
      submit,
      submitting: false,
      error: null,
    })

    props.onSubmit()

    expect(submit).toHaveBeenCalledWith(file, 4200)
  })
})
