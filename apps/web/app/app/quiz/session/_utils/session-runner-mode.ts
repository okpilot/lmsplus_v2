import { isExamMode, type QuizMode } from '@/lib/constants/exam-modes'
import type { SessionMode } from '../../session-types'

/** The runner's two-level mode (study | exam) and DB exam mode for a stored session mode. */
export function toRunnerMode(mode: QuizMode): { mode: SessionMode; examMode?: QuizMode } {
  return isExamMode(mode) ? { mode: 'exam', examMode: mode } : { mode: 'study' }
}
