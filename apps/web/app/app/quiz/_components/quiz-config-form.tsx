'use client'

import type { SubjectOption } from '@/lib/queries/quiz'
import { useQuizConfig } from '../_hooks/use-quiz-config'
import { ModeToggle } from './mode-toggle'
import { QuestionCount } from './question-count'
import { QuestionFilters } from './question-filters'
import { SubjectSelect } from './subject-select'
import { TopicTree } from './topic-tree'

type QuizConfigFormProps = {
  subjects: SubjectOption[]
}

export function QuizConfigForm({ subjects }: QuizConfigFormProps) {
  const config = useQuizConfig({ subjects })

  return (
    <div className="space-y-4">
      {/* Card 1: Quiz Configuration */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <SubjectSelect
          subjects={subjects}
          value={config.subjectId}
          onValueChange={config.handleSubjectChange}
        />
        <ModeToggle value={config.mode} onValueChange={config.setMode} />
        {config.subjectId && (
          <QuestionFilters value={config.filters} onValueChange={config.setFilters} />
        )}
      </div>

      {/* Card 2: Topics — only show when topics loaded */}
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

      {/* Card 3: Number of Questions — only show when subject selected */}
      {config.subjectId && (
        <div className="rounded-xl border border-border bg-card p-6">
          <QuestionCount
            value={config.count}
            max={config.availableCount}
            onValueChange={config.setCount}
          />
        </div>
      )}

      {/* Error */}
      {config.error && <p className="text-sm text-destructive">{config.error}</p>}

      {/* Start Quiz Button */}
      <button
        type="button"
        disabled={
          !config.subjectId || config.availableCount === 0 || config.loading || config.isPending
        }
        onClick={config.handleStart}
        className="w-full rounded-[10px] bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {config.loading ? 'Starting...' : 'Start Quiz'}
      </button>
    </div>
  )
}
