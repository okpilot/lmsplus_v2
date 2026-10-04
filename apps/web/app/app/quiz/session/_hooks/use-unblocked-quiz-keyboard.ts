import { useConnectionBlocked } from './use-connection-state'
import { useQuizKeyboard } from './use-quiz-keyboard'

/** `useQuizKeyboard` that also pauses every shortcut while the connection overlay blocks. */
export function useUnblockedQuizKeyboard(opts: Parameters<typeof useQuizKeyboard>[0]) {
  const blocked = useConnectionBlocked()
  return useQuizKeyboard({ ...opts, enabled: opts.enabled !== false && !blocked })
}
