'use client'

import { Loader2 } from 'lucide-react'
import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import { useStudyConfig } from '../_hooks/use-study-config'
import { useStudyStart } from '../_hooks/use-study-start'
import { StudyRunner } from '../study/_components/study-runner'
import { QuestionCount } from './question-count'
import { QuestionFilters } from './question-filters'
import { SubjectSelect } from './subject-select'
import { TopicTree } from './topic-tree'

export function StudyConfigForm({ subjects }: { subjects: SubjectOption[] }) {
  const config = useStudyConfig()
  const study = useStudyStart()

  function handleStart() {
    const topicIds = config.topicTree.getSelectedTopicIds()
    const subtopicIds = config.topicTree.getSelectedSubtopicIds()
    study.start({
      subjectId: config.subjectId,
      topicIds: topicIds.length > 0 ? topicIds : undefined,
      subtopicIds: subtopicIds.length > 0 ? subtopicIds : undefined,
      count: Math.min(config.count, config.availableCount || 1),
      filters: config.filters,
      calcMode: config.calcMode,
      imageMode: config.imageMode,
    })
  }

  if (study.questions) {
    return <StudyRunner questions={study.questions} onExit={study.reset} />
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
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

      {study.error && (
        <p role="alert" className="text-sm text-destructive">
          {study.error}
        </p>
      )}
      {config.authError && (
        <p role="alert" className="text-sm text-destructive">
          Session expired. Please refresh the page.
        </p>
      )}

      <button
        type="button"
        disabled={
          !config.subjectId ||
          config.availableCount === 0 ||
          study.loading ||
          config.isPending ||
          config.authError
        }
        onClick={handleStart}
        aria-busy={study.loading || undefined}
        className="w-full rounded-[10px] bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <span className="inline-flex items-center justify-center gap-2">
          {study.loading && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          {study.loading ? 'Loading...' : 'Start studying'}
        </span>
      </button>
    </div>
  )
}
