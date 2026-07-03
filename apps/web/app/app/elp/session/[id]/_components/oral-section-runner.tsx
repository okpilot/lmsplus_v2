'use client'

import type { CurrentSection } from '@/lib/elp/section-progress'
import type { OralSessionDetail } from '@/lib/queries/oral-exam-session'
import { type UseAudioRecorderResult, useAudioRecorder } from '../../../_hooks/use-audio-recorder'
import type { SectionPrompt } from '../../../prompts'
import { useSectionSubmit } from '../_hooks/use-section-submit'
import { SectionRunnerLayout } from './section-runner-layout'

type Props = Readonly<{
  session: OralSessionDetail
  section: CurrentSection
  prompt: SectionPrompt
}>

/** Maps the recorder hook's state + controls onto SectionRunnerLayout's `recorder` prop. */
function toRecorderProps(recorder: UseAudioRecorderResult) {
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
function toSubmitProps(opts: {
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
  const sectionPosition =
    session.mode === 'mock' ? `Section ${section.sectionNo} of ${session.sections.length}` : null

  return (
    <SectionRunnerLayout
      label={prompt.label}
      modeLabel={modeLabel}
      sectionPosition={sectionPosition}
      audioSrc={prompt.audioSrc}
      promptText={prompt.text}
      recorder={toRecorderProps(recorder)}
      submit={toSubmitProps({ recorder, submit, submitting, error: submitError })}
    />
  )
}
