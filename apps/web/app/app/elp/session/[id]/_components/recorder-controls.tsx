'use client'

import type { AudioRecorderStatus } from '../../../_hooks/use-audio-recorder'
import { PlaybackControls } from './playback-controls'

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
    return <PlaybackControls audioUrl={audioUrl} onReset={onReset} />
  }

  return (
    <button type="button" onClick={onStart} className={BUTTON_CLASS}>
      Record Your Answer
    </button>
  )
}
