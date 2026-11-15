import { FilterSelect } from '@/app/app/_components/filter-select'
import type { GroupOption, StudentFilters } from '../types'

const ALL = '__all__'

type Item = { value: string; label: string }

const STATUS_ITEMS = [
  { value: ALL, label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

const ROLE_ITEMS = [
  { value: ALL, label: 'All' },
  { value: 'admin', label: 'Admin' },
  { value: 'instructor', label: 'Instructor' },
  { value: 'student', label: 'Student' },
]

type StudentFilterSelectProps = {
  label: string
  placeholder: string
  value: string | undefined
  items: Item[]
  className: string
  onChange: (value: string | undefined) => void
}

function StudentFilterSelect({
  label,
  placeholder,
  value,
  items,
  className,
  onChange,
}: Readonly<StudentFilterSelectProps>) {
  return (
    <FilterSelect
      value={value ?? ALL}
      items={items}
      ariaLabel={label}
      placeholder={placeholder}
      triggerClassName={className}
      onValueChange={(v) => onChange(v === ALL || v === null ? undefined : v)}
    />
  )
}

type SelectsProps = {
  filters: StudentFilters
  groups: GroupOption[]
  updateFilter: (key: string, value: string | undefined) => void
}

export function StudentFilterSelects({ filters, groups, updateFilter }: Readonly<SelectsProps>) {
  const groupItems = [
    { value: ALL, label: 'All' },
    ...groups.map((g) => ({ value: g.id, label: g.name })),
  ]
  return (
    <>
      <StudentFilterSelect
        label="Status"
        placeholder="All statuses"
        value={filters.status}
        items={STATUS_ITEMS}
        className="w-col-sm"
        onChange={(v) => updateFilter('status', v)}
      />
      <StudentFilterSelect
        label="Role"
        placeholder="All roles"
        value={filters.role}
        items={ROLE_ITEMS}
        className="w-col-sm"
        onChange={(v) => updateFilter('role', v)}
      />
      <StudentFilterSelect
        label="Group"
        placeholder="All groups"
        value={filters.group}
        items={groupItems}
        className="w-col-md"
        onChange={(v) => updateFilter('group', v)}
      />
    </>
  )
}
