import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Heading } from '@/components/ui/heading'
import { getMasteryColor } from '../_lib/constants'
import type { WeakTopic } from '../types'

type Props = Readonly<{ topics: WeakTopic[] }>

function getBarColor(score: number): string {
  if (score < 50) return 'bg-red-500'
  if (score < 80) return 'bg-amber-500'
  return 'bg-green-500'
}

export function WeakTopicsList({ topics }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <Heading level={2}>Weakest Topics</Heading>

      {topics.length === 0 ? (
        <Empty>
          <EmptyDescription>No quiz data yet.</EmptyDescription>
        </Empty>
      ) : (
        <ul className="space-y-4">
          {topics.map((topic) => (
            <li key={topic.topicId} className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium leading-tight truncate">{topic.topicName}</p>
                  <p className="text-xs text-muted-foreground">
                    {topic.subjectShort} · {topic.subjectName}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`text-sm font-semibold tabular-nums ${getMasteryColor(topic.avgScore)}`}
                  >
                    {Math.round(topic.avgScore)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {topic.studentCount} {topic.studentCount === 1 ? 'student' : 'students'}
                  </p>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className={`h-1.5 rounded-full transition-all ${getBarColor(topic.avgScore)}`}
                  style={{ width: `${topic.avgScore}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
