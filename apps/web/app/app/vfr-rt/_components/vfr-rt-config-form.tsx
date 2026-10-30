'use client'

import { ModeToggle } from '@/app/app/quiz/_components/mode-toggle'
import { QuestionFilters } from '@/app/app/quiz/_components/question-filters'
import { StartButton } from '@/app/app/quiz/_components/start-button'
import { TopicTree } from '@/app/app/quiz/_components/topic-tree'
import { useQuizConfig } from '@/app/app/quiz/_hooks/use-quiz-config'
import { Card, CardContent } from '@/components/ui/card'
import type { SubjectOption, TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { VfrRtExamPanel } from './vfr-rt-exam-panel'
import { VfrRtPracticeSections } from './vfr-rt-practice-sections'

type VfrRtConfigFormProps = {
  subjectId: string
  subjects: SubjectOption[]
  initialTopics: TopicWithSubtopics[]
  exam: { available: boolean; questionCount: number | null }
}

type Config = ReturnType<typeof useQuizConfig>

function SettingsCard({
  config,
  isExam,
  examAvailable,
}: Readonly<{ config: Config; isExam: boolean; examAvailable: boolean }>) {
  return (
    <Card>
      <CardContent className="space-y-5">
        <ModeToggle
          value={config.mode}
          onValueChange={config.setMode}
          examAvailable={examAvailable}
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
      </CardContent>
    </Card>
  )
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
  subjectId,
  subjects,
  initialTopics,
  exam,
}: Readonly<VfrRtConfigFormProps>) {
  const config = useQuizConfig({
    subjects,
    initialSubjectId: subjectId,
    initialMode: 'study',
    initialTopics,
  })
  const isExam = config.mode === 'exam'

  return (
    <div className="flex flex-col gap-stack lg:grid lg:grid-cols-(--layout-setup) lg:grid-rows-(--layout-setup-rows) lg:items-start lg:gap-x-section">
      <div className="lg:col-start-1 lg:row-start-1">
        <SettingsCard config={config} isExam={isExam} examAvailable={exam.available} />
      </div>

      {!isExam && config.topicTree.topics.length > 0 && (
        <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <TopicTree
            topics={config.topicTree.topics}
            checkedTopics={config.topicTree.checkedTopics}
            checkedSubtopics={config.topicTree.checkedSubtopics}
            onToggleTopic={config.topicTree.toggleTopic}
            onToggleSubtopic={config.topicTree.toggleSubtopic}
            onSelectAll={config.topicTree.selectAll}
            totalQuestions={config.topicTree.totalQuestions}
            allSelected={config.topicTree.allSelected}
            filteredByTopic={config.filteredByTopic}
            filteredBySubtopic={config.filteredBySubtopic}
            showCode={false}
          />
        </div>
      )}

      <div className="space-y-stack lg:col-start-1 lg:row-start-2 lg:sticky lg:top-section">
        {isExam && (
          <VfrRtExamPanel
            subjectId={subjectId}
            subjects={subjects}
            questionCount={exam.questionCount}
          />
        )}
        {!isExam && <VfrRtPracticeSections config={config} />}
        {!isExam && (
          <StartButton
            disabled={
              config.availableCount === 0 || config.loading || config.isPending || config.authError
            }
            loading={config.loading}
            label="Start Practice"
            onClick={config.handleStart}
          />
        )}
      </div>
    </div>
  )
}
