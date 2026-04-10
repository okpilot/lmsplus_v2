'use client'

import type { TopicInfo } from '../types'

type DistRow = { topicId: string; subtopicId: string | null; questionCount: number }

type Props = {
  topics: TopicInfo[]
  distributions: DistRow[]
  onChange: (distributions: DistRow[]) => void
}

export function DistributionEditor({ topics, distributions, onChange }: Props) {
  function updateCount(topicId: string, subtopicId: string | null, value: number) {
    const next = distributions.map((d) =>
      d.topicId === topicId && d.subtopicId === subtopicId
        ? { ...d, questionCount: Math.max(0, value) }
        : d,
    )
    // Add row if not found
    if (!next.some((d) => d.topicId === topicId && d.subtopicId === subtopicId)) {
      next.push({ topicId, subtopicId, questionCount: Math.max(0, value) })
    }
    onChange(next)
  }

  function getCount(topicId: string, subtopicId: string | null): number {
    return (
      distributions.find((d) => d.topicId === topicId && d.subtopicId === subtopicId)
        ?.questionCount ?? 0
    )
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1fr_80px_80px] gap-2 text-xs font-medium text-muted-foreground">
        <span>Topic</span>
        <span className="text-right">Questions</span>
        <span className="text-right">Available</span>
      </div>

      {topics.map((topic) => (
        <div key={topic.id}>
          <div className="grid grid-cols-[1fr_80px_80px] items-center gap-2 py-1">
            <span className="text-sm">
              <span className="mr-1 font-mono text-xs text-muted-foreground">{topic.code}</span>
              {topic.name}
            </span>
            <input
              type="number"
              min={0}
              max={topic.availableQuestions}
              value={getCount(topic.id, null)}
              onChange={(e) => updateCount(topic.id, null, Number(e.target.value))}
              className="w-full rounded border border-border bg-background px-2 py-1 text-right text-sm"
            />
            <span className="text-right text-sm text-muted-foreground">
              {topic.availableQuestions}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
