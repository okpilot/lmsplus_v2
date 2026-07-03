'use client'

import type { CurrentSection } from '@/lib/elp/section-progress'
import type { OralSessionDetail } from '@/lib/queries/oral-exam-session'
import { useAudioRecorder } from '../../../_hooks/use-audio-recorder'
import type { SectionPrompt } from '../../../prompts'
import { useSectionSubmit } from '../_hooks/use-section-submit'
import { toRecorderProps, toSubmitProps } from './section-runner-adapters'
import { SectionRunnerLayout } from './section-runner-layout'

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
