import { PaginationBar } from '@/app/app/_components/pagination-bar'
import { CardList } from '@/components/ui/card'
import { Heading } from '@/components/ui/heading'
import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import { ReportQuestionRow } from './report-question-row'

type Props = Readonly<{
  questions: QuizReportQuestion[]
  page: number
  totalCount: number
  pageSize: number
}>

export function QuestionBreakdown({ questions, page, totalCount, pageSize }: Readonly<Props>) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Heading level={2}>Question Breakdown</Heading>
        <span className="text-sm text-muted-foreground">
          {totalCount} question{totalCount === 1 ? '' : 's'}
        </span>
      </div>

      <CardList>
        {questions.map((q, i) => (
          <ReportQuestionRow key={q.questionId} question={q} index={(page - 1) * pageSize + i} />
        ))}
      </CardList>

      <PaginationBar
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        entityLabel="questions"
      />
    </div>
  )
}
