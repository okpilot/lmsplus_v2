import { Suspense } from 'react'
import { SettingsContent } from './_components/settings-content'
import { SettingsContentSkeleton } from './_components/settings-content-skeleton'

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
