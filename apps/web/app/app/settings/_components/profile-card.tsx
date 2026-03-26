import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ProfileStats } from '@/lib/queries/profile'

type ProfileCardProps = {
  email: string
  organizationName: string | null
  memberSince: string
  stats: ProfileStats
}

export function ProfileCard({ email, organizationName, memberSince, stats }: ProfileCardProps) {
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
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">Quiz Statistics</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <StatBlock label="Sessions" value={stats.totalSessions} />
            <StatBlock label="Avg. Score" value={`${stats.averageScore}%`} />
            <StatBlock label="Answered" value={stats.totalAnswered} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
