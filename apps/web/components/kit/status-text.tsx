import { CircleAlert, CircleCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  /** success: goal reached; danger: needs attention; neutral: no symbol. */
  tone?: 'neutral' | 'success' | 'danger'
  className?: string
}

/** Status as text; a symbol reinforces success and danger. */
export function StatusText({ label, tone = 'neutral', className }: Readonly<Props>) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {tone === 'success' && <CircleCheck className="size-icon-sm text-success" aria-hidden />}
      {tone === 'danger' && <CircleAlert className="size-icon-sm text-danger" aria-hidden />}
      {label}
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
