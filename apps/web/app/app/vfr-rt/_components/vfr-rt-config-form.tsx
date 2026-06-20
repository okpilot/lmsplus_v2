'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { QuestionCount } from '@/app/app/quiz/_components/question-count'
import { TopicTree } from '@/app/app/quiz/_components/topic-tree'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { useVfrRtParts } from '../_hooks/use-vfr-rt-parts'
import { useVfrRtStart } from '../_hooks/use-vfr-rt-start'

type VfrRtConfigFormProps = {
  userId: string
  subjectId: string
  parts: TopicWithSubtopics[]
}

export function VfrRtConfigForm({ userId, subjectId, parts }: VfrRtConfigFormProps) {
  const [count, setCount] = useState(10)
  const partsState = useVfrRtParts(parts)

  const { loading, error, handleStart } = useVfrRtStart({
    userId,
    subjectId,
    topicIds: partsState.selectedTopicIds,
    count,
    maxQuestions: partsState.totalQuestions,
  })

  const canStart =
    partsState.selectedTopicIds.length > 0 && partsState.totalQuestions > 0 && !loading

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div>
          <p className="text-[13px] font-medium">Subject</p>
          <p className="mt-1 text-sm text-muted-foreground">VFR Radiotelephony (RT)</p>
        </div>
      </div>

      {parts.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <TopicTree
            topics={parts}
            checkedTopics={partsState.checkedTopics}
            checkedSubtopics={partsState.checkedSubtopics}
            onToggleTopic={partsState.toggleTopic}
            onToggleSubtopic={partsState.toggleSubtopic}
            onSelectAll={partsState.selectAll}
            totalQuestions={parts.reduce((s, p) => s + p.questionCount, 0)}
            allSelected={partsState.allSelected}
            filteredByTopic={null}
            filteredBySubtopic={null}
          />
        </div>
      )}

      {partsState.selectedTopicIds.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <QuestionCount value={count} max={partsState.totalQuestions} onValueChange={setCount} />
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!canStart}
        onClick={handleStart}
        aria-busy={loading || undefined}
        className="w-full rounded-[10px] bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <span className="inline-flex items-center justify-center gap-2">
          {loading && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          {loading ? 'Starting...' : 'Start Practice'}
        </span>
      </button>
    </div>
  )
}
