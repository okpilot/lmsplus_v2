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
      <div className="grid grid-cols-(--layout-distribution) gap-2 text-caption-strong text-muted-foreground">
        <span>Topic</span>
        <span className="text-right">Questions</span>
        <span className="text-right">Available</span>
      </div>

      {topics.map((topic) => (
        <TopicRows key={topic.id} topic={topic} getCount={getCount} updateCount={updateCount} />
      ))}
    </div>
  )
}

type TopicRowsProps = {
  topic: TopicInfo
  getCount: (topicId: string, subtopicId: string | null) => number
  updateCount: (topicId: string, subtopicId: string | null, value: number) => void
}

function TopicRows({ topic, getCount, updateCount }: Readonly<TopicRowsProps>) {
  const hasSubs = topic.subtopics.length > 0
  return (
    <div>
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
      className={`grid grid-cols-(--layout-distribution) items-center gap-2 py-1${indent ? ' pl-6' : ''}`}
    >
      <span className="text-body">
        <span className="mr-1 tabular-nums text-caption text-muted-foreground">{code}</span>
        {name}
        {note && <span className="ml-2 text-caption text-muted-foreground">{note}</span>}
      </span>
      <input
        type="number"
        min={0}
        max={available}
        value={value}
        aria-label={`${code} questions`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-control border border-border bg-background px-2 py-1 text-right text-body"
      />
      <span className="text-right text-body text-muted-foreground">{available}</span>
    </div>
  )
}
