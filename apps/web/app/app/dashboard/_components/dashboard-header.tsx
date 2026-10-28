'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { useUser } from '@/app/app/_components/user-context'
import { firstName } from '@/app/app/_lib/shell-user'
import { buttonVariants } from '@/components/ui/button-variants'
import { PageHeader } from '@/components/ui/heading'
import { cn } from '@/lib/utils'

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
        <Link href="/app/quiz" className={cn(buttonVariants(), 'w-full sm:w-auto')}>
          + Start Quiz
        </Link>
      }
    />
  )
}
