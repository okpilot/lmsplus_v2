'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { useUser } from '@/app/app/_components/user-context'
import { firstName } from '@/app/app/_lib/shell-user'
import { PageHeader } from '@/components/ui/heading'

function FirstName() {
  const first = firstName(useUser().displayName)
  if (!first) return null
  return <span>, {first}</span>
}

export function DashboardHeader() {
  return (
    <PageHeader
      title="Dashboard"
      description={
        <>
          Welcome back
          <Suspense fallback={null}>
            <FirstName />
          </Suspense>
        </>
      }
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
