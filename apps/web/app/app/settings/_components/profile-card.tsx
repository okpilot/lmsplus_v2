import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type ProfileCardProps = {
  email: string
  organizationName: string | null
  memberSince: string
}

export function ProfileCard({ email, organizationName, memberSince }: Readonly<ProfileCardProps>) {
  const joinDate = new Date(memberSince).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <section className="flex flex-col gap-4">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-(--layout-label-value) gap-x-4 gap-y-2 text-body">
          <dt className="text-muted-foreground">Email</dt>
          <dd>{email}</dd>
          {organizationName && (
            <>
              <dt className="text-muted-foreground">Organisation</dt>
              <dd>{organizationName}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Member since</dt>
          <dd>{joinDate}</dd>
        </dl>
      </CardContent>
    </section>
  )
}
