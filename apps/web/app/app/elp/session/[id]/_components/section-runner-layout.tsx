'use client'

import { ZoomableImage } from '../../../../_components/zoomable-image'
import { AudioPromptPlayer } from '../../../_components/audio-prompt-player'
import type { AudioRecorderStatus } from '../../../_hooks/use-audio-recorder'
import { RecorderControls } from './recorder-controls'
import { SectionSubmitButton } from './section-submit-button'

type Props = Readonly<{
  label: string
  modeLabel: string
  sectionPosition: string | null
  audioSrc?: string
  imageSrc?: string
  promptText: string
  recorder: Readonly<{
    status: AudioRecorderStatus
    audioUrl: string | null
    error: string | null
    onStart: () => void
    onStop: () => void
    onReset: () => void
  }>
  submit: Readonly<{
    submitting: boolean
    error: string | null
    onSubmit: () => void
    disabled: boolean
  }>
}>

/** Presentational layout for one oral-exam section: heading, optional section
 * position, optional audio prompt, prompt text, recorder controls, and the submit
 * button. All state and logic live in `OralSectionRunner`. */
export function SectionRunnerLayout({
  label,
  modeLabel,
  sectionPosition,
  audioSrc,
  imageSrc,
  promptText,
  recorder,
  submit,
}: Props) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {label} — {modeLabel}
      </h1>

      {sectionPosition && <p className="text-sm text-muted-foreground">{sectionPosition}</p>}

      {audioSrc && <AudioPromptPlayer src={audioSrc} label="Interview question" />}
      {/* Picture-description stimulus renders above its instruction so the prompt
          text ("Look at the picture…") references an image already on screen. */}
      {imageSrc && (
        <ZoomableImage src={imageSrc} alt={`${label} illustration`} className="max-h-80" />
      )}
      <p className="text-base">{promptText}</p>

      <RecorderControls
        status={recorder.status}
        audioUrl={recorder.audioUrl}
        error={recorder.error}
        onStart={recorder.onStart}
        onStop={recorder.onStop}
        onReset={recorder.onReset}
      />

      <SectionSubmitButton
        submitting={submit.submitting}
        error={submit.error}
        onSubmit={submit.onSubmit}
        disabled={submit.disabled}
      />
    </div>
  )
}
