import { CircleAlert, CircleCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  /** success: goal reached; danger: needs attention; neutral: no symbol. */
  tone?: 'neutral' | 'success' | 'danger'
  /** Muted facts under the label. */
  caption?: string
  className?: string
}

/** Status as text; a symbol reinforces success and danger. */
export function StatusText({ label, tone = 'neutral', caption, className }: Readonly<Props>) {
  const text = (
    <span className={cn('inline-flex items-center gap-1', caption ? undefined : className)}>
      {tone === 'success' && <CircleCheck className="size-icon-sm text-success" aria-hidden />}
      {tone === 'danger' && <CircleAlert className="size-icon-sm text-danger" aria-hidden />}
      {label}
    </span>
  )
  if (!caption) return text
  return (
    <span className={cn('flex flex-col', className)}>
      {text}
      <span className="text-caption text-muted-foreground tabular-nums">{caption}</span>
    </span>
  )
}

/** Exam outcome: Passed (success) or Failed (danger). */
export function PassFailStatus({ passed }: Readonly<{ passed: boolean }>) {
  return passed ? (
    <StatusText label="Passed" tone="success" />
  ) : (
    <StatusText label="Failed" tone="danger" />
  )
}
