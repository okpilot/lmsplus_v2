'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { useUser } from '@/app/app/_components/user-context'
import { firstName } from '@/app/app/_lib/shell-user'

function FirstName() {
  const first = firstName(useUser().displayName)
  if (!first) return null
  return <span>, {first}</span>
}

export function DashboardHeader() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back
          <Suspense fallback={null}>
            <FirstName />
          </Suspense>
        </p>
      </div>
      <Link
        href="/app/quiz"
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 md:px-4 md:py-2 md:text-sm"
      >
        + Start Quiz
      </Link>
    </div>
  )
}
