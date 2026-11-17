import { CircleAlert, CircleCheck } from 'lucide-react'

type Props = {
  label: string
  /** success: goal reached; danger: needs attention; neutral: no symbol. */
  tone?: 'neutral' | 'success' | 'danger'
  caption?: string
  className?: string
}

/** Status as text; a symbol reinforces success and danger. Caption is muted detail below. */
export function StatusText({ label, tone = 'neutral', caption, className }: Readonly<Props>) {
  return (
    <div className={className}>
      <span className="inline-flex items-center gap-1">
        {tone === 'success' && <CircleCheck className="size-icon-sm text-success" aria-hidden />}
        {tone === 'danger' && <CircleAlert className="size-icon-sm text-danger" aria-hidden />}
        {label}
      </span>
      {caption && <div className="text-caption text-muted-foreground tabular-nums">{caption}</div>}
    </div>
  )
}
