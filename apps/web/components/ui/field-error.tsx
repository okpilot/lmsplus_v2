import { CircleAlert } from 'lucide-react'
import type * as React from 'react'

import { cn } from '@/lib/utils'
import { isEmptyNode } from '@/lib/utils/is-empty-node'

type FieldErrorProps = Readonly<{
  id?: string
  role?: React.AriaRole
  className?: string
  children?: React.ReactNode
}>

function FieldError({ id, role, className, children }: Readonly<FieldErrorProps>) {
  if (isEmptyNode(children)) return null
  return (
    <p
      id={id}
      role={role}
      data-slot="field-error"
      className={cn('flex items-start gap-inline text-label text-danger', className)}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {children}
    </p>
  )
}

export { FieldError }
