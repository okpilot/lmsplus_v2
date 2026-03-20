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
  filteredByTopic: Record<string, number> | null
  filteredBySubtopic: Record<string, number> | null
}

type SubtopicRowsProps = {
  subtopics: SubtopicItem[]
  topicId: string
  filteredBySubtopic: Record<string, number> | null
  checkedSubtopics: Set<string>
  onToggleSubtopic: (subtopicId: string, topicId: string) => void
}
function SubtopicRows({
  subtopics,
  topicId,
  filteredBySubtopic,
  checkedSubtopics,
  onToggleSubtopic,
}: Readonly<SubtopicRowsProps>) {
  return (
    <div className="border-t border-border bg-muted/40">
      {subtopics.map((sub) => (
        <TopicRow
          key={sub.id}
          code={sub.code}
          name={sub.name}
          count={sub.questionCount}
          filteredCount={filteredBySubtopic ? (filteredBySubtopic[sub.id] ?? 0) : null}
          checked={checkedSubtopics.has(sub.id)}
          onCheckedChange={() => onToggleSubtopic(sub.id, topicId)}
          indented
        />
      ))}
    </div>
  )
}

type TopicListProps = {
  topics: TopicItem[]
  checkedTopics: Set<string>
  checkedSubtopics: Set<string>
  expanded: Set<string>
  toggleExpand: (topicId: string) => void
  onToggleTopic: (topicId: string) => void
  onToggleSubtopic: (subtopicId: string, topicId: string) => void
  filteredByTopic: Record<string, number> | null
  filteredBySubtopic: Record<string, number> | null
}
function TopicList({
  topics,
  checkedTopics,
  checkedSubtopics,
  expanded,
  toggleExpand,
  onToggleTopic,
  onToggleSubtopic,
  filteredByTopic,
  filteredBySubtopic,
}: Readonly<TopicListProps>) {
  return (
    <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
      {topics.map((topic) => (
        <div key={topic.id} className="border-b border-border last:border-b-0">
          <TopicRow
            code={topic.code}
            name={topic.name}
            count={topic.questionCount}
            filteredCount={filteredByTopic ? (filteredByTopic[topic.id] ?? 0) : null}
            checked={checkedTopics.has(topic.id)}
            onCheckedChange={() => onToggleTopic(topic.id)}
            isExpanded={expanded.has(topic.id)}
            onToggleExpand={topic.subtopics.length > 0 ? () => toggleExpand(topic.id) : undefined}
          />
          {expanded.has(topic.id) && (
            <SubtopicRows
              subtopics={topic.subtopics}
              topicId={topic.id}
              filteredBySubtopic={filteredBySubtopic}
              checkedSubtopics={checkedSubtopics}
              onToggleSubtopic={onToggleSubtopic}
            />
          )}
        </div>
      ))}
    </div>
  )
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
      />
    </div>
  )
}
