'use client'

import type { CurrentSection } from '@/lib/elp/section-progress'
import type { OralSessionDetail } from '@/lib/queries/oral-exam-session'
import { AudioPromptPlayer } from '../../../_components/audio-prompt-player'
import { useAudioRecorder } from '../../../_hooks/use-audio-recorder'
import type { SectionPrompt } from '../../../prompts'
import { useSectionSubmit } from '../_hooks/use-section-submit'
import { RecorderControls } from './recorder-controls'
import { SectionSubmitButton } from './section-submit-button'

type Props = Readonly<{
  session: OralSessionDetail
  section: CurrentSection
  prompt: SectionPrompt
}>

/** Runner for one oral-exam section: play the prompt (when it has audio), record
 * an answer, and submit it. Submission and the post-submit navigation (report on
 * the last section, refresh-to-advance otherwise) are owned by `useSectionSubmit`;
 * this component only wires the recorded file into it. */
export function OralSectionRunner({ session, section, prompt }: Props) {
  const recorder = useAudioRecorder()
  const {
    submit,
    submitting,
    error: submitError,
  } = useSectionSubmit({
    sessionId: session.id,
    sectionNo: section.sectionNo,
    isLast: section.isLast,
  })

  const modeLabel = session.mode === 'mock' ? 'Mock Exam' : 'Practice'

  function handleSubmit() {
    if (!recorder.file) return
    submit(recorder.file, recorder.durationMs)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {prompt.label} — {modeLabel}
      </h1>

      {session.mode === 'mock' && (
        <p className="text-sm text-muted-foreground">
          Section {section.sectionNo} of {session.sections.length}
        </p>
      )}

      {prompt.audioSrc && <AudioPromptPlayer src={prompt.audioSrc} label="Interview question" />}
      <p className="text-base">{prompt.text}</p>

      <RecorderControls
        status={recorder.status}
        audioUrl={recorder.audioUrl}
        error={recorder.error}
        onStart={recorder.start}
        onStop={recorder.stop}
        onReset={recorder.reset}
      />

      <SectionSubmitButton
        submitting={submitting}
        error={submitError}
        onSubmit={handleSubmit}
        disabled={!recorder.file || submitting}
      />
    </div>
  )
}
