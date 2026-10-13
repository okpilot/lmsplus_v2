import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Heading } from '@/components/ui/heading'
import { Stat, StatGroup } from '@/components/ui/stat'
import type { ProfileStats } from '@/lib/queries/profile'

type ProfileCardProps = {
  email: string
  organizationName: string | null
  memberSince: string
  stats: ProfileStats
}

export function ProfileCard({
  email,
  organizationName,
  memberSince,
  stats,
}: Readonly<ProfileCardProps>) {
  const joinDate = new Date(memberSince).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
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

        <div className="border-t pt-4">
          <Heading level={3} className="mb-3">
            Quiz Statistics
          </Heading>
          <StatGroup columns={3} className="grid-cols-3 sm:grid-cols-3">
            <Stat variant="plain" size="compact" label="Sessions" value={stats.totalSessions} />
            <Stat
              variant="plain"
              size="compact"
              label="Avg. Score"
              value={`${stats.averageScore}%`}
            />
            <Stat variant="plain" size="compact" label="Answered" value={stats.totalAnswered} />
          </StatGroup>
        </div>
      </CardContent>
    </Card>
  )
}
