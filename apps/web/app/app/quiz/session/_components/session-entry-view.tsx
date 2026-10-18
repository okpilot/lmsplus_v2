import type { LoadedSessionEntry } from '../_loaders/load-session-entry'
import { SavedSessionResume } from './saved-session-resume'
import { ServerSessionLoader } from './server-session-loader'

export function SessionEntryView({
  userId,
  loaded,
}: Readonly<{ userId: string; loaded: LoadedSessionEntry }>) {
  if (loaded.runner === null) {
    const { entry } = loaded
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
  const { entry, runner } = loaded
  return <ServerSessionLoader key={entry.sessionId} userId={userId} entry={entry} runner={runner} />
}
