import type { SessionEntry } from '@/lib/queries/load-quiz-session-state'
import type { SessionRunnerData } from '../_loaders/load-session-entry'
import { SavedSessionResume } from './saved-session-resume'
import { ServerSessionLoader } from './server-session-loader'

export function SessionEntryView({
  userId,
  entry,
  runner,
}: Readonly<{ userId: string; entry: SessionEntry; runner: SessionRunnerData | null }>) {
  if (entry.kind === 'saved') {
    return (
      <SavedSessionResume
        sessionId={entry.sessionId}
        subjectName={entry.subjectName}
        mode={entry.mode}
        answeredCount={Object.keys(entry.seed.answers).length}
        totalCount={entry.questionIds.length}
      />
    )
  }
  if (!runner) return null
  return <ServerSessionLoader key={entry.sessionId} userId={userId} entry={entry} runner={runner} />
}
