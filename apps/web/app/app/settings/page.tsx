import { getProfileData } from '@/lib/queries/profile'
import { ChangePasswordForm } from './_components/change-password-form'
import { EditNameForm } from './_components/edit-name-form'
import { ProfileCard } from './_components/profile-card'

export default async function SettingsPage() {
  const profile = await getProfileData()

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <ProfileCard
        email={profile.email}
        organizationName={profile.organizationName}
        memberSince={profile.memberSince}
        stats={profile.stats}
      />
      <EditNameForm currentName={profile.fullName} />
      <ChangePasswordForm />
    </div>
  )
}
