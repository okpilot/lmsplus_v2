import type { ReactNode } from 'react'
import { Heading } from '@/components/ui/heading'

type Props = {
  title: string
  /** Shown next to the title, e.g. the related list's row count. */
  count?: number
  /** At most two actions; the rest belong in a menu. */
  actions?: ReactNode
  children: ReactNode
}

/** A titled block on a record page, e.g. a related list. */
export function Section({ title, count, actions, children }: Readonly<Props>) {
  return (
    <section className="space-y-stack">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level={2} className="flex items-baseline gap-2">
          {title}
          {count !== undefined && (
            <span className="text-body font-normal text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
        </Heading>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}
