import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getGroupsWithCounts } from '../queries'
import { GroupFormDialog } from './group-form-dialog'
import { GroupsTable } from './groups-table'

export async function GroupsPanel() {
  const groups = await getGroupsWithCounts()

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
