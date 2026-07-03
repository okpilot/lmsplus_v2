'use client'

type Props = Readonly<{
  audioUrl: string | null
  onReset: () => void
}>

const BUTTON_CLASS = 'rounded-md border border-border px-4 py-2 text-sm font-medium'

/** Renders the recorded-answer playback controls: an audio player plus a
 * Re-record button. Presentational only — all recorder state lives in
 * `useAudioRecorder`. */
export function PlaybackControls({ audioUrl, onReset }: Props) {
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
