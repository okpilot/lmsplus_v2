import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { ChangePasswordForm } from './_components/change-password-form'
import { SettingsProfileContent } from './_components/settings-profile-content'

function ProfileContentSkeleton() {
  return (
    <>
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
    </>
  )
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Suspense fallback={<ProfileContentSkeleton />}>
        <SettingsProfileContent />
      </Suspense>
      <ChangePasswordForm />
    </div>
  )
}
