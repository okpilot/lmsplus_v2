import { PaginationBar } from '@/app/app/_components/pagination-bar'
import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import { ReportQuestionRow } from './report-question-row'

type Props = Readonly<{
  questions: QuizReportQuestion[]
  page: number
  totalCount: number
  pageSize: number
}>

export function QuestionBreakdown({ questions, page, totalCount, pageSize }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Question Breakdown</h2>
        <span className="text-sm text-muted-foreground">{totalCount} questions</span>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {questions.map((q, i) => (
          <div
            key={q.questionId}
            className={i < questions.length - 1 ? 'border-b border-border' : ''}
          >
            <ReportQuestionRow question={q} index={(page - 1) * pageSize + i} />
          </div>
        ))}
      </div>

      <PaginationBar
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        entityLabel="questions"
      />
    </div>
  )
}
