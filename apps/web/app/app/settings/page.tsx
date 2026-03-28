import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsContent } from './_components/settings-content'

function SettingsContentSkeleton() {
  return (
    <>
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </>
  )
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Suspense fallback={<SettingsContentSkeleton />}>
        <SettingsContent />
      </Suspense>
    </div>
  )
}
