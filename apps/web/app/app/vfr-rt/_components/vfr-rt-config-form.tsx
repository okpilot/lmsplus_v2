'use client'

import { ModeToggle } from '@/app/app/quiz/_components/mode-toggle'
import { QuestionCount } from '@/app/app/quiz/_components/question-count'
import { QuestionFilters } from '@/app/app/quiz/_components/question-filters'
import { StartButton } from '@/app/app/quiz/_components/start-button'
import { TopicTree } from '@/app/app/quiz/_components/topic-tree'
import { useQuizConfig } from '@/app/app/quiz/_hooks/use-quiz-config'
import type { SubjectOption, TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { QuestionTypeFilter } from './question-type-filter'

type VfrRtConfigFormProps = {
  userId: string
  subjectId: string
  subjects: SubjectOption[]
  initialTopics: TopicWithSubtopics[]
}

/**
 * Subject-locked, "Practice"-branded clone of QuizConfigForm's non-exam body.
 * Reuses the shared quiz config machinery (mode toggle, filters, topic tree,
 * count, start) via a server-built single-subject SubjectOption (see
 * VfrRtSetup) whose `id` MUST equal the real RT subject uuid — the session
 * handoff derives subjectName/subjectCode from `subjects.find(s => s.id ===
 * subjectId)` inside useQuizStart. `initialTopics` seeds the topic tree from
 * the RSC fetch — no client mount-time load.
 * Discovery and Practice Exam are present-but-disabled; Study is the only
 * available mode until Discovery's non-MC backend lands in a later slice.
 * QuestionTypeFilter (Slice 3) is RT-only — RT is the only multi-type subject,
 * so it is not part of the shared quiz config machinery's rendered UI.
 */
export function VfrRtConfigForm({
  userId,
  subjectId,
  subjects,
  initialTopics,
}: Readonly<VfrRtConfigFormProps>) {
  const config = useQuizConfig({
    userId,
    subjects,
    initialSubjectId: subjectId,
    initialMode: 'study',
    initialTopics,
  })
  const hasTopics = config.topicTree.topics.length > 0

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <ModeToggle
          value={config.mode}
          onValueChange={config.setMode}
          examAvailable={false}
          discoveryAvailable={false}
        />
        <QuestionFilters
          value={config.filters}
          onValueChange={config.setFilters}
          calcMode={config.calcMode}
          onCalcModeChange={config.setCalcMode}
          imageMode={config.imageMode}
          onImageModeChange={config.setImageMode}
          unseenLabel="Unanswered"
        />
        <QuestionTypeFilter value={config.questionType} onValueChange={config.setQuestionType} />
      </div>

      {hasTopics && (
        <>
          <div className="rounded-xl border border-border bg-card p-6">
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
          <div className="rounded-xl border border-border bg-card p-6">
            <QuestionCount
              value={config.count}
              max={config.availableCount}
              onValueChange={config.setCount}
            />
          </div>
        </>
      )}

      {config.error && (
        <p role="alert" className="text-sm text-destructive">
          {config.error}
        </p>
      )}
      {config.authError && (
        <p role="alert" className="text-sm text-destructive">
          Session expired. Please refresh the page.
        </p>
      )}

      <StartButton
        disabled={
          config.availableCount === 0 || config.loading || config.isPending || config.authError
        }
        loading={config.loading}
        label="Start Practice"
        onClick={config.handleStart}
      />
    </div>
  )
}
