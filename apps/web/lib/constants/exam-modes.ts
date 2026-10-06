export const MODE_LABELS = {
  smart_review: 'Study',
  quick_quiz: 'Study',
  mock_exam: 'Practice Exam',
  internal_exam: 'Internal Exam',
  vfr_rt_exam: 'VFR RT Mock Exam',
  // Discovery (Study Mode) is ephemeral + browse-only. Labelled defensively so a
  // discovery row can never render as "Practice Exam" via a `?? MODE_LABELS.mock_exam`
  // fallback — it is never scored and has no exam report.
  discovery: 'Discovery',
} as const

export type QuizMode = keyof typeof MODE_LABELS

export const modeLabel = (mode: string): string => MODE_LABELS[mode as QuizMode] ?? mode

export const EXAM_MODES = ['mock_exam', 'internal_exam', 'vfr_rt_exam'] as const

export type ExamMode = (typeof EXAM_MODES)[number]

export const isExamMode = (mode: string): mode is ExamMode =>
  (EXAM_MODES as readonly string[]).includes(mode)

// Mirrors NON_DISCARDABLE_MODES in app/app/quiz/actions/_discard-guard.ts — the server
// refuses discard for these, so the UI must never offer it.
export const isDiscardableExamMode = (mode: string | undefined): boolean =>
  mode !== 'internal_exam' && mode !== 'vfr_rt_exam'

// Positive allowlist of practice (answer-revealing, ungraded) session modes. Single
// source of truth for the "never touch a graded exam" boundary used by the save-time
// session close (draft-helpers), the resume validator (resume-helpers), the
// server-visible active-practice lookup (get-active-practice-session), and the
// one-time orphan cleanup script — keep those in lockstep by importing this, not
// re-inlining the literal.
export const PRACTICE_MODES = ['quick_quiz', 'smart_review'] as const

/** Every VFR RT exam part requires 75%; the start RPC returns no pass mark, so the runner uses this. */
export const VFR_RT_EXAM_PASS_MARK = 75
