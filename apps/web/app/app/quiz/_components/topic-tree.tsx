'use client'

import { useId, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { TopicList } from './topic-list'

type TopicTreeProps = {
  topics: TopicWithSubtopics[]
  checkedTopics: Set<string>
  checkedSubtopics: Set<string>
  onToggleTopic: (topicId: string) => void
  onToggleSubtopic: (subtopicId: string, topicId: string) => void
  onSelectAll: () => void
  totalQuestions: number
  allSelected: boolean
  filteredByTopic: Record<string, number> | null
  filteredBySubtopic: Record<string, number> | null
  showCode?: boolean
}

export function TopicTree({
  topics,
  checkedTopics,
  checkedSubtopics,
  onToggleTopic,
  onToggleSubtopic,
  onSelectAll,
  totalQuestions,
  allSelected,
  filteredByTopic,
  filteredBySubtopic,
  showCode = true,
}: Readonly<TopicTreeProps>) {
  const labelId = useId()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleExpand(topicId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(topicId)) next.delete(topicId)
      else next.add(topicId)
      return next
    })
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a <fieldset> brings default border/legend layout (choice-pills precedent)
    <div role="group" aria-labelledby={labelId} className="space-y-2">
      <div className="flex items-center justify-between">
        <span id={labelId} className="text-label text-muted-foreground">
          Topics
        </span>
        <div className="flex items-center gap-3">
          <span className="text-caption text-muted-foreground">
            {totalQuestions} questions available
          </span>
          <Label className="gap-1.5 text-caption-strong text-foreground">
            <Checkbox checked={allSelected} onCheckedChange={onSelectAll} />
            Select all
          </Label>
        </div>
      </div>
      <TopicList
        topics={topics}
        checkedTopics={checkedTopics}
        checkedSubtopics={checkedSubtopics}
        expanded={expanded}
        toggleExpand={toggleExpand}
        onToggleTopic={onToggleTopic}
        onToggleSubtopic={onToggleSubtopic}
        filteredByTopic={filteredByTopic}
        filteredBySubtopic={filteredBySubtopic}
        showCode={showCode}
      />
    </div>
  )
}
