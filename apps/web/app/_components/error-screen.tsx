import { CircleX } from 'lucide-react'
import type * as React from 'react'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

type ErrorScreenProps = Readonly<{
  title?: string
  children: React.ReactNode
  action: React.ReactNode
  actionClassName?: string
}>

export function ErrorScreen({
  title = 'Something went wrong',
  children,
  action,
  actionClassName,
}: ErrorScreenProps) {
  return (
    <div className="grid min-h-[50vh] place-items-center px-gutter">
      <Empty>
        <EmptyHeader role="alert">
          <EmptyMedia variant="icon">
            <CircleX aria-hidden="true" className="text-danger" />
          </EmptyMedia>
          <EmptyTitle as="h2">{title}</EmptyTitle>
          <EmptyDescription>{children}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className={actionClassName}>{action}</EmptyContent>
      </Empty>
    </div>
  )
}
