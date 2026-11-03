import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/heading'
import { SettingsContent } from './_components/settings-content'
import { SettingsContentSkeleton } from './_components/settings-content-skeleton'

export default function SettingsPage() {
  return (
    <div className="space-y-section">
      <PageHeader title="Settings" />
      <Suspense fallback={<SettingsContentSkeleton />}>
        <SettingsContent />
      </Suspense>
    </div>
  )
}
