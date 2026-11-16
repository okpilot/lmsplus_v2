import { Plus } from 'lucide-react'
import { unstable_rethrow } from 'next/navigation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { getGroupsWithCounts } from '../queries'
import { GroupFormDialog } from './group-form-dialog'
import { GroupsTable } from './groups-table'

type Groups = Awaited<ReturnType<typeof getGroupsWithCounts>>

export async function GroupsPanel() {
  try {
    return <GroupsPanelView groups={await getGroupsWithCounts()} />
  } catch (error) {
    unstable_rethrow(error)
    return (
      <Alert tone="danger">
        <AlertDescription>Failed to load groups. Please refresh the page.</AlertDescription>
      </Alert>
    )
  }
}

function GroupsPanelView({ groups }: Readonly<{ groups: Groups }>) {
  return (
    <div className="space-y-section">
      <div className="flex items-center justify-between">
        <p className="text-caption text-muted-foreground">
          {groups.length} group{groups.length === 1 ? '' : 's'}
        </p>
        <GroupFormDialog
          trigger={
            <Button size="sm">
              <Plus className="mr-1.5 size-icon" />
              New Group
            </Button>
          }
        />
      </div>
      <GroupsTable groups={groups} />
    </div>
  )
}
