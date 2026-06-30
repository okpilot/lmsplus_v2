'use client'

import { useState } from 'react'
import type { ExamSubjectOption } from '@/lib/queries/exam-subjects'
import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import { useExamStart } from '../_hooks/use-exam-start'
import { useQuizConfig } from '../_hooks/use-quiz-config'
import { DiscoveryModePanel } from './discovery-mode-panel'
import { ExamConfigForm } from './exam-config-form'
import { ModeToggle } from './mode-toggle'
import { QuestionCount } from './question-count'
import { QuestionFilters } from './question-filters'
import { StartButton } from './start-button'
import { SubjectSelect } from './subject-select'
import { TopicTree } from './topic-tree'

type QuizConfigFormProps = {
  userId: string
  subjects: SubjectOption[]
  examSubjects: ExamSubjectOption[]
}

export function QuizConfigForm({ userId, subjects, examSubjects }: QuizConfigFormProps) {
  const config = useQuizConfig({ userId, subjects })
  const isExam = config.mode === 'exam'

  const [examSubjectId, setExamSubjectId] = useState('')
  const exam = useExamStart({ userId, subjectId: examSubjectId, examSubjects })

  if (config.mode === 'discovery')
    return (
      <DiscoveryModePanel
        mode={config.mode}
        onModeChange={config.setMode}
        examAvailable={examSubjects.length > 0}
        subjects={subjects}
        userId={userId}
      />
    )

  return (
    <div className="space-y-4">
      {/* Card 1: Quiz Configuration */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <ModeToggle
          value={config.mode}
          onValueChange={config.setMode}
          examAvailable={examSubjects.length > 0}
        />
        {isExam ? (
          <ExamConfigForm
            examSubjects={examSubjects}
            subjectId={examSubjectId}
            onSubjectChange={setExamSubjectId}
          />
        ) : (
          <>
            <SubjectSelect
              subjects={subjects}
              value={config.subjectId}
              onValueChange={config.handleSubjectChange}
            />
            {config.subjectId && (
              <QuestionFilters
                value={config.filters}
                onValueChange={config.setFilters}
                calcMode={config.calcMode}
                onCalcModeChange={config.setCalcMode}
                imageMode={config.imageMode}
                onImageModeChange={config.setImageMode}
                unseenLabel="Unanswered"
              />
            )}
          </>
        )}
      </div>

      {/* Study mode: Topics + Count */}
      {!isExam && (
        <>
          {config.topicTree.topics.length > 0 && (
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
              />
            </div>
          )}

          {config.subjectId && (
            <div className="rounded-xl border border-border bg-card p-6">
              <QuestionCount
                value={config.count}
                max={config.availableCount}
                onValueChange={config.setCount}
              />
            </div>
          )}
        </>
      )}

      {/* Error messages — both modes */}
      {isExam && exam.error && (
        <p role="alert" className="text-sm text-destructive">
          {exam.error}
        </p>
      )}
      {!isExam && config.error && (
        <p role="alert" className="text-sm text-destructive">
          {config.error}
        </p>
      )}
      {!isExam && config.authError && (
        <p role="alert" className="text-sm text-destructive">
          Session expired. Please refresh the page.
        </p>
      )}

      {isExam ? (
        <StartButton
          disabled={!examSubjectId || exam.loading}
          loading={exam.loading}
          label="Start Practice Exam"
          onClick={exam.handleStart}
        />
      ) : (
        <StartButton
          disabled={
            !config.subjectId ||
            config.availableCount === 0 ||
            config.loading ||
            config.isPending ||
            config.authError
          }
          loading={config.loading}
          label="Start Quiz"
          onClick={config.handleStart}
        />
      )}
    </div>
  )
}
