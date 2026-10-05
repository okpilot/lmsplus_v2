import type { SessionEntry } from '@/lib/queries/load-quiz-session-state'
import { SavedSessionResume } from './saved-session-resume'
import { ServerSessionLoader } from './server-session-loader'

export function SessionEntryView({
  userId,
  entry,
}: Readonly<{ userId: string; entry: SessionEntry }>) {
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
  return <ServerSessionLoader key={entry.sessionId} userId={userId} entry={entry} />
}
