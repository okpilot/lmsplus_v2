import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { GroupOption } from '../types'

type Props = {
  groups: GroupOption[]
  value: string
  onChange: (groupId: string) => void
}

export function GroupPicker({ groups, value, onChange }: Readonly<Props>) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v ?? '')}
      items={groups.map((g) => ({ value: g.id, label: g.name }))}
    >
      <SelectTrigger className="w-col-md" aria-label="Target group">
        <SelectValue placeholder="Choose group" />
      </SelectTrigger>
      <SelectContent>
        {groups.map((g) => (
          <SelectItem key={g.id} value={g.id} label={g.name}>
            {g.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
