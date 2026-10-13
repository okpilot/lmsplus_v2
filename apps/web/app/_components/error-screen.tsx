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
}>

export function ErrorScreen({
  title = 'Something went wrong',
  children,
  action,
}: ErrorScreenProps) {
  return (
    <Empty role="alert">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleX aria-hidden="true" className="text-danger" />
        </EmptyMedia>
        <EmptyTitle as="h2">{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>{action}</EmptyContent>
    </Empty>
  )
}
