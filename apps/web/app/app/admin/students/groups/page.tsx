import { Plus } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
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
            <Link
              href="/app/admin/students"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Back to students
            </Link>
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
