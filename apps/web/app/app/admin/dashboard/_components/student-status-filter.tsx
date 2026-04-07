'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Students' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

type Props = Readonly<{
  value: string
  onChange: (value: string | null) => void
}>

export function StudentStatusFilter({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Filter:</span>
      <Select value={value} onValueChange={onChange} items={STATUS_OPTIONS}>
        <SelectTrigger className="w-40" aria-label="Student status filter">
          <SelectValue placeholder="All Students" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} label={opt.label}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
