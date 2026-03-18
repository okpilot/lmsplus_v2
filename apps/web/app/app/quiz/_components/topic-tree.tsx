'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { TopicRow } from './topic-row'

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
}: TopicTreeProps) {
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
      <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
        {topics.map((topic) => {
          const isExpanded = expanded.has(topic.id)
          const isChecked = checkedTopics.has(topic.id)
          return (
            <div key={topic.id} className="border-b border-border last:border-b-0">
              <TopicRow
                code={topic.code}
                name={topic.name}
                count={topic.questionCount}
                checked={isChecked}
                onCheckedChange={() => onToggleTopic(topic.id)}
                isExpanded={isExpanded}
                onToggleExpand={
                  topic.subtopics.length > 0 ? () => toggleExpand(topic.id) : undefined
                }
              />
              {isExpanded &&
                topic.subtopics.map((sub) => (
                  <TopicRow
                    key={sub.id}
                    code={sub.code}
                    name={sub.name}
                    count={sub.questionCount}
                    checked={checkedSubtopics.has(sub.id)}
                    onCheckedChange={() => onToggleSubtopic(sub.id, topic.id)}
                    indented
                  />
                ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
