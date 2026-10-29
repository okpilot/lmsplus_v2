import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

type QuizSessionLayoutProps = {
  /** Question-view tabs, shown below `md` in study modes. */
  tabs?: ReactNode
  question: ReactNode
  panel: ReactNode
}

/**
 * Centred question column with the navigator panel hanging to its right from `lg`.
 * Below `lg` the panel stacks above the question. NOTE: the sticky panel relies on
 * no `overflow` on any ancestor of this grid.
 */
export function QuizSessionLayout({ tabs, question, panel }: Readonly<QuizSessionLayoutProps>) {
  return (
    <div className="flex flex-col gap-stack lg:grid lg:grid-cols-(--layout-session) lg:items-start lg:gap-0">
      <div className="space-y-stack lg:col-start-2">
        {tabs}
        {question}
      </div>
      <aside
        aria-label="Question navigator"
        className="order-first lg:order-none lg:sticky lg:top-(--session-header-h) lg:col-start-3 lg:ml-section lg:w-rail"
      >
        <Card className="lg:max-h-(--panel-max) lg:overflow-y-auto">
          <CardContent>{panel}</CardContent>
        </Card>
      </aside>
    </div>
  )
}
