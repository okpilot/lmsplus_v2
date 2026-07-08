'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { TopicList } from './topic-list'

type SubtopicItem = { id: string; code: string; name: string; questionCount: number }
type TopicItem = {
  id: string
  code: string
  name: string
  questionCount: number
  subtopics: SubtopicItem[]
}
type TopicTreeProps = {
  topics: TopicItem[]
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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">Topics</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {totalQuestions} questions available
          </span>
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <Checkbox checked={allSelected} onCheckedChange={onSelectAll} />
            Select all
          </span>
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
