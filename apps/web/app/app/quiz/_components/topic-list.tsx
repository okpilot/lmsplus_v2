'use client'

import type { SubtopicOption, TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { TopicRow } from './topic-row'

type SubtopicRowsProps = {
  subtopics: SubtopicOption[]
  topicId: string
  filteredBySubtopic: Record<string, number> | null
  checkedSubtopics: Set<string>
  onToggleSubtopic: (subtopicId: string, topicId: string) => void
  showCode: boolean
}
function SubtopicRows({
  subtopics,
  topicId,
  filteredBySubtopic,
  checkedSubtopics,
  onToggleSubtopic,
  showCode,
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
          showCode={showCode}
        />
      ))}
    </div>
  )
}

export type TopicListProps = {
  topics: TopicWithSubtopics[]
  checkedTopics: Set<string>
  checkedSubtopics: Set<string>
  expanded: Set<string>
  toggleExpand: (topicId: string) => void
  onToggleTopic: (topicId: string) => void
  onToggleSubtopic: (subtopicId: string, topicId: string) => void
  filteredByTopic: Record<string, number> | null
  filteredBySubtopic: Record<string, number> | null
  showCode: boolean
}
export function TopicList({
  topics,
  checkedTopics,
  checkedSubtopics,
  expanded,
  toggleExpand,
  onToggleTopic,
  onToggleSubtopic,
  filteredByTopic,
  filteredBySubtopic,
  showCode,
}: Readonly<TopicListProps>) {
  return (
    <div className="rounded-lg border border-border">
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
            showCode={showCode}
          />
          {expanded.has(topic.id) && (
            <SubtopicRows
              subtopics={topic.subtopics}
              topicId={topic.id}
              filteredBySubtopic={filteredBySubtopic}
              checkedSubtopics={checkedSubtopics}
              onToggleSubtopic={onToggleSubtopic}
              showCode={showCode}
            />
          )}
        </div>
      ))}
    </div>
  )
}
