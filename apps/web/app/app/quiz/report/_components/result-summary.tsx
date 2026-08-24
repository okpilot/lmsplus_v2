import { isExamMode, MODE_LABELS, type QuizMode } from '@/lib/constants/exam-modes'
import type { QuizReportSummary } from '@/lib/queries/quiz-report-types'
import { getReportContext } from '../_utils/report-context'
import { DesktopStats, MobileStats } from './result-summary-stats'

function PassFailBadge({ passed }: Readonly<{ passed: boolean }>) {
  return passed ? (
    <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-sm font-semibold text-green-600 dark:text-green-400">
      PASSED
    </span>
  ) : (
    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-sm font-semibold text-red-600 dark:text-red-400">
      FAILED
    </span>
  )
}

type Props = Readonly<{ summary: QuizReportSummary }>

/**
 * Derive the two numbers both layouts render. Kept out of the render body so both layouts
 * share one expression: the pre-fix code repeated the SAME `isExam ? totalQuestions` fraction
 * in each, so the scale bug had to be fixed in two places. Duplication did not cause the
 * defect — both copies were wrong identically — it only doubled the fix.
 *
 * `correctFraction` divides ITEM by ITEM. `quiz_sessions.correct_count` is written
 * item-level by every writer (`batch_submit_quiz` sums correct blank rows;
 * `submit_vfr_rt_exam_answers` and `complete_overdue_exam_session` count correct answer
 * rows), so dividing it by the QUESTION-level `total_questions` produced a numerator larger
 * than its denominator on real exams. `answeredItems === 0` renders an em dash rather than
 * "0 / 0" — the timer-expiry path zeroes the counts and inserts no answer rows at all.
 *
 * `skipped` renders an em dash when `answeredQuestions` exceeds `totalQuestions`: the admin
 * session route still derives `answeredQuestions` from a raw answer-ROW count
 * (`admin-quiz-report.ts`, "KNOWN LIMITATION (#991)"), which overshoots `totalQuestions` on
 * non-MC sessions — reproduced locally as "SKIPPED -2" on a 3-question dialog session, and
 * the same code path serves production. An em dash rather than a clamped 0, because 0 reads
 * as authoritative while being wrong in the direction that flatters the student. NOTE this is a
 * PARTIAL guard: it only fires when the row count EXCEEDS `totalQuestions`. A non-MC session
 * whose rows land at or below the question total still renders a silently wrong `skipped` —
 * that is #991 itself, fixed by giving the query a COUNT(DISTINCT question_id).
 */
function deriveStats(summary: QuizReportSummary): {
  correctFraction: string
  skipped: string | number
  dateStr: string
} {
  return {
    correctFraction:
      summary.answeredItems === 0 ? '—' : `${summary.correctCount} / ${summary.answeredItems}`,
    // When answeredQuestions exceeds totalQuestions the inputs are incoherent (see the
    // admin-route note above). Render an em dash rather than clamping to 0: a 0 reads as
    // authoritative and is silently wrong in the direction that flatters the student,
    // whereas "—" says the number is not known. Same idiom as correctFraction.
    skipped:
      summary.answeredQuestions > summary.totalQuestions
        ? '—'
        : summary.totalQuestions - summary.answeredQuestions,
    dateStr: summary.endedAt ?? summary.startedAt,
  }
}

export function ResultSummary({ summary }: Props) {
  const isExam = isExamMode(summary.mode)
  // summary.mode is typed `string`; isExamMode confirms it's a valid exam mode at runtime,
  // so the narrow cast for MODE_LABELS lookup is safe.
  const examLabel = isExam ? MODE_LABELS[summary.mode as QuizMode] : null
  const ctx = getReportContext(summary.mode, summary.subjectCode)
  const statsProps = { summary, ...deriveStats(summary) }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4">
        <p className="text-center font-semibold text-lg">
          {isExam ? `${examLabel} Complete` : `${ctx.noun} Complete`}
        </p>
      </div>

      {isExam && summary.passed !== null && (
        <div className="mb-4 flex justify-center">
          <PassFailBadge passed={summary.passed} />
        </div>
      )}

      <DesktopStats {...statsProps} />

      <MobileStats {...statsProps} />
    </div>
  )
}
