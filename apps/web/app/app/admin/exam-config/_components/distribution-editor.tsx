'use client'

import type { TopicInfo } from '../types'
import { topicRemaining } from './topic-remaining'

type DistRow = { topicId: string; subtopicId: string | null; questionCount: number }

type Props = {
  topics: TopicInfo[]
  distributions: DistRow[]
  onChange: (distributions: DistRow[]) => void
}

export function DistributionEditor({ topics, distributions, onChange }: Readonly<Props>) {
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

      {topics.map((topic) => {
        const hasSubs = topic.subtopics.length > 0
        return (
          <div key={topic.id}>
            <DistributionRow
              code={topic.code}
              name={topic.name}
              note={hasSubs ? 'Any sub-topic' : undefined}
              value={getCount(topic.id, null)}
              available={topicRemaining(topic, getCount)}
              onChange={(v) => updateCount(topic.id, null, v)}
            />
            {topic.subtopics.map((st) => (
              <DistributionRow
                key={st.id}
                indent
                code={st.code}
                name={st.name}
                value={getCount(topic.id, st.id)}
                available={st.availableQuestions}
                onChange={(v) => updateCount(topic.id, st.id, v)}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

type RowProps = {
  code: string
  name: string
  note?: string
  indent?: boolean
  value: number
  available: number
  onChange: (value: number) => void
}

function DistributionRow({
  code,
  name,
  note,
  indent,
  value,
  available,
  onChange,
}: Readonly<RowProps>) {
  return (
    <div
      className={`grid grid-cols-[1fr_80px_80px] items-center gap-2 py-1${indent ? ' pl-6' : ''}`}
    >
      <span className="text-sm">
        <span className="mr-1 tabular-nums text-xs text-muted-foreground">{code}</span>
        {name}
        {note && <span className="ml-2 text-xs text-muted-foreground">{note}</span>}
      </span>
      <input
        type="number"
        min={0}
        max={available}
        value={value}
        aria-label={`${code} questions`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded border border-border bg-background px-2 py-1 text-right text-sm"
      />
      <span className="text-right text-sm text-muted-foreground">{available}</span>
    </div>
  )
}
