import { getProfileData } from '@/lib/queries/profile'
import { EditNameForm } from './edit-name-form'
import { ProfileCard } from './profile-card'

export async function SettingsProfileContent() {
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
    </>
  )
}
