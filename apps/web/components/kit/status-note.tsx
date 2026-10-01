import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'caution' | 'ok' | 'bad'

type StatusNoteProps = {
  tone: Tone
  title?: string
  children: ReactNode
}

const PANEL_CLASS = {
  caution: 'bg-caution-soft ring-1 ring-caution-ring',
  ok: 'bg-ok-soft',
  bad: 'bg-bad-soft',
} as const satisfies Record<Tone, string>

const ICON_CLASS = {
  caution: 'text-caution',
  ok: 'text-ok',
  bad: 'text-bad',
} as const satisfies Record<Tone, string>

const ICON = {
  caution: TriangleAlert,
  ok: CircleCheck,
  bad: CircleX,
} as const

const ROLE = {
  caution: 'status',
  ok: 'status',
  bad: 'alert',
} as const satisfies Record<Tone, 'status' | 'alert'>

export function StatusNote({ tone, title, children }: Readonly<StatusNoteProps>) {
  const Icon = ICON[tone]
  return (
    <div
      role={ROLE[tone]}
      className={cn('flex gap-3 rounded-2xl px-4 py-3 text-sm', PANEL_CLASS[tone])}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', ICON_CLASS[tone])} />
      <div>
        {title ? <p className="font-medium">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  )
}
