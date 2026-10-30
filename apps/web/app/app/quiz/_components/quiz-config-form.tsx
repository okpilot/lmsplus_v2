'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'
import type { ExamSubjectOption } from '@/lib/queries/exam-subjects'
import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import { useExamStart } from '../_hooks/use-exam-start'
import { useQuizConfig } from '../_hooks/use-quiz-config'
import type { PreloadPromise } from '../types'
import { BlockedStartAlert } from './blocked-start-alert'
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
  preload?: PreloadPromise
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: pre-existing; split when next edited (#1606)
export function QuizConfigForm(props: Readonly<QuizConfigFormProps>) {
  const { userId, subjects, examSubjects, preload } = props
  const config = useQuizConfig({ subjects, preload })
  const isExam = config.mode === 'exam'

  const [examSubjectId, setExamSubjectId] = useState('')
  const exam = useExamStart({ subjectId: examSubjectId, examSubjects })

  if (config.mode === 'discovery')
    return (
      <DiscoveryModePanel
        mode={config.mode}
        onModeChange={config.setMode}
        examAvailable={examSubjects.length > 0}
        subjects={subjects}
        userId={userId}
        preload={preload}
      />
    )

  return (
    <div className="flex flex-col gap-stack lg:grid lg:grid-cols-(--layout-setup) lg:grid-rows-(--layout-setup-rows) lg:items-start lg:gap-x-section">
      <div className="lg:col-start-1 lg:row-start-1">
        <Card>
          <CardContent className="space-y-5">
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
          </CardContent>
        </Card>
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
          />
        </div>
      )}

      <div className="space-y-stack lg:col-start-1 lg:row-start-2 lg:sticky lg:top-section">
        {!isExam && config.subjectId && (
          <Card>
            <CardContent>
              <QuestionCount
                value={config.count}
                max={config.availableCount}
                onValueChange={config.setCount}
              />
            </CardContent>
          </Card>
        )}

        {/* Start failures and the blocked-start offer — both modes */}
        <BlockedStartAlert
          message={isExam ? exam.error : config.error}
          blocked={isExam ? exam.blocked : config.blocked}
          startLabel={isExam ? 'exam' : 'quiz'}
        />
        {!isExam && config.authError && (
          <FieldError role="alert">Session expired. Please refresh the page.</FieldError>
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
    </div>
  )
}
