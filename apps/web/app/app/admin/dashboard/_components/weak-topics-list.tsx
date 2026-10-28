import { Card, CardContent } from '@/components/ui/card'
import { EmptyNote } from '@/components/ui/empty'
import { Heading } from '@/components/ui/heading'
import { Meter } from '@/components/ui/meter'
import { masteryMeterTone, masteryTextClass } from '@/lib/utils/mastery-tone'
import type { WeakTopic } from '../types'

type Props = Readonly<{ topics: WeakTopic[] }>

export function WeakTopicsList({ topics }: Readonly<Props>) {
  return (
    <Card>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
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
          <p className={`text-sm font-semibold tabular-nums ${masteryTextClass(topic.avgScore)}`}>
            {Math.round(topic.avgScore)}%
          </p>
          <p className="text-xs text-muted-foreground">
            {topic.studentCount} {topic.studentCount === 1 ? 'student' : 'students'}
          </p>
        </div>
      </div>
      <Meter
        value={topic.avgScore}
        tone={masteryMeterTone(topic.avgScore)}
        label={`${topic.topicName} average score`}
      />
    </li>
  )
}
