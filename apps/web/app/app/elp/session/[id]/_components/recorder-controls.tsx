'use client'

import type { AudioRecorderStatus } from '../../../_hooks/use-audio-recorder'

type Props = Readonly<{
  status: AudioRecorderStatus
  audioUrl: string | null
  error: string | null
  onStart: () => void
  onStop: () => void
  onReset: () => void
}>

const BUTTON_CLASS = 'rounded-md border border-border px-4 py-2 text-sm font-medium'

/** Renders the record/stop/playback controls for the current recorder status.
 * Presentational only — all recorder state lives in `useAudioRecorder`. */
export function RecorderControls({ status, audioUrl, error, onStart, onStop, onReset }: Props) {
  if (status === 'denied' || status === 'unsupported') {
    return (
      <p role="alert" className="text-sm text-destructive">
        {status === 'denied'
          ? (error ?? 'Microphone access was denied.')
          : 'Audio recording is not supported in this browser.'}
      </p>
    )
  }

  if (status === 'recording') {
    return (
      <button type="button" onClick={onStop} className={BUTTON_CLASS}>
        Stop Recording
      </button>
    )
  }

  if (status === 'recorded') {
    return (
      <div className="space-y-2">
        {/* biome-ignore lint/a11y/useMediaCaption: recorded spoken answer, no caption track available */}
        <audio controls src={audioUrl ?? undefined} className="w-full" />
        <button type="button" onClick={onReset} className={BUTTON_CLASS}>
          Re-record
        </button>
      </div>
    )
  }

  return (
    <button type="button" onClick={onStart} className={BUTTON_CLASS}>
      Record Your Answer
    </button>
  )
}
