'use client'

import { ModeToggle } from '@/app/app/quiz/_components/mode-toggle'
import { QuestionFilters } from '@/app/app/quiz/_components/question-filters'
import { useQuizConfig } from '@/app/app/quiz/_hooks/use-quiz-config'
import type { SubjectOption, TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { VfrRtExamPanel } from './vfr-rt-exam-panel'
import { VfrRtPracticeSections } from './vfr-rt-practice-sections'

type VfrRtConfigFormProps = {
  userId: string
  subjectId: string
  subjects: SubjectOption[]
  initialTopics: TopicWithSubtopics[]
  exam: { available: boolean; questionCount: number | null }
}

/**
 * Subject-locked, "Practice"-branded clone of QuizConfigForm's non-exam body.
 * Reuses the shared quiz config machinery (mode toggle, filters, topic tree,
 * count, start) via a server-built single-subject SubjectOption (see
 * VfrRtSetup) whose `id` MUST equal the real RT subject uuid — the session
 * handoff derives subjectName/subjectCode from `subjects.find(s => s.id ===
 * subjectId)` inside useQuizStart. `initialTopics` seeds the topic tree from
 * the RSC fetch — no client mount-time load.
 * Discovery is present-but-disabled. Practice Exam is enabled when the org has an
 * enabled RT exam_config; its body is VfrRtExamPanel instead of the practice filters.
 */
export function VfrRtConfigForm({
  userId,
  subjectId,
  subjects,
  initialTopics,
  exam,
}: Readonly<VfrRtConfigFormProps>) {
  const config = useQuizConfig({
    userId,
    subjects,
    initialSubjectId: subjectId,
    initialMode: 'study',
    initialTopics,
  })
  const isExam = config.mode === 'exam'

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <ModeToggle
          value={config.mode}
          onValueChange={config.setMode}
          examAvailable={exam.available}
          discoveryAvailable={false}
        />
        {!isExam && (
          <QuestionFilters
            value={config.filters}
            onValueChange={config.setFilters}
            calcMode={config.calcMode}
            onCalcModeChange={config.setCalcMode}
            imageMode={config.imageMode}
            onImageModeChange={config.setImageMode}
            unseenLabel="Unanswered"
            showCalcImageToggles={false}
          />
        )}
      </div>

      {isExam && (
        <VfrRtExamPanel
          userId={userId}
          subjectId={subjectId}
          subjects={subjects}
          questionCount={exam.questionCount}
        />
      )}
      {!isExam && <VfrRtPracticeSections config={config} />}
    </div>
  )
}
