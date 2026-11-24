import type { ReactNode } from 'react'

type Props = {
  /** Filters, left side of the toolbar. */
  filters: ReactNode
  /** Result count or other quiet summary, right side of the toolbar. */
  summary?: ReactNode
  /** The table. */
  children: ReactNode
  /** Pagination, below the table. */
  footer?: ReactNode
}

/** List page body: one card holding the toolbar, the table and the footer. */
export function ListCard({ filters, summary, children, footer }: Readonly<Props>) {
  return (
    <section className="overflow-hidden rounded-card border bg-card [&_[data-slot=table-container]]:rounded-none [&_[data-slot=table-container]]:border-0">
      <div className="flex min-h-control flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">{filters}</div>
        {summary && <div className="text-caption text-muted-foreground">{summary}</div>}
      </div>
      {children}
      {footer && <div className="border-t px-3 py-2">{footer}</div>}
    </section>
  )
}
