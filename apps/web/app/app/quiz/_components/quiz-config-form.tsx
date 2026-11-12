'use client'

import { useState } from 'react'
import type { ExamSubjectOption } from '@/lib/queries/exam-subjects'
import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import { useExamStart } from '../_hooks/use-exam-start'
import { useQuizConfig } from '../_hooks/use-quiz-config'
import type { PreloadPromise } from '../types'
import { DiscoveryModePanel } from './discovery-mode-panel'
import { QuizSetupCard } from './quiz-setup-card'
import { QuizStartActions } from './quiz-start-actions'
import { TopicTree } from './topic-tree'

type QuizConfigFormProps = {
  userId: string
  subjects: SubjectOption[]
  examSubjects: ExamSubjectOption[]
  preload?: PreloadPromise
  subjectsFailed?: boolean
}

function TopicTreeColumn({
  config,
  subjectsFailed,
}: Readonly<{ config: ReturnType<typeof useQuizConfig>; subjectsFailed?: boolean }>) {
  if (subjectsFailed || config.mode === 'exam' || config.topicTree.topics.length === 0) return null
  return (
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
  )
}

export function QuizConfigForm(props: Readonly<QuizConfigFormProps>) {
  const { userId, subjects, examSubjects, preload, subjectsFailed } = props
  const config = useQuizConfig({ subjects, preload })
  const [examSubjectId, setExamSubjectId] = useState('')
  const exam = useExamStart({ subjectId: examSubjectId, examSubjects })

  if (config.mode === 'discovery' && !subjectsFailed)
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
        <QuizSetupCard
          config={config}
          subjects={subjects}
          examSubjects={examSubjects}
          examSubjectId={examSubjectId}
          onExamSubjectChange={setExamSubjectId}
          subjectsFailed={subjectsFailed}
        />
      </div>
      <TopicTreeColumn config={config} subjectsFailed={subjectsFailed} />
      <QuizStartActions
        config={config}
        exam={exam}
        examSubjectId={examSubjectId}
        subjectsFailed={subjectsFailed}
      />
    </div>
  )
}
