'use client'

import Link from 'next/link'
import { useUser } from '@/app/app/_components/user-context'
import { PageHeader } from '@/components/ui/heading'

export function DashboardHeader() {
  const { displayName } = useUser()
  const firstName = displayName.split(' ')[0] ?? displayName

  return (
    <PageHeader
      title="Dashboard"
      description={`Welcome back, ${firstName}`}
      actions={
        <Link
          href="/app/quiz"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 md:px-4 md:py-2 md:text-sm"
        >
          + Start Quiz
        </Link>
      }
    />
  )
}
