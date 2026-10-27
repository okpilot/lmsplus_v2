import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/heading'
import { SettingsContent } from './_components/settings-content'
import { SettingsContentSkeleton } from './_components/settings-content-skeleton'

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <PageHeader title="Settings" />
      <Suspense fallback={<SettingsContentSkeleton />}>
        <SettingsContent />
      </Suspense>
    </div>
  )
}
