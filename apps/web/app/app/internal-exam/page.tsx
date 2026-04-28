import { Suspense } from 'react'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { InternalExamContent } from './_components/internal-exam-content'

export const dynamic = 'force-dynamic'

export default async function InternalExamPage() {
  const user = await requireAuthUser()

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Internal Exam</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the code from your administrator to begin a supervised internal exam.
        </p>
      </div>
      <Suspense fallback={<InternalExamFallback />}>
        <InternalExamContent userId={user.id} />
      </Suspense>
    </main>
  )
}

function InternalExamFallback() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
        <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  )
}
