'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { SubjectsLoadFailedAlert } from './subjects-load-failed-alert'

export function SubjectsRetryAlert() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <SubjectsLoadFailedAlert
      onRetry={() => startTransition(() => router.refresh())}
      pending={isPending}
    />
  )
}
