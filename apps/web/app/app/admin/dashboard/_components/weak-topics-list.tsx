import { EmptyNote } from '@/components/ui/empty'
import { Heading } from '@/components/ui/heading'
import { Meter } from '@/components/ui/meter'
import { getMasteryColor, getMasteryTone } from '../_lib/constants'
import type { WeakTopic } from '../types'

type Props = Readonly<{ topics: WeakTopic[] }>

export function WeakTopicsList({ topics }: Readonly<Props>) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <Heading level={2}>Weakest Topics</Heading>

      {topics.length === 0 ? (
        <EmptyNote variant="inline" className="py-6 text-center">
          No quiz data yet.
        </EmptyNote>
      ) : (
        <ul className="space-y-4">
          {topics.map((topic) => (
            <TopicRow key={topic.topicId} topic={topic} />
          ))}
        </ul>
      )}
    </div>
  )
}

function TopicRow({ topic }: Readonly<{ topic: WeakTopic }>) {
  return (
    <li className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium leading-tight truncate">{topic.topicName}</p>
          <p className="text-xs text-muted-foreground">
            {topic.subjectShort} · {topic.subjectName}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-semibold tabular-nums ${getMasteryColor(topic.avgScore)}`}>
            {Math.round(topic.avgScore)}%
          </p>
          <p className="text-xs text-muted-foreground">
            {topic.studentCount} {topic.studentCount === 1 ? 'student' : 'students'}
          </p>
        </div>
      </div>
      <Meter
        value={topic.avgScore}
        tone={getMasteryTone(topic.avgScore)}
        label={`${topic.topicName} average score`}
        className="h-1.5"
      />
    </li>
  )
}
