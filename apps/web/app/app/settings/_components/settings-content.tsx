import { getProfileData } from '@/lib/queries/profile'
import { ChangePasswordForm } from './change-password-form'
import { DataExportCard } from './data-export-card'
import { EditNameForm } from './edit-name-form'
import { ProfileCard } from './profile-card'

export async function SettingsContent() {
  const profile = await getProfileData()

  return (
    <>
      <ProfileCard
        email={profile.email}
        organizationName={profile.organizationName}
        memberSince={profile.memberSince}
        stats={profile.stats}
      />
      <EditNameForm currentName={profile.fullName} />
      <ChangePasswordForm />
      <DataExportCard />
    </>
  )
}
