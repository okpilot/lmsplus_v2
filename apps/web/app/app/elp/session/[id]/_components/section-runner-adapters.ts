import type { UseAudioRecorderResult } from '../../../_hooks/use-audio-recorder'

/** Maps the recorder hook's state + controls onto SectionRunnerLayout's `recorder` prop. */
export function toRecorderProps(recorder: UseAudioRecorderResult) {
  return {
    status: recorder.status,
    audioUrl: recorder.audioUrl,
    error: recorder.error,
    onStart: recorder.start,
    onStop: recorder.stop,
    onReset: recorder.reset,
  }
}

/** Builds SectionRunnerLayout's `submit` prop: wires the recorded file into the
 * submit workflow and derives the disabled state. */
export function toSubmitProps(opts: {
  recorder: UseAudioRecorderResult
  submit: (file: File, durationMs: number) => void
  submitting: boolean
  error: string | null
}) {
  return {
    submitting: opts.submitting,
    error: opts.error,
    onSubmit: () => {
      if (!opts.recorder.file) return
      opts.submit(opts.recorder.file, opts.recorder.durationMs)
    },
    disabled: !opts.recorder.file || opts.submitting,
  }
}
