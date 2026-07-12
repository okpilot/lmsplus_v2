// Report summary types, extracted from quiz-report.ts to keep both query files under the §1 size cap.

export type QuizReportSummary = {
  sessionId: string
  mode: string
  subjectName: string | null
  // Subject code, e.g. 'RT', used for report context (VFR RT Practice vs. Quiz).
  subjectCode: string | null
  totalQuestions: number
  // Distinct questions that received at least one answer — the denominator for Skipped.
  answeredQuestions: number
  // Answer-row count (MC/SA = 1 per question, dialog_fill = 1 per blank) — the
  // denominator for the item-level "Correct" stat.
  answeredItems: number
  // Correct items (correct answer rows), unified with the exam scorer.
  correctCount: number
  scorePercentage: number
  startedAt: string
  endedAt: string | null
  passed: boolean | null
  timeLimitSeconds: number | null
}

export type AdminQuizReportSummary = QuizReportSummary & {
  studentId: string
  studentName: string | null
}
