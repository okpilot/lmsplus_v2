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

function TopicTreeHeader(props: {
  totalQuestions: number
  allSelected: boolean
  onSelectAll: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-medium">Topics</span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {props.totalQuestions} questions available
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <Checkbox checked={props.allSelected} onCheckedChange={props.onSelectAll} />
          Select all
        </span>
      </div>
    </div>
  )
}

function TopicListItem(props: {
  topic: TopicItem
  isExpanded: boolean
  isChecked: boolean
  filteredByTopic: Record<string, number> | null
  filteredBySubtopic: Record<string, number> | null
  checkedSubtopics: Set<string>
  onToggleTopic: (topicId: string) => void
  onToggleSubtopic: (subtopicId: string, topicId: string) => void
  onToggleExpand: (topicId: string) => void
}) {
  const { topic } = props
  return (
    <div className="border-b border-border last:border-b-0">
      <TopicRow
        code={topic.code}
        name={topic.name}
        count={topic.questionCount}
        filteredCount={props.filteredByTopic ? (props.filteredByTopic[topic.id] ?? 0) : null}
        checked={props.isChecked}
        onCheckedChange={() => props.onToggleTopic(topic.id)}
        isExpanded={props.isExpanded}
        onToggleExpand={
          topic.subtopics.length > 0 ? () => props.onToggleExpand(topic.id) : undefined
        }
      />
      {props.isExpanded && (
        <div className="border-t border-border bg-muted/40">
          {topic.subtopics.map((sub) => (
            <TopicRow
              key={sub.id}
              code={sub.code}
              name={sub.name}
              count={sub.questionCount}
              filteredCount={
                props.filteredBySubtopic ? (props.filteredBySubtopic[sub.id] ?? 0) : null
              }
              checked={props.checkedSubtopics.has(sub.id)}
              onCheckedChange={() => props.onToggleSubtopic(sub.id, topic.id)}
              indented
            />
          ))}
        </div>
      )}
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
      <TopicTreeHeader
        totalQuestions={totalQuestions}
        allSelected={allSelected}
        onSelectAll={onSelectAll}
      />
      <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
        {topics.map((topic) => (
          <TopicListItem
            key={topic.id}
            topic={topic}
            isExpanded={expanded.has(topic.id)}
            isChecked={checkedTopics.has(topic.id)}
            filteredByTopic={filteredByTopic}
            filteredBySubtopic={filteredBySubtopic}
            checkedSubtopics={checkedSubtopics}
            onToggleTopic={onToggleTopic}
            onToggleSubtopic={onToggleSubtopic}
            onToggleExpand={toggleExpand}
          />
        ))}
      </div>
    </div>
  )
}
