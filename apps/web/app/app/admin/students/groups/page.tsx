import { Plus } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/heading'
import { requireAdmin } from '@/lib/auth/require-admin'
import { GroupFormDialog } from './_components/group-form-dialog'
import { GroupsTable } from './_components/groups-table'
import { getGroupsWithCounts } from './queries'

export default async function GroupsPage() {
  await requireAdmin()
  const groups = await getGroupsWithCounts()

  return (
    <div className="space-y-section">
      <PageHeader
        title="Student Groups"
        description="Organise students into groups for bulk management."
        actions={
          <>
            <Button variant="outline" size="sm" render={<Link href="/app/admin/students" />}>
              Back to students
            </Button>
            <GroupFormDialog
              trigger={
                <Button size="sm">
                  <Plus className="mr-1.5 size-icon" />
                  New Group
                </Button>
              }
            />
          </>
        }
      />
      <GroupsTable groups={groups} />
    </div>
  )
}
