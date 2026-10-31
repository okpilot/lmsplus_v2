import { Card } from '@/components/ui/card'
import { getProfileData } from '@/lib/queries/profile'
import { ChangePasswordForm } from './change-password-form'
import { DataExportCard } from './data-export-card'
import { EditNameForm } from './edit-name-form'
import { ProfileCard } from './profile-card'

export async function SettingsContent() {
  const profile = await getProfileData()

  return (
    <>
      <Card className="divide-y lg:grid lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <ProfileCard
          email={profile.email}
          organizationName={profile.organizationName}
          memberSince={profile.memberSince}
        />
        <DataExportCard />
      </Card>
      <div className="grid gap-cards lg:grid-cols-2">
        <EditNameForm currentName={profile.fullName} />
        <ChangePasswordForm />
      </div>
    </>
  )
}
