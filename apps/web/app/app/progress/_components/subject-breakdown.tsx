'use client'

import { useState } from 'react'
import type { SubjectDetail } from '@/lib/queries/progress'

type SubjectBreakdownProps = {
  subjects: SubjectDetail[]
}

export function SubjectBreakdown({ subjects }: SubjectBreakdownProps) {
  if (subjects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No subjects with questions available yet.</p>
    )
  }

  return (
    <div className="space-y-3">
      {subjects.map((subject) => (
        <SubjectRow key={subject.id} subject={subject} />
      ))}
    </div>
  )
}

function SubjectRow({ subject }: { subject: SubjectDetail }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">{subject.code}</span>
            <span className="text-sm font-medium">{subject.name}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-1.5 flex-1 rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-primary transition-all"
                style={{ width: `${subject.masteryPercentage}%` }}
              />
            </div>
            <span className="text-xs font-medium tabular-nums">{subject.masteryPercentage}%</span>
          </div>
        </div>
        <span className="ml-3 text-muted-foreground">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && subject.topics.length > 0 && (
        <div className="border-t border-border px-4 py-2">
          {subject.topics.map((topic) => (
            <div key={topic.id} className="flex items-center gap-3 py-1.5">
              <span className="w-16 shrink-0 text-xs text-muted-foreground">{topic.code}</span>
              <span className="min-w-0 flex-1 truncate text-xs">{topic.name}</span>
              <div className="flex items-center gap-2">
                <div className="h-1 w-20 rounded-full bg-muted">
                  <div
                    className="h-1 rounded-full bg-primary transition-all"
                    style={{ width: `${topic.masteryPercentage}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs tabular-nums">
                  {topic.masteryPercentage}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
