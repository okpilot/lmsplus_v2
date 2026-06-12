'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type FilterSelectItem = { value: string; label: string }

type Props = {
  value: string
  items: FilterSelectItem[]
  ariaLabel: string
  placeholder: string
  triggerClassName: string
  disabled?: boolean
  onValueChange: (value: string | null) => void
}

export function FilterSelect({
  value,
  items,
  ariaLabel,
  placeholder,
  triggerClassName,
  disabled,
  onValueChange,
}: Readonly<Props>) {
  return (
    <Select value={value} onValueChange={onValueChange} items={items} disabled={disabled}>
      <SelectTrigger className={triggerClassName} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} label={item.label}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
