'use client'

import { useState } from 'react'
import { CardList } from '@/components/ui/card'
import { EmptyNote } from '@/components/ui/empty'
import { Meter } from '@/components/ui/meter'
import type { SubjectDetail } from '@/lib/queries/progress'
import { masteryMeterTone } from '@/lib/utils/mastery-tone'

type SubjectBreakdownProps = {
  subjects: SubjectDetail[]
}

export function SubjectBreakdown({ subjects }: Readonly<SubjectBreakdownProps>) {
  if (subjects.length === 0) {
    return <EmptyNote>No subjects with questions available yet.</EmptyNote>
  }

  return (
    <CardList>
      {subjects.map((subject) => (
        <SubjectRow key={subject.id} subject={subject} />
      ))}
    </CardList>
  )
}

function SubjectRow({ subject }: Readonly<{ subject: SubjectDetail }>) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between px-4 pt-3 pb-1.5 text-left outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-caption font-medium text-muted-foreground">{subject.code}</span>
            <span className="text-label">{subject.name}</span>
          </span>
          <span className="ml-3 text-muted-foreground">{expanded ? '−' : '+'}</span>
        </button>
        <div className="flex items-center gap-3 px-4 pb-3 pr-10">
          <Meter
            value={subject.masteryPercentage}
            tone={masteryMeterTone(subject.masteryPercentage)}
            label={`${subject.name} mastery`}
            className="flex-1"
          />
          <span className="text-label font-semibold tabular-nums">
            {subject.masteryPercentage}%
          </span>
        </div>
      </div>

      {expanded && subject.topics.length > 0 && (
        <div className="border-t border-border px-4 py-2">
          {subject.topics.map((topic) => (
            <div key={topic.id} className="flex items-center gap-3 py-1.5">
              <span className="w-16 shrink-0 text-caption text-muted-foreground">{topic.code}</span>
              <span className="min-w-0 flex-1 truncate text-caption">{topic.name}</span>
              <div className="flex items-center gap-2">
                <Meter
                  value={topic.masteryPercentage}
                  tone={masteryMeterTone(topic.masteryPercentage)}
                  label={`${topic.name} mastery`}
                  className="w-20"
                />
                <span className="w-8 text-right text-caption tabular-nums">
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
