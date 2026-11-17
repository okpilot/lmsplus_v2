import { CircleAlert, CircleCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  /** success: goal reached; danger: needs attention; neutral: no symbol. */
  tone?: 'neutral' | 'success' | 'danger'
  size?: 'default' | 'lg'
  className?: string
}

/** Status as text; a symbol reinforces success and danger. */
export function StatusText({
  label,
  tone = 'neutral',
  size = 'default',
  className,
}: Readonly<Props>) {
  const icon = size === 'lg' ? 'size-icon-lg' : 'size-icon-sm'
  return (
    <span className={cn('inline-flex items-center gap-1', size === 'lg' && 'text-stat', className)}>
      {tone === 'success' && <CircleCheck className={cn(icon, 'text-success')} aria-hidden />}
      {tone === 'danger' && <CircleAlert className={cn(icon, 'text-danger')} aria-hidden />}
      {label}
    </span>
  )
}
