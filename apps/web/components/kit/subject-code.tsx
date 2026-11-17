import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Subject code beside a subject name. */
export function SubjectCode({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return <span className={cn('text-muted-foreground tabular-nums', className)}>{children}</span>
}
