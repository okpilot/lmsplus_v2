'use client'

import type { OralSessionDetail } from '@/lib/queries/oral-exam-session'
import { AudioPromptPlayer } from '../../../_components/audio-prompt-player'
import { useAudioRecorder } from '../../../_hooks/use-audio-recorder'
import type { InterviewPrompt } from '../../../prompts'
import { useSectionSubmit } from '../_hooks/use-section-submit'
import { RecorderControls } from './recorder-controls'

// This slice practices §1 Interview only — the runner always submits section 1.
const SECTION_NO = 1

type Props = Readonly<{ session: OralSessionDetail; prompt: InterviewPrompt }>

/** Practice runner for the §1 Interview: play the prompt, record an answer, and
 * submit it. Submission (and the post-submit navigation to the report) is owned
 * by `useSectionSubmit`; this component only wires the recorded file into it. */
export function OralSectionRunner({ session, prompt }: Props) {
  const recorder = useAudioRecorder()
  const {
    submit,
    submitting,
    error: submitError,
  } = useSectionSubmit({ sessionId: session.id, sectionNo: SECTION_NO })

  function handleSubmit() {
    if (!recorder.file) return
    submit(recorder.file, recorder.durationMs)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">§1 Interview Practice</h1>

      <AudioPromptPlayer src={prompt.audioSrc} label="Interview question" />
      <p className="text-base">{prompt.text}</p>

      <RecorderControls
        status={recorder.status}
        audioUrl={recorder.audioUrl}
        error={recorder.error}
        onStart={recorder.start}
        onStop={recorder.stop}
        onReset={recorder.reset}
      />

      {submitError && (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!recorder.file || submitting}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit Answer'}
      </button>
    </div>
  )
}
