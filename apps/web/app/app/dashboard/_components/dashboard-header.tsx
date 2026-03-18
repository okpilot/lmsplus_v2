'use client'

import Link from 'next/link'
import { useUser } from '@/app/app/_components/user-context'

export function DashboardHeader() {
  const { displayName } = useUser()
  const firstName = displayName.split(' ')[0] ?? displayName

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Welcome back, {firstName}</p>
      </div>
      <Link
        href="/app/quiz"
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        + Start Quiz
      </Link>
    </div>
  )
}
