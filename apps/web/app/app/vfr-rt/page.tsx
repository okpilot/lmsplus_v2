import { Suspense } from 'react'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { VfrRtSetup } from './_components/vfr-rt-setup'

export const dynamic = 'force-dynamic'

export default async function VfrRtPage() {
  const user = await requireAuthUser()

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">VFR Radiotelephony</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Practice VFR RT by part — select parts and question count to start a study session.
        </p>
      </div>

      <div className="mx-auto max-w-xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>
          <VfrRtSetup userId={user.id} />
        </Suspense>
      </div>
    </main>
  )
}
