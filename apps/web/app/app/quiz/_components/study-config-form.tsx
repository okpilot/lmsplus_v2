'use client'

import type { ReactNode } from 'react'
import { FieldError } from '@/components/ui/field-error'
import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import { useStudyConfig } from '../_hooks/use-study-config'
import type { PreloadPromise } from '../types'
import { QuestionCount } from './question-count'
import { QuestionFilters } from './question-filters'
import { StartButton } from './start-button'
import { SubjectSelect } from './subject-select'
import { TopicTree } from './topic-tree'

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: pre-existing; split when next edited (#1606)
export function StudyConfigForm({
  userId,
  subjects,
  preload,
  unseenLabel,
  header,
}: Readonly<{
  userId: string
  subjects: SubjectOption[]
  preload?: PreloadPromise
  unseenLabel?: string
  /** Optional slot rendered at the top of Card 1 (e.g. the Discovery ModeToggle). */
  header?: ReactNode
}>) {
  const config = useStudyConfig({ userId, subjects, preload })

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        {header}
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
            unseenLabel={unseenLabel}
          />
        )}
      </div>

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

      <FieldError role="alert">{config.error}</FieldError>
      {config.authError && (
        <FieldError role="alert">Session expired. Please refresh the page.</FieldError>
      )}

      <StartButton
        disabled={
          !config.subjectId ||
          config.availableCount === 0 ||
          config.loading ||
          config.isPending ||
          config.authError
        }
        loading={config.loading}
        label="Start discovery"
        loadingLabel="Loading..."
        onClick={config.handleStart}
      />
    </div>
  )
}
